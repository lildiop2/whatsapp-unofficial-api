import dotenv from 'dotenv';
import pino from 'pino';

dotenv.config();

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
});

async function main() {
  logger.info('Zap-Zap Worker starting...');
  // Stub for RabbitMQ consumer setup
  logger.info('Worker initialized and waiting for RabbitMQ connection...');
}

main().catch(err => {
  logger.error(err, 'Failed to start worker');
  process.exit(1);
});
