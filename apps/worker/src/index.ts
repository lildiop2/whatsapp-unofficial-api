import amqp from 'amqplib';
import dotenv from 'dotenv';
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

dotenv.config();

const env = validateEnv(process.env);

const logger = pino({
  level: env.LOG_LEVEL,
  transport: env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
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

    // Processamento de RAG e Auto-Reply em background (não bloqueante para o webhook)
    if (event === 'message' && payload) {
      const textContent = extractMessageText(payload);
      if (textContent) {
        const senderJid = payload.key?.fromMe ? 'me' : payload.key?.remoteJid || 'unknown';
        const messageId = payload.key?.id || crypto.randomUUID();

        // 1. Indexar mensagem no pgvector
        ragService.saveMessageEmbedding(sessionId, messageId, senderJid, textContent).catch(err => {
          logger.error(err, 'Erro ao salvar embedding da mensagem no pgvector');
        });

        // 2. Auto-reply com RAG se a mensagem for recebida e a IA estiver ativada
        if (!payload.key?.fromMe && process.env.GEMINI_API_KEY) {
          ragService
            .runAgent(sessionId, textContent)
            .then(async aiReply => {
              logger.info(`Agente RAG gerou resposta: "${aiReply}"`);
              const apiPort = process.env.PORT || 3000;
              const sendResponse = await fetch(`http://localhost:${apiPort}/messages/send`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  sessionId,
                  to: payload.key.remoteJid,
                  text: aiReply,
                  presenceDelay: 2000,
                  presenceType: 'composing',
                }),
              });

              if (!sendResponse.ok) {
                logger.error(`Falha ao enviar auto-reply. Status: ${sendResponse.status}`);
              }
            })
            .catch(err => {
              logger.error(err, 'Erro ao processar auto-reply com Langgraph RAG');
            });
        }
      }
    }

    try {
      // 2. Buscar o webhookUrl atualizado da sessão no banco de dados
      const session = await prisma.whatsappSession.findUnique({
        where: { id: sessionId },
      });

      if (!session || !session.webhookUrl) {
        logger.warn(
          `Webhook omitido: Sessão ${sessionId} não possui URL de webhook configurada. Descartando...`,
        );
        channel.ack(msg);
        return;
      }

      // 3. Efetuar envio do Webhook via POST
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
        // ACK para remover da fila principal de vez e parar o loop
        channel.ack(msg);
      } else {
        logger.warn(`Encaminhando webhook para a fila de retry (DLX) para tentar novamente...`);
        // NACK com requeue: false move a mensagem automaticamente para a DLX
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
