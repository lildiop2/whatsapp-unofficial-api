import './load-env.js';
import express from 'express';
import pino from 'pino';
import { validateEnv, SessionStatus } from '@zap/shared';

const env = validateEnv(process.env);

const logger = pino({
  level: env.LOG_LEVEL,
  transport: env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
});

import sessionRoutes from './routes/session.routes.js';
import messageRoutes from './routes/message.routes.js';
import { zapoSessionManager } from './services/zapo.service.js';
import { queueService } from './services/queue.service.js';

import cors from 'cors';

const app = express();
const port = env.PORT;

app.use(cors());
app.use(express.json());

// Rotas da API
app.use('/sessions', sessionRoutes);
app.use('/messages', messageRoutes);

app.get('/health', (req, res) => {
  const status: SessionStatus = 'DISCONNECTED';
  logger.debug('Health check endpoint called');
  res.json({
    status: 'OK',
    zapoStatus: status,
    timestamp: new Date().toISOString(),
  });
});

// Conectar ao RabbitMQ e inicializar filas
queueService
  .connect()
  .then(() => {
    // Inicializar sessões ativas do banco de dados no boot
    return zapoSessionManager.bootstrapSessions();
  })
  .then(() => {
    logger.info('Bootstrap das sessões concluído.');
  })
  .catch(err => {
    logger.error(err, 'Falha durante a inicialização dos serviços em segundo plano.');
  });

const server = app.listen(port, () => {
  logger.info(`Server is running at http://localhost:${port}`);
});

// Manipulação de desligamento gracioso
const handleShutdown = async (signal: string) => {
  logger.info(`Sinal de ${signal} recebido. Desligando graciosamente...`);
  server.close(async () => {
    await zapoSessionManager.shutdown();
    await queueService.close();
    logger.info('Desligamento do servidor finalizado.');
    process.exit(0);
  });
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
