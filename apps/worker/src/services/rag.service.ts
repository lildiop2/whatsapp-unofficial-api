import { GoogleGenerativeAI } from '@google/generative-ai';
import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import { StateGraph, Annotation } from '@langchain/langgraph';
import crypto from 'node:crypto';
import pino from 'pino';
import { prisma } from './prisma.service.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
});

interface TenantAiConfig {
  aiProvider: 'gemini' | 'openai' | 'ollama';
  aiApiKey?: string | null;
  aiBaseUrl?: string | null;
  aiChatModel?: string | null;
  aiEmbeddingModel?: string | null;
}

class RagService {
  /**
   * Obtém as configurações de IA/RAG do Tenant associado à sessão do WhatsApp,
   * aplicando fallback para as variáveis de ambiente caso o Tenant não as tenha personalizado.
   */
  private async getTenantConfig(sessionId: string): Promise<TenantAiConfig> {
    try {
      const session = await prisma.whatsappSession.findUnique({
        where: { id: sessionId },
        include: { tenant: true },
      });

      const tenant = session?.tenant;

      // Determinar provedor
      const aiProvider = (tenant?.aiProvider || process.env.AI_PROVIDER || 'ollama') as
        'gemini' | 'openai' | 'ollama';

      // Carregar chaves correspondentes
      let aiApiKey = tenant?.aiApiKey;
      if (!aiApiKey) {
        aiApiKey = aiProvider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.AI_API_KEY;
      }

      // Carregar URL base e modelos
      const aiBaseUrl = tenant?.aiBaseUrl || process.env.AI_BASE_URL;
      const aiChatModel = tenant?.aiChatModel || process.env.AI_CHAT_MODEL;
      const aiEmbeddingModel = tenant?.aiEmbeddingModel || process.env.AI_EMBEDDING_MODEL;

      return {
        aiProvider,
        aiApiKey,
        aiBaseUrl,
        aiChatModel,
        aiEmbeddingModel,
      };
    } catch (err: any) {
      logger.error(
        err,
        `Erro ao obter configurações de IA para sessão ${sessionId}. Usando padrões globais.`,
      );
      return {
        aiProvider: (process.env.AI_PROVIDER || 'ollama') as any,
        aiApiKey:
          process.env.AI_PROVIDER === 'gemini'
            ? process.env.GEMINI_API_KEY
            : process.env.AI_API_KEY,
        aiBaseUrl: process.env.AI_BASE_URL,
        aiChatModel: process.env.AI_CHAT_MODEL,
        aiEmbeddingModel: process.env.AI_EMBEDDING_MODEL,
      };
    }
  }

  /**
   * Gera vetores de embedding dinamicamente de acordo com as configurações do Tenant.
   */
  async generateEmbedding(text: string, sessionId: string): Promise<number[]> {
    const config = await this.getTenantConfig(sessionId);

    try {
      if (config.aiProvider === 'gemini') {
        const apiKey = config.aiApiKey;
        if (!apiKey) {
          throw new Error('GEMINI_API_KEY não configurada para o Tenant ou Global.');
        }
        const genAI = new GoogleGenerativeAI(apiKey);
        const modelName = config.aiEmbeddingModel || 'text-embedding-005';
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.embedContent(text);
        if (!result.embedding?.values) {
          throw new Error('Retorno de embedding vazio do modelo Gemini.');
        }
        return result.embedding.values;
      } else if (config.aiProvider === 'openai') {
        const apiKey = config.aiApiKey;
        if (!apiKey) {
          throw new Error('OpenAI API Key não configurada para o Tenant ou Global.');
        }
        const embeddingModel = config.aiEmbeddingModel || 'text-embedding-3-small';
        const isText3 = embeddingModel.includes('text-embedding-3');
        const embeddings = new OpenAIEmbeddings({
          openAIApiKey: apiKey,
          configuration: {
            baseURL: config.aiBaseUrl || undefined,
          },
          modelName: embeddingModel,
          dimensions: isText3 ? 768 : undefined,
        });
        return await embeddings.embedQuery(text);
      } else if (config.aiProvider === 'ollama') {
        const baseURL = config.aiBaseUrl || 'http://localhost:11434/v1';
        const apiKey = config.aiApiKey || 'ollama';
        const embeddings = new OpenAIEmbeddings({
          openAIApiKey: apiKey,
          configuration: {
            baseURL,
          },
          modelName: config.aiEmbeddingModel || 'nomic-embed-text',
        });
        return await embeddings.embedQuery(text);
      }
      throw new Error(`Provedor de embedding inválido ou não suportado: ${config.aiProvider}`);
    } catch (err) {
      logger.error(
        err,
        `Erro ao gerar embedding no provedor ${config.aiProvider} para a sessão ${sessionId}`,
      );
      throw err;
    }
  }

  /**
   * Salva a mensagem e seu vetor de embedding no pgvector (banco PostgreSQL).
   */
  async saveMessageEmbedding(
    sessionId: string,
    messageId: string,
    sender: string,
    content: string,
  ): Promise<void> {
    try {
      const embedding = await this.generateEmbedding(content, sessionId);
      const embeddingStr = `[${embedding.join(',')}]`;
      const id = crypto.randomUUID();

      await prisma.$executeRawUnsafe(
        `
        INSERT INTO "MessageEmbedding" (id, "sessionId", "messageId", sender, content, embedding)
        VALUES ($1, $2, $3, $4, $5, $6::vector)
        ON CONFLICT ("messageId") DO UPDATE
        SET content = EXCLUDED.content, embedding = EXCLUDED.embedding;
        `,
        id,
        sessionId,
        messageId,
        sender,
        content,
        embeddingStr,
      );

      logger.debug(`Embedding gravado no pgvector para a mensagem ${messageId}`);
    } catch (err) {
      logger.error(err, `Falha ao salvar embedding para a mensagem ${messageId}`);
    }
  }

  /**
   * Busca mensagens semelhantes no banco usando a métrica de distância cosseno de pgvector.
   */
  async searchSimilarMessages(
    sessionId: string,
    query: string,
    limit = 3,
  ): Promise<Array<{ content: string; sender: string; distance: number }>> {
    try {
      const embedding = await this.generateEmbedding(query, sessionId);
      const embeddingStr = `[${embedding.join(',')}]`;

      const results = await prisma.$queryRawUnsafe<any[]>(
        `
        SELECT content, sender,
               (embedding <=> $1::vector) as distance
        FROM "MessageEmbedding"
        WHERE "sessionId" = $2
        ORDER BY distance ASC
        LIMIT $3;
        `,
        embeddingStr,
        sessionId,
        limit,
      );

      return results.map(r => ({
        content: r.content,
        sender: r.sender,
        distance: Number(r.distance),
      }));
    } catch (err) {
      logger.error(err, 'Erro ao pesquisar mensagens semelhantes no pgvector');
      return [];
    }
  }

  /**
   * Executa a IA com Langgraph baseado no histórico semântico recuperado (RAG) e regras do Tenant.
   */
  async runAgent(sessionId: string, incomingMessage: string): Promise<string> {
    const config = await this.getTenantConfig(sessionId);

    try {
      // 1. Definir o Estado do Grafo do Langgraph
      const AgentState = Annotation.Root({
        sessionId: Annotation<string>(),
        incomingMessage: Annotation<string>(),
        context: Annotation<string>(),
        reply: Annotation<string>(),
      });

      // 2. Nó de Recuperação de Dados (Retrieval / RAG)
      const retrieveNode = async (state: typeof AgentState.State) => {
        const matches = await this.searchSimilarMessages(state.sessionId, state.incomingMessage, 3);
        const formattedContext = matches.map(m => `- [De: ${m.sender}]: "${m.content}"`).join('\n');
        return { context: formattedContext };
      };

      // 3. Nó de Geração da Resposta (Generation)
      const generateNode = async (state: typeof AgentState.State) => {
        const prompt = `
Você é um atendente inteligente e prestativo de suporte automatizado no WhatsApp.
O usuário enviou a mensagem: "${state.incomingMessage}".

Abaixo está o histórico de mensagens semelhantes encontradas no banco de dados para contexto (RAG):
${state.context || '(Nenhum histórico encontrado)'}

Instruções:
- Responda de forma direta, clara e curta (tamanho apropriado para WhatsApp).
- Utilize o contexto anterior se ele ajudar a responder à pergunta do cliente.
- Se não souber a resposta ou não houver contexto útil, seja empático e diga que irá transferir para um atendente humano.
- Não invente informações fictícias.

Resposta do Assistente:
`;

        let replyText = '';

        if (config.aiProvider === 'gemini') {
          const apiKey = config.aiApiKey;
          if (!apiKey) throw new Error('GEMINI_API_KEY não configurada.');
          const genAI = new GoogleGenerativeAI(apiKey);
          const modelName = config.aiChatModel || 'gemini-1.5-flash';
          const model = genAI.getGenerativeModel({ model: modelName });
          const responseResult = await model.generateContent(prompt);
          replyText = responseResult.response.text()?.trim() || '';
        } else if (config.aiProvider === 'openai') {
          const apiKey = config.aiApiKey;
          if (!apiKey) throw new Error('OpenAI API Key não configurada.');
          const chat = new ChatOpenAI({
            openAIApiKey: apiKey,
            configuration: {
              baseURL: config.aiBaseUrl || undefined,
            },
            modelName: config.aiChatModel || 'gpt-4o-mini',
            temperature: 0.3,
          });
          const response = await chat.invoke(prompt);
          replyText = (
            typeof response.content === 'string'
              ? response.content
              : JSON.stringify(response.content)
          ).trim();
        } else if (config.aiProvider === 'ollama') {
          const baseURL = config.aiBaseUrl || 'http://localhost:11434/v1';
          const apiKey = config.aiApiKey || 'ollama';
          const chat = new ChatOpenAI({
            openAIApiKey: apiKey,
            configuration: {
              baseURL,
            },
            modelName: config.aiChatModel || 'llama3',
            temperature: 0.3,
          });
          const response = await chat.invoke(prompt);
          replyText = (
            typeof response.content === 'string'
              ? response.content
              : JSON.stringify(response.content)
          ).trim();
        }

        return { reply: replyText };
      };

      // 4. Compilar e Conectar o Grafo
      const workflow = new StateGraph(AgentState)
        .addNode('retrieve', retrieveNode)
        .addNode('generate', generateNode)
        .addEdge('__start__', 'retrieve')
        .addEdge('retrieve', 'generate')
        .addEdge('generate', '__end__');

      const app = workflow.compile();

      // 5. Executar o fluxo
      const finalState = await app.invoke({
        sessionId,
        incomingMessage,
        context: '',
        reply: '',
      });

      return finalState.reply || 'Desculpe, não consegui processar a resposta.';
    } catch (err: any) {
      logger.error(err, `Erro durante execução do agente RAG Langgraph para a sessão ${sessionId}`);
      return 'Desculpe, ocorreu um erro interno ao processar a resposta.';
    }
  }
}

export const ragService = new RagService();
export default ragService;
