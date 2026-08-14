import amqp from 'amqplib';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: null,
  timestamp: false,
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
});

class QueueService {
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private readonly queueName = 'zap-webhooks';
  private readonly dlxExchange = 'zap-webhooks-dlx';
  private readonly dlxQueue = 'zap-webhooks-retry';

  async connect() {
    const rabbitUrl = process.env.RABBITMQ_URL;
    if (!rabbitUrl) {
      throw new Error('RABBITMQ_URL não configurado.');
    }

    try {
      const conn = await amqp.connect(rabbitUrl);
      const ch = await conn.createChannel();

      this.connection = conn;
      this.channel = ch;

      // 1. Assert DLX Exchange e Fila de Retry com TTL (10 segundos)
      await ch.assertExchange(this.dlxExchange, 'direct', { durable: true });
      await ch.assertQueue(this.dlxQueue, {
        durable: true,
        arguments: {
          'x-message-ttl': 10000, // 10 segundos
          'x-dead-letter-exchange': '', // Default exchange
          'x-dead-letter-routing-key': this.queueName, // Roteia de volta para a principal
        },
      });
      await ch.bindQueue(this.dlxQueue, this.dlxExchange, 'retry');

      // 2. Assert Fila Principal configurada para enviar mensagens mortas para a DLX
      await ch.assertQueue(this.queueName, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': this.dlxExchange,
          'x-dead-letter-routing-key': 'retry', // Rota para cair na fila de retry
        },
      });

      logger.info('RabbitMQ inicializado e filas/DLX configurados com sucesso.');
    } catch (err) {
      logger.error(err, 'Falha ao conectar no RabbitMQ');
      throw err;
    }
  }

  /**
   * Publica um evento de webhook para a fila principal do RabbitMQ
   */
  async publishWebhook(sessionId: string, event: string, payload: any) {
    if (!this.channel) {
      logger.warn('Canal RabbitMQ não estabelecido. Tentando conectar...');
      await this.connect();
    }

    const message = {
      sessionId,
      event,
      payload,
      timestamp: new Date().toISOString(),
      attempts: 0, // Contador de tentativas
    };

    const buffer = Buffer.from(JSON.stringify(message));
    this.channel!.sendToQueue(this.queueName, buffer, { persistent: true });
    logger.debug(`Evento [${event}] da sessão ${sessionId} publicado na fila.`);
  }

  async close() {
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
    } catch (err) {
      logger.error(err, 'Erro ao fechar conexão RabbitMQ');
    }
  }
}

export const queueService = new QueueService();
export default queueService;
