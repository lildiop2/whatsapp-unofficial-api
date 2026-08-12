import express from 'express';
import dotenv from 'dotenv';
import pino from 'pino';
dotenv.config();
import { validateEnv, SessionStatus } from '@zap/shared';

const env = validateEnv(process.env);

const logger = pino({
  level: env.LOG_LEVEL,
  transport: env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
});

const app = express();
const port = env.PORT;

app.use(express.json());

app.get('/health', (req, res) => {
  const status: SessionStatus = 'DISCONNECTED';
  logger.debug('Health check endpoint called');
  res.json({
    status: 'OK',
    zapoStatus: status,
    timestamp: new Date().toISOString(),
  });
});

app.listen(port, () => {
  logger.info(`Server is running at http://localhost:${port}`);
});
