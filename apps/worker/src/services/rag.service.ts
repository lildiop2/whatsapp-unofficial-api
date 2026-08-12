import { GoogleGenerativeAI } from '@google/generative-ai';
import { StateGraph, Annotation } from '@langchain/langgraph';
import crypto from 'node:crypto';
import pino from 'pino';
import { prisma } from './prisma.service.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
});

class RagService {
  private genAI: GoogleGenerativeAI | null = null;
  private isInitialized = false;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.warn(
        '⚠️ GEMINI_API_KEY não configurada. O serviço de IA/RAG estará desativado ou operando de forma limitada.',
      );
      return;
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.isInitialized = true;
  }

  /**
   * Gera vetores de embedding usando o modelo text-embedding-005 do Gemini.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isInitialized || !this.genAI) {
      throw new Error('Serviço RAG não inicializado (GEMINI_API_KEY ausente).');
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'text-embedding-005' });
      const result = await model.embedContent(text);
      if (!result.embedding?.values) {
        throw new Error('Retorno de embedding vazio do modelo Gemini.');
      }
      return result.embedding.values;
    } catch (err) {
      logger.error(err, 'Erro ao gerar embedding com Gemini');
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
    if (!this.isInitialized) return;

    try {
      const embedding = await this.generateEmbedding(content);
      const embeddingStr = `[${embedding.join(',')}]`;
      const id = crypto.randomUUID();

      // Inserção SQL Injection segura usando parâmetros
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
    if (!this.isInitialized) return [];

    try {
      const embedding = await this.generateEmbedding(query);
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
   * Executa a IA com Langgraph baseado no histórico semântico recuperado (RAG).
   */
  async runAgent(sessionId: string, incomingMessage: string): Promise<string> {
    if (!this.isInitialized || !this.genAI) {
      return 'IA temporariamente indisponível (chave ausente).';
    }

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
        const model = this.genAI!.getGenerativeModel({ model: 'gemini-1.5-flash' });

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

        const responseResult = await model.generateContent(prompt);
        const replyText = responseResult.response.text()?.trim() || '';

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
      logger.error(err, 'Erro durante execução do agente RAG Langgraph');
      return 'Desculpe, ocorreu um erro interno ao processar a resposta.';
    }
  }
}

export const ragService = new RagService();
export default ragService;
