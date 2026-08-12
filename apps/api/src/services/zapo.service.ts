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

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
});

class ZapoSessionManager {
  private clients = new Map<string, WaClient>();
  private sessionQrs = new Map<string, string>();
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
    // Escutar por QRs para emparelhamento
    client.on('auth_qr', ({ qr }) => {
      logger.info(`Novo QR Code disponível para a sessão ${sessionId}`);
      this.sessionQrs.set(sessionId, qr);
      this.updateSessionStatus(sessionId, 'PAIRING_REQUIRED');
    });

    // Escutar por sucesso de emparelhamento
    client.on('auth_paired', ({ credentials }) => {
      logger.info(`Sessão ${sessionId} emparelhada com sucesso para o JID: ${credentials.meJid}`);
      this.sessionQrs.delete(sessionId);
    });

    // Escutar por mudanças de status de conexão
    client.on('connection', async event => {
      if (event.status === 'open') {
        logger.info(`Conexão aberta com sucesso para a sessão ${sessionId}`);
        this.sessionQrs.delete(sessionId);
        await this.updateSessionStatus(sessionId, 'CONNECTED');
      } else if (event.status === 'close') {
        logger.warn(
          `Conexão fechada para a sessão ${sessionId}. Motivo: ${event.reason}, Logout: ${event.isLogout}`,
        );

        if (event.isLogout) {
          logger.error(`Sessão ${sessionId} foi desvinculada pelo usuário. Limpando dados...`);
          this.sessionQrs.delete(sessionId);
          this.clients.delete(sessionId);
          await this.updateSessionStatus(sessionId, 'DISCONNECTED');
        } else {
          // Desconexão temporária: o loop de retry cuidará disso
          await this.updateSessionStatus(sessionId, 'CONNECTING');
        }
      }
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
        maxTimeout: 30000,
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
      await prisma.whatsappSession.update({
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
      await this.updateSessionStatus(sessionId, 'DISCONNECTED');
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
