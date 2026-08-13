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
      url: 'http://localhost:3000',
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
                  webhookUrl: {
                    type: 'string',
                    format: 'uri',
                    example: 'https://api.empresa.com/callback',
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
        summary: 'Enviar mensagem de texto do WhatsApp',
        tags: ['Mensagens'],
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId', 'to', 'text'],
                properties: {
                  sessionId: { type: 'string', example: 'default-tenant-uuid' },
                  to: {
                    type: 'string',
                    description: 'Número do destinatário com DDI e DDD',
                    example: '5511999999999',
                  },
                  text: {
                    type: 'string',
                    example: 'Olá, esta é uma mensagem automatizada da API!',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Mensagem enfileirada para envio.' },
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
