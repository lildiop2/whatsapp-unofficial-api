import { WaClient, createStore, PinoLogger } from 'zapo-js';
import {
  createPostgresStore,
  ensurePgMigrations,
  type WaPgMigrationDomain,
} from '@zapo-js/store-postgres';
import { Pool } from 'pg';
import pino from 'pino';
import pRetry from 'p-retry';
import { prisma } from './prisma.service.js';
import { SessionStatus } from '@zap/shared';
import { queueService } from './queue.service.js';
import { storageService } from './storage.service.js';
import { createMediaProcessor } from '@zapo-js/media-utils';

const mediaProcessor = createMediaProcessor();

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: null,
  timestamp: false,
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          targets: [
            {
              target: 'pino-pretty',
              options: { destination: 1 },
              level: process.env.LOG_LEVEL || 'info',
            },
            {
              target: 'pino-roll',
              options: {
                file: './logs/zapo',
                frequency: 'daily',
                size: '10m',
                mkdir: true,
              },
              level: process.env.LOG_LEVEL || 'info',
            },
          ],
        }
      : undefined,
});

class ZapoSessionManager {
  private clients = new Map<string, WaClient>();
  private sessionQrs = new Map<string, string>();
  private sessionPairingCodes = new Map<string, string>();
  private pgPool: Pool | null = null;

  constructor() {
    // Inicializar pool de conexões com o PostgreSQL
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL não configurado.');
    }
    this.pgPool = new Pool({ connectionString: dbUrl });
  }

  /**
   * Inicializa e conecta todas as sessões ativas do banco de dados na inicialização da API
   */
  async bootstrapSessions() {
    try {
      const activeSessions = await prisma.whatsappSession.findMany({
        where: {
          status: {
            in: ['CONNECTED', 'CONNECTING', 'PAIRING_REQUIRED'],
          },
        },
      });

      logger.info(`Restaurando ${activeSessions.length} sessões ativas do WhatsApp...`);

      for (const session of activeSessions) {
        // Inicializar cada sessão em background sem bloquear o boot
        this.initSession(session.id).catch(err => {
          logger.error(err, `Falha ao restaurar sessão: ${session.id}`);
        });
      }
    } catch (err) {
      logger.error(err, 'Erro durante o bootstrap das sessões');
    }
  }

  /**
   * Inicializa uma sessão WhatsApp específica por sessionId
   */
  async initSession(sessionId: string) {
    if (this.clients.has(sessionId)) {
      logger.warn(`Sessão ${sessionId} já está inicializada.`);
      return this.clients.get(sessionId)!;
    }

    logger.info(`Inicializando sessão: ${sessionId}`);

    // Atualizar status no banco de dados para CONNECTING
    await this.updateSessionStatus(sessionId, 'CONNECTING');

    // 1. Executar migrações do banco do Zapo para garantir a existência das tabelas
    const migrationDomains: WaPgMigrationDomain[] = [
      'auth',
      'signal',
      'senderKey',
      'appState',
      'retry',
      'mailbox',
      'participants',
      'deviceList',
      'privacyToken',
      'messageSecret',
      'chatMetadata',
    ];
    await ensurePgMigrations(this.pgPool!, migrationDomains, 'wa_');

    // 2. Configurar o banco de persistência do Zapo utilizando o PostgreSQL
    const pgStore = createPostgresStore({
      pool: this.pgPool!,
      tablePrefix: 'wa_',
    });

    const store = createStore({
      backends: {
        postgres: pgStore,
      },
      providers: {
        auth: 'postgres',
        signal: 'postgres',
        preKey: 'postgres',
        session: 'postgres',
        identity: 'postgres',
        senderKey: 'postgres',
        appState: 'postgres',
        privacyToken: 'postgres',
        messages: 'postgres',
        threads: 'postgres',
        contacts: 'postgres',
      },
    });

    // 2. Instanciar o cliente do Zapo
    const client = new WaClient(
      {
        store,
        sessionId,
        // Recuperar de versões desatualizadas de forma automática
        recoverFromClientTooOld: true,
        media: {
          processor: mediaProcessor,
        },
      },
      new PinoLogger(logger.child({ sessionId }) as any, (process.env.LOG_LEVEL as any) || 'info'),
    );

    this.clients.set(sessionId, client);

    // 3. Vincular os manipuladores de eventos do cliente
    this.setupEventListeners(sessionId, client);

    // 4. Executar conexão com retry resiliente
    await this.connectWithRetry(sessionId, client);

    return client;
  }

  /**
   * Configura os listeners de eventos essenciais do WaClient
   */
  private setupEventListeners(sessionId: string, client: WaClient) {
    const handlePairingTrigger = async () => {
      try {
        const session = await prisma.whatsappSession.findUnique({
          where: { id: sessionId },
        });

        if (session && session.phone) {
          if (this.sessionPairingCodes.has(sessionId)) {
            logger.debug(`Pairing Code já gerado para a sessão ${sessionId}`);
            return;
          }
          logger.info(`Requisitando Pairing Code para o número ${session.phone}...`);
          const code = await client.auth.requestPairingCode(session.phone);
          logger.info(`Pairing Code gerado com sucesso: ${code}`);
          this.sessionPairingCodes.set(sessionId, code);
          await prisma.whatsappSession.updateMany({
            where: { id: sessionId },
            data: {
              pairingCode: code,
              status: 'PAIRING_REQUIRED',
            },
          });
        } else {
          await this.updateSessionStatus(sessionId, 'PAIRING_REQUIRED');
        }
      } catch (err: any) {
        logger.error(err, `Erro ao processar Pairing Code para a sessão ${sessionId}`);
        await this.updateSessionStatus(sessionId, 'PAIRING_REQUIRED');
      }
    };

    // Escutar por QRs para emparelhamento
    client.on('auth_qr', ({ qr }) => {
      logger.info(`Novo QR Code disponível para a sessão ${sessionId}`);
      this.sessionQrs.set(sessionId, qr);
      handlePairingTrigger().catch(() => {});
    });

    // Escutar por necessidade de emparelhamento por código (Link Code)
    client.on('auth_pairing_required', ({ forceManual }) => {
      logger.info(`Pairing Code requerido para a sessão ${sessionId}. ForceManual: ${forceManual}`);
      handlePairingTrigger().catch(() => {});
    });

    // Escutar por geração do pairing code
    client.on('auth_pairing_code', async ({ code }) => {
      logger.info(`Pairing Code gerado via evento para a sessão ${sessionId}: ${code}`);
      this.sessionPairingCodes.set(sessionId, code);
      await prisma.whatsappSession.updateMany({
        where: { id: sessionId },
        data: { pairingCode: code },
      });
    });

    // Escutar por sucesso de emparelhamento
    client.on('auth_paired', async ({ credentials }) => {
      const meJid = credentials?.meJid;
      logger.info(`Sessão ${sessionId} emparelhada com sucesso para o JID: ${meJid}`);
      this.sessionQrs.delete(sessionId);
      this.sessionPairingCodes.delete(sessionId);

      const phone = meJid ? meJid.split('@')[0] : null;
      await prisma.whatsappSession.updateMany({
        where: { id: sessionId },
        data: {
          phone,
          meJid,
          pairingCode: null,
          status: 'CONNECTED',
        },
      });
    });

    // Escutar por mudanças de status de conexão
    client.on('connection', async event => {
      if (event.status === 'open') {
        logger.info(`Conexão aberta com sucesso para a sessão ${sessionId}`);
        this.sessionQrs.delete(sessionId);
        this.sessionPairingCodes.delete(sessionId);

        // Recuperar informações adicionais da sessão ao logar
        const credentials = client.getCredentials();
        const meJid = credentials?.meJid || null;
        const phone = meJid ? meJid.split('@')[0] : null;

        await prisma.whatsappSession.updateMany({
          where: { id: sessionId },
          data: {
            status: 'CONNECTED',
            meJid,
            phone,
            pairingCode: null,
          },
        });

        queueService
          .publishWebhook(sessionId, 'connection', {
            status: 'CONNECTED',
            phone,
            meJid,
          })
          .catch(() => {});
      } else if (event.status === 'close') {
        logger.warn(
          `Conexão fechada para a sessão ${sessionId}. Motivo: ${event.reason}, Logout: ${event.isLogout}`,
        );

        if (event.isLogout) {
          logger.error(`Sessão ${sessionId} foi desvinculada pelo usuário. Limpando dados...`);
          this.sessionQrs.delete(sessionId);
          this.sessionPairingCodes.delete(sessionId);
          this.clients.delete(sessionId);
          await prisma.whatsappSession.updateMany({
            where: { id: sessionId },
            data: {
              status: 'DISCONNECTED',
              phone: null,
              meJid: null,
              pairingCode: null,
            },
          });
          queueService
            .publishWebhook(sessionId, 'connection', { status: 'DISCONNECTED', isLogout: true })
            .catch(() => {});
        } else {
          // Desconexão temporária: o loop de retry cuidará disso
          await this.updateSessionStatus(sessionId, 'CONNECTING');
          queueService
            .publishWebhook(sessionId, 'connection', { status: 'CONNECTING' })
            .catch(() => {});
        }
      }
    });

    // Escutar por novas mensagens recebidas
    client.on('message', async event => {
      logger.debug(`Nova mensagem recebida na sessão ${sessionId} de ${event.key.remoteJid}`);

      // Se a mensagem contiver mídia, baixa e salva no storage configurado (S3/MinIO ou local)
      const getMessageMedia = (message: any) => {
        if (!message) return null;
        if (message.imageMessage) return { type: 'image', msg: message.imageMessage };
        if (message.videoMessage) return { type: 'video', msg: message.videoMessage };
        if (message.audioMessage) return { type: 'audio', msg: message.audioMessage };
        if (message.documentMessage) return { type: 'document', msg: message.documentMessage };
        if (message.stickerMessage) return { type: 'sticker', msg: message.stickerMessage };
        return null;
      };

      const mediaNode = getMessageMedia(event.message);
      if (mediaNode) {
        try {
          logger.info(`Mensagem com mídia do tipo [${mediaNode.type}] detectada. Baixando arquivo...`);
          const bytes = await client.message.downloadBytes(event);
          const buffer = Buffer.from(bytes);
          const filename = mediaNode.msg.fileName || `media_${Date.now()}`;
          const mimetype = mediaNode.msg.mimetype || 'application/octet-stream';
          const publicUrl = await storageService.saveFile(buffer, filename, mimetype);

          // Adiciona referência da URL no payload principal do webhook e na estrutura interna
          (event as any).mediaUrl = publicUrl;
          if (mediaNode.msg) {
            mediaNode.msg.url = publicUrl;
          }
          logger.info(`Mídia salva com sucesso: ${publicUrl}`);
        } catch (err: any) {
          logger.error(err, `Falha ao baixar/salvar mídia da mensagem na sessão ${sessionId}`);
        }
      }

      queueService.publishWebhook(sessionId, 'message', event).catch(err => {
        logger.error(err, `Falha ao enfileirar mensagem recebida na sessão ${sessionId}`);
      });
    });
  }

  /**
   * Implementação de loop de reconexão resiliente com p-retry (backoff exponencial)
   */
  private async connectWithRetry(sessionId: string, client: WaClient) {
    const connectTask = async () => {
      logger.info(`Tentando conectar sessão ${sessionId}...`);
      await client.connect();
    };

    try {
      await pRetry(connectTask, {
        retries: 5,
        factor: 2,
        minTimeout: 2000,
        maxTimeout: 30020,
        onFailedAttempt: error => {
          logger.warn(
            `Falha na tentativa de conexão para ${sessionId}. Erro: ${error.message}. Tentando novamente...`,
          );
        },
      });
    } catch (err: any) {
      logger.error(err, `Todas as tentativas de conexão falharam para a sessão ${sessionId}`);
      await this.updateSessionStatus(sessionId, 'DISCONNECTED');
    }
  }

  /**
   * Atualiza o status da sessão no banco de dados Prisma
   */
  private async updateSessionStatus(sessionId: string, status: SessionStatus) {
    try {
      await prisma.whatsappSession.updateMany({
        where: { id: sessionId },
        data: { status },
      });
      logger.debug(`Status da sessão ${sessionId} atualizado para ${status} no banco de dados.`);
    } catch (err) {
      logger.error(err, `Erro ao atualizar status da sessão ${sessionId} no banco`);
    }
  }

  /**
   * Retorna o cliente ativo
   */
  getClient(sessionId: string): WaClient | undefined {
    return this.clients.get(sessionId);
  }

  /**
   * Retorna o QR Code ativo da sessão para exibição no painel
   */
  getSessionQr(sessionId: string): string | undefined {
    return this.sessionQrs.get(sessionId);
  }

  /**
   * Retorna o Pairing Code ativo da sessão para exibição no painel
   */
  getSessionPairingCode(sessionId: string): string | undefined {
    return this.sessionPairingCodes.get(sessionId);
  }

  /**
   * Desconecta graciosamente uma sessão mantendo as credenciais
   */
  async disconnectSession(sessionId: string) {
    const client = this.clients.get(sessionId);
    if (!client) return;

    logger.info(`Desconectando graciosamente sessão ${sessionId}...`);
    try {
      await client.disconnect();
    } catch (err) {
      logger.error(err, `Erro ao desconectar sessão ${sessionId}`);
    } finally {
      this.clients.delete(sessionId);
      this.sessionQrs.delete(sessionId);
      this.sessionPairingCodes.delete(sessionId);
      await this.updateSessionStatus(sessionId, 'DISCONNECTED');
    }
  }

  /**
   * Executa logout definitivo da sessão no WhatsApp e limpa dados
   */
  async logoutSession(sessionId: string) {
    const client = this.clients.get(sessionId);
    if (!client) return;

    logger.info(`Executando logout completo da sessão ${sessionId}...`);
    try {
      await client.logout();
    } catch (err) {
      logger.error(err, `Erro ao executar logout na sessão ${sessionId}`);
    } finally {
      this.clients.delete(sessionId);
      this.sessionQrs.delete(sessionId);
      this.sessionPairingCodes.delete(sessionId);
      await prisma.whatsappSession.update({
        where: { id: sessionId },
        data: {
          status: 'DISCONNECTED',
          phone: null,
          meJid: null,
          pairingCode: null,
        },
      });
    }
  }

  /**
   * Encerra todas as sessões ativas (utilizado no shutdown da aplicação)
   */
  async shutdown() {
    logger.info('Encerrando gerenciador de sessões...');
    const disconnectPromises: Promise<void>[] = [];
    for (const [sessionId] of this.clients) {
      disconnectPromises.push(this.disconnectSession(sessionId));
    }
    await Promise.all(disconnectPromises);
    if (this.pgPool) {
      await this.pgPool.end();
    }
  }
}

export const zapoSessionManager = new ZapoSessionManager();
export default zapoSessionManager;
