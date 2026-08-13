import { Router } from 'express';
import {
  getAiConfig,
  updateAiConfig,
  listApiKeys,
  createApiKey,
  deleteApiKey,
  listLogs,
} from '../controllers/tenant.controller.js';
import { authenticateUser, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

// Configurações de IA
router.get('/ai-config', authenticateUser, getAiConfig);
router.put(
  '/ai-config',
  authenticateUser,
  requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']),
  updateAiConfig,
);

// Gerenciamento de chaves de API
router.get('/api-keys', authenticateUser, listApiKeys);
router.post(
  '/api-keys',
  authenticateUser,
  requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']),
  createApiKey,
);
router.delete(
  '/api-keys/:id',
  authenticateUser,
  requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']),
  deleteApiKey,
);

// Logs e Histórico
router.get('/logs', authenticateUser, listLogs);

export default router;
