import dotenv from 'dotenv';
import pino from 'pino';

dotenv.config();
import { validateEnv } from '@zap/shared';

const env = validateEnv(process.env);

const logger = pino({
  level: env.LOG_LEVEL,
  transport: env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
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
