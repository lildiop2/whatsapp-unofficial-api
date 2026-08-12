import express from 'express';
import dotenv from 'dotenv';
import pino from 'pino';
import { SessionStatus } from '@zap/shared';

dotenv.config();

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
});

const app = express();
const port = process.env.PORT || 3000;

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
