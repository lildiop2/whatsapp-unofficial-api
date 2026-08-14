import './load-env.js';
import amqp from 'amqplib';
import pino from 'pino';
import crypto from 'node:crypto';
import { validateEnv } from '@zap/shared';
import { ragService } from './services/rag.service.js';
import { prisma } from './services/prisma.service.js';

function extractMessageText(payload: any): string | null {
  if (!payload || !payload.message) return null;
  const msg = payload.message;
  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage?.caption) return msg.imageMessage.caption;
  if (msg.videoMessage?.caption) return msg.videoMessage.caption;
  return null;
}

async function sendReply(sessionId: string, to: string, text: string) {
  const apiPort = process.env.PORT || 3002;
  const response = await fetch(`http://localhost:${apiPort}/messages/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      to,
      text,
      presenceDelay: 1500,
      presenceType: 'composing',
    }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao enviar resposta. HTTP ${response.status}`);
  }
}

const env = validateEnv(process.env);

const logger = pino({
  level: env.LOG_LEVEL,
  base: null,
  timestamp: false,
  transport: env.NODE_ENV !== 'production' ? {
    targets: [
      {
        target: 'pino-pretty',
        options: { destination: 1 },
        level: env.LOG_LEVEL,
      },
      {
        target: 'pino-roll',
        options: {
          file: './logs/worker',
          frequency: 'daily',
          size: '10m',
          mkdir: true,
        },
        level: env.LOG_LEVEL,
      }
    ]
  } : undefined,
});

const queueName = 'zap-webhooks';
const dlxExchange = 'zap-webhooks-dlx';
const dlxQueue = 'zap-webhooks-retry';

async function main() {
  logger.info('Iniciando Zap-Zap Worker...');

  const connection = await amqp.connect(env.RABBITMQ_URL);
  const channel = await connection.createChannel();

  // 1. Assegurar as filas e DLX (idêntico à API para robustez)
  await channel.assertExchange(dlxExchange, 'direct', { durable: true });
  await channel.assertQueue(dlxQueue, {
    durable: true,
    arguments: {
      'x-message-ttl': 10000, // 10 segundos
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': queueName,
    },
  });
  await channel.bindQueue(dlxQueue, dlxExchange, 'retry');

  await channel.assertQueue(queueName, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': dlxExchange,
      'x-dead-letter-routing-key': 'retry',
    },
  });

  // Limitar concorrência
  await channel.prefetch(5);

  logger.info('Conectado ao RabbitMQ. Consumindo fila de webhooks...');

  channel.consume(queueName, async msg => {
    if (!msg) return;

    let parsedMessage;
    try {
      parsedMessage = JSON.parse(msg.content.toString());
    } catch (err) {
      logger.error(err, 'Erro ao fazer parse do corpo da mensagem do RabbitMQ. Descartando...');
      channel.ack(msg);
      return;
    }

    const { sessionId, event, payload } = parsedMessage;

    // Calcular tentativas de retry através do header x-death do RabbitMQ
    const xDeath = msg.properties.headers?.['x-death'];
    const attempts = xDeath && xDeath[0] ? xDeath[0].count : 0;

    logger.debug(
      `Processando webhook [${event}] para sessão ${sessionId}. Tentativa: ${attempts + 1}`,
    );

    // 1. Buscar a sessão correspondente no banco de dados para obter configurações de Webhook/Bot
    let session;
    try {
      session = await prisma.whatsappSession.findUnique({
        where: { id: sessionId },
      });
    } catch (err) {
      logger.error(err, `Erro ao buscar sessão ${sessionId} do banco de dados`);
    }

    if (!session) {
      logger.warn(`Sessão ${sessionId} não encontrada no banco. Descartando mensagem...`);
      channel.ack(msg);
      return;
    }

    // 2. Processamento de RAG e Auto-Reply em background se for um evento de mensagem recebida
    if (event === 'message' && payload) {
      const textContent = extractMessageText(payload);
      if (textContent) {
        const senderJid = payload.key?.fromMe ? 'me' : payload.key?.remoteJid || 'unknown';
        const messageId = payload.key?.id || crypto.randomUUID();

        // 2.1 Salvar mensagem no pgvector
        ragService.saveMessageEmbedding(sessionId, messageId, senderJid, textContent).catch(err => {
          logger.error(err, 'Erro ao salvar embedding da mensagem no pgvector');
        });

        // 2.2 Executar auto-reply se o Bot estiver ativado e a mensagem não for nossa
        if (!payload.key?.fromMe && session.botEnabled) {
          const botConfig = (session.botConfig as any) || {};
          const botType = botConfig.type || 'simple';

          if (botType === 'simple') {
            const rules = botConfig.rules || [];
            const normalizedText = textContent.toLowerCase().trim();
            const matchedRule = rules.find((r: any) =>
              normalizedText.includes(r.trigger.toLowerCase().trim()),
            );

            if (matchedRule) {
              logger.info(
                `Simple Bot ativado para trigger "${matchedRule.trigger}" na sessão ${sessionId}`,
              );
              sendReply(sessionId, payload.key.remoteJid, matchedRule.response).catch(err => {
                logger.error(err, 'Erro ao enviar resposta do Simple Bot');
              });
            }
          } else if (botType === 'ai') {
            // RAG AI Agent
            logger.info(`AI Bot ativado para a sessão ${sessionId}`);
            ragService
              .runAgent(sessionId, textContent, botConfig.prompt)
              .then(async aiReply => {
                logger.info(`Agente RAG gerou resposta: "${aiReply}"`);
                await sendReply(sessionId, payload.key.remoteJid, aiReply);
              })
              .catch(err => {
                logger.error(err, 'Erro ao processar auto-reply com AI Bot');
              });
          }
        }
      }
    }

    // 3. Filtrar e enviar o Webhook externo de acordo com as configurações da sessão
    const webhookEvents = (session.webhookEvents as string[]) || ['all'];
    const isEventAllowed = webhookEvents.includes('all') || webhookEvents.includes(event);

    if (!isEventAllowed || !session.webhookUrl) {
      if (!isEventAllowed) {
        logger.debug(
          `Webhook [${event}] ignorado para a sessão ${sessionId} devido aos filtros de eventos configurados.`,
        );
      } else {
        logger.warn(
          `Webhook omitido: Sessão ${sessionId} não possui URL de webhook configurada. Descartando...`,
        );
      }
      channel.ack(msg);
      return;
    }

    try {
      // Efetuar envio do Webhook via POST
      let response;
      try {
        response = await fetch(session.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId,
            event,
            payload,
            timestamp: new Date().toISOString(),
          }),
        });
      } catch (networkErr: any) {
        throw new Error(`Erro de rede/conexão: ${networkErr.message}`);
      }

      if (response.ok) {
        // Envio bem-sucedido: Salvar log de sucesso e dar ACK
        await prisma.webhookLog.create({
          data: {
            sessionId,
            event,
            payload: payload as any,
            statusCode: response.status,
            success: true,
          },
        });
        logger.info(`Webhook [${event}] enviado com sucesso para ${session.webhookUrl}`);
        channel.ack(msg);
      } else {
        // HTTP Error (ex: 500, 404, etc.)
        throw new Error(`Servidor remoto respondeu com HTTP ${response.status}`);
      }
    } catch (err: any) {
      logger.warn(`Falha ao enviar webhook [${event}] da sessão ${sessionId}: ${err.message}`);

      // Registrar log de falha no banco de dados
      try {
        await prisma.webhookLog.create({
          data: {
            sessionId,
            event,
            payload: payload as any,
            statusCode: err.message.includes('HTTP')
              ? parseInt(err.message.match(/\d+/)?.[0] || '0')
              : null,
            success: false,
          },
        });
      } catch (dbErr) {
        logger.error(dbErr, 'Falha ao registrar log de erro de webhook no banco');
      }

      // Verificar limite de tentativas (5 retries max)
      if (attempts >= 5) {
        logger.error(
          `Limite de retries excedido (5) para o webhook [${event}] da sessão ${sessionId}. Descartando...`,
        );
        channel.ack(msg);
      } else {
        logger.warn(`Encaminhando webhook para a fila de retry (DLX) para tentar novamente...`);
        channel.nack(msg, false, false);
      }
    }
  });

  // Desligamento gracioso
  const gracefulShutdown = async () => {
    logger.info('Encerrando worker graciosamente...');
    try {
      await channel.close();
      await connection.close();
      await prisma.$disconnect();
      logger.info('Worker encerrado com sucesso.');
      process.exit(0);
    } catch (err) {
      logger.error(err, 'Erro durante o encerramento do worker');
      process.exit(1);
    }
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

main().catch(err => {
  logger.error(err, 'Erro fatal no Worker');
  process.exit(1);
});
