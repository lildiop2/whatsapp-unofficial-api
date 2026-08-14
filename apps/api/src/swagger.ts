export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Zap-Zap Unofficial WhatsApp API',
    version: '1.0.0',
    description:
      'API REST Multi-Tenant não-oficial do WhatsApp para gerenciamento de instâncias, envio de mensagens e automatizações com suporte a RAG (Retrieval-Augmented Generation) com Inteligência Artificial.',
  },
  servers: [
    {
      url: 'http://localhost:3002',
      description: 'Servidor de Desenvolvimento Local',
    },
  ],
  paths: {
    '/auth/register': {
      post: {
        summary: 'Registrar nova organização (Tenant) e administrador',
        tags: ['Autenticação'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'name', 'tenantName'],
                properties: {
                  email: {
                    type: 'string',
                    format: 'email',
                    example: 'admin@empresa.com',
                  },
                  password: { type: 'string', minLength: 6, example: 'senha123' },
                  name: { type: 'string', example: 'Diogo Admin' },
                  tenantName: { type: 'string', example: 'Minha Empresa SaaS' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Organização registrada com sucesso.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    token: {
                      type: 'string',
                      description: 'Token JWT para autenticação no Dashboard',
                    },
                    apiKey: {
                      type: 'string',
                      description: 'Chave de API inicial para integrações externas',
                    },
                    user: { type: 'object' },
                    tenant: { type: 'object' },
                  },
                },
              },
            },
          },
          '400': { description: 'E-mail em uso ou parâmetros ausentes.' },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Autenticar usuário do dashboard',
        tags: ['Autenticação'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'admin@demo.com' },
                  password: { type: 'string', example: 'password123' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Autenticado com sucesso. Retorna JWT Token.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string' },
                    user: { type: 'object' },
                  },
                },
              },
            },
          },
          '401': { description: 'Credenciais inválidas.' },
        },
      },
    },
    '/auth/me': {
      get: {
        summary: 'Obter perfil do usuário logado',
        tags: ['Autenticação'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Dados do perfil retornados com sucesso.' },
          '401': { description: 'Token JWT ausente ou inválido.' },
        },
      },
    },
    '/tenant/ai-config': {
      get: {
        summary: 'Obter configurações de IA/RAG do Tenant',
        tags: ['Configurações de Tenant'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Configurações retornadas com sucesso.' },
          '401': { description: 'Não autenticado.' },
        },
      },
      put: {
        summary: 'Atualizar configurações de IA/RAG do Tenant (Apenas Admin/Super Admin)',
        tags: ['Configurações de Tenant'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  aiProvider: {
                    type: 'string',
                    enum: ['gemini', 'openai', 'ollama'],
                    example: 'gemini',
                  },
                  aiApiKey: { type: 'string', example: 'AI_API_KEY_AQUI' },
                  aiBaseUrl: { type: 'string', example: 'http://localhost:11434/v1' },
                  aiChatModel: { type: 'string', example: 'gemini-1.5-flash' },
                  aiEmbeddingModel: { type: 'string', example: 'text-embedding-005' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Configurações salvas com sucesso.' },
          '403': { description: 'Permissão insuficiente.' },
        },
      },
    },
    '/tenant/api-keys': {
      get: {
        summary: 'Listar chaves de API do Tenant',
        tags: ['Configurações de Tenant'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Lista de chaves de API.' },
        },
      },
      post: {
        summary: 'Gerar nova chave de API (Apenas Admin)',
        tags: ['Configurações de Tenant'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'Integração Hubspot' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Chave criada com sucesso.' },
        },
      },
    },
    '/tenant/api-keys/{id}': {
      delete: {
        summary: 'Revogar chave de API',
        tags: ['Configurações de Tenant'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Chave excluída com sucesso.' },
        },
      },
    },
    '/tenant/logs': {
      get: {
        summary: 'Obter logs de mensagens e webhooks do Tenant',
        tags: ['Configurações de Tenant'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Logs de auditoria.' },
        },
      },
    },
    '/sessions': {
      get: {
        summary: 'Listar instâncias do Tenant',
        tags: ['Instâncias WhatsApp'],
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        responses: {
          '200': { description: 'Lista de sessões do tenant.' },
        },
      },
      post: {
        summary: 'Criar nova instância WhatsApp',
        tags: ['Instâncias WhatsApp'],
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  id: {
                    type: 'string',
                    description: 'ID único da instância (opcional)',
                    example: 'financeiro-bot',
                  },
                  name: {
                    type: 'string',
                    description: 'Nome da instância',
                    example: 'Suporte Principal',
                  },
                  phone: {
                    type: 'string',
                    description: 'Telefone para conexão via Pairing Code (se omitido, gera QR Code)',
                    example: '5511999999999',
                  },
                  webhookUrl: {
                    type: 'string',
                    format: 'uri',
                    example: 'https://api.empresa.com/callback',
                  },
                  webhookEvents: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Lista de eventos que disparam o webhook (ex: ["message", "connection"] ou ["all"])',
                    example: ['all'],
                  },
                  botEnabled: {
                    type: 'boolean',
                    description: 'Ativar ou desativar o bot de auto-resposta',
                    example: false,
                  },
                  botConfig: {
                    type: 'object',
                    description: 'Configuração do bot (simple para resposta baseada em palavra-chave, ai para assistente Gemini/Ollama)',
                    example: {
                      type: 'simple',
                      rules: [
                        { trigger: 'oi', response: 'Olá! Como posso ajudar você?' },
                        { trigger: 'ajuda', response: 'Por favor, descreva seu problema.' },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Instância criada com sucesso.' },
        },
      },
    },
    '/sessions/{id}': {
      patch: {
        summary: 'Atualizar configurações de webhook e bot da instância',
        tags: ['Instâncias WhatsApp'],
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Suporte Principal Atualizado' },
                  phone: { type: 'string', example: '5511999999999' },
                  webhookUrl: { type: 'string', format: 'uri', example: 'https://api.empresa.com/callback' },
                  webhookEvents: { type: 'array', items: { type: 'string' }, example: ['message', 'connection'] },
                  botEnabled: { type: 'boolean', example: true },
                  botConfig: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: ['simple', 'ai'], example: 'ai' },
                      prompt: { type: 'string', example: 'Você é o assistente virtual de vendas...' },
                      rules: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            trigger: { type: 'string', example: 'oi' },
                            response: { type: 'string', example: 'Olá!' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Instância atualizada com sucesso.' },
        },
      },
    },
    '/sessions/{id}/status': {
      get: {
        summary: 'Obter status de pareamento e conexão',
        tags: ['Instâncias WhatsApp'],
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Status da sessão e QR Code se PAIRING_REQUIRED.' },
        },
      },
    },
    '/sessions/{id}/disconnect': {
      post: {
        summary: 'Desconectar temporariamente a instância do WhatsApp',
        tags: ['Instâncias WhatsApp'],
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Sessão desconectada com sucesso.' },
        },
      },
    },
    '/sessions/{id}/logout': {
      post: {
        summary: 'Remover credenciais e desvincular a instância do WhatsApp',
        tags: ['Instâncias WhatsApp'],
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Logout efetuado com sucesso.' },
        },
      },
    },
    '/messages/send': {
      post: {
        summary: 'Enviar mensagem do WhatsApp',
        description: 'Permite enviar mensagens de texto simples, mídias baixadas automaticamente pelo servidor (imagens, vídeos, áudios, documentos, figurinhas), simular presença humana (digitando/gravando) e enviar mensagens interativas avançadas suportadas pela SDK.',
        tags: ['Mensagens'],
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId', 'to'],
                properties: {
                  sessionId: { 
                    type: 'string', 
                    description: 'ID da sessão/instância do WhatsApp',
                    example: 'financeiro-bot' 
                  },
                  to: {
                    type: 'string',
                    description: 'Número de telefone do destinatário com DDI + DDD (apenas dígitos ou JID completo)',
                    example: '5511999999999',
                  },
                  text: {
                    type: 'string',
                    description: 'Conteúdo textual da mensagem (obrigatório se mediaUrl não for fornecido)',
                    example: 'Olá, esta é uma mensagem de texto!',
                  },
                  mediaUrl: {
                    type: 'string',
                    format: 'uri',
                    description: 'URL pública da mídia a ser enviada. O servidor fará o download automático antes do envio.',
                    example: 'https://exemplo.com/imagem.png',
                  },
                  mediaType: {
                    type: 'string',
                    enum: ['image', 'video', 'audio', 'document', 'sticker'],
                    description: 'Tipo de mídia a ser enviada',
                    example: 'image',
                  },
                  fileName: {
                    type: 'string',
                    description: 'Nome personalizado do arquivo (apenas para documentos)',
                    example: 'Fatura_Novembro.pdf',
                  },
                  caption: {
                    type: 'string',
                    description: 'Legenda opcional para mídias (imagens/vídeos)',
                    example: 'Confira nosso novo produto!',
                  },
                  mimetype: {
                    type: 'string',
                    description: 'Tipo MIME do arquivo',
                    example: 'image/png',
                  },
                  presenceDelay: {
                    type: 'integer',
                    description: 'Tempo em milissegundos para simular status de presença humana antes do envio',
                    example: 2000,
                  },
                  presenceType: {
                    type: 'string',
                    enum: ['composing', 'recording', 'paused'],
                    description: 'Tipo de status de presença a simular (composing = digitando, recording = gravando áudio)',
                    example: 'composing',
                  },
                },
              },
              examples: {
                textMessage: {
                  summary: 'Mensagem de Texto Simples',
                  value: {
                    sessionId: 'financeiro-bot',
                    to: '5511999999999',
                    text: 'Olá, esta é uma mensagem de texto simples!',
                  },
                },
                imageMessage: {
                  summary: 'Mensagem de Imagem com Legenda',
                  value: {
                    sessionId: 'financeiro-bot',
                    to: '5511999999999',
                    mediaUrl: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809',
                    mediaType: 'image',
                    caption: 'Confira nosso banner promocional!',
                    mimetype: 'image/jpeg',
                  },
                },
                documentMessage: {
                  summary: 'Mensagem de Documento (PDF)',
                  value: {
                    sessionId: 'financeiro-bot',
                    to: '5511999999999',
                    mediaUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
                    mediaType: 'document',
                    fileName: 'Contrato_Assinado.pdf',
                    mimetype: 'application/pdf',
                  },
                },
                presenceSimulation: {
                  summary: 'Envio Simulando Digitação Humana',
                  value: {
                    sessionId: 'financeiro-bot',
                    to: '5511999999999',
                    text: 'Olá! Desculpe a demora. Como posso ajudar?',
                    presenceDelay: 3500,
                    presenceType: 'composing',
                  },
                },
                reactionMessage: {
                  summary: 'Reação a Mensagem (Reaction)',
                  value: {
                    sessionId: 'financeiro-bot',
                    to: '5511999999999',
                    text: '', // Deixar vazio ou ocultar para enviar apenas a reação
                    reaction: {
                      type: 'reaction',
                      emoji: '👍',
                      target: {
                        id: '3EB0C34B9C894A2D',
                        fromMe: false,
                        remoteJid: '5511999999999@s.whatsapp.net',
                      },
                    },
                  },
                },
                pollMessage: {
                  summary: 'Criar Enquete (Poll)',
                  value: {
                    sessionId: 'financeiro-bot',
                    to: '5511999999999',
                    poll: {
                      type: 'poll',
                      name: 'Qual o melhor horário para nossa reunião?',
                      options: ['09:00', '14:00', '17:00'],
                      selectableCount: 1,
                    },
                  },
                },
                eventMessage: {
                  summary: 'Agendar Evento (Event)',
                  value: {
                    sessionId: 'financeiro-bot',
                    to: '5511999999999',
                    event: {
                      type: 'event',
                      name: 'Apresentação do Projeto',
                      description: 'Reunião geral com a equipe de engenharia',
                      startTime: 1786712226,
                      endTime: 1786715826,
                      location: {
                        latitude: -23.55052,
                        longitude: -46.633308,
                        name: 'Escritório São Paulo',
                        address: 'Av. Paulista, 1000',
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Mensagem enviada com sucesso.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    messageId: { type: 'string', example: '3EB0C34B9C894A2D' },
                    result: { type: 'object' },
                  },
                },
              },
            },
          },
          '400': { description: 'Parâmetros inválidos ou download de mídia falhou.' },
          '444': { description: 'Sessão desconectada ou inexistente.' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Insira o token JWT de usuário obtido no login.',
      },
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: "Insira a chave de API gerada no tenant com prefixo 'zap_'.",
      },
    },
  },
};
