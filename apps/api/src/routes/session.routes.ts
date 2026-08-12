import { Router } from 'express';
import {
  createSession,
  listSessions,
  getSessionStatus,
  disconnectSession,
  logoutSession,
} from '../controllers/session.controller.js';

const router = Router();

router.post('/', createSession);
router.get('/', listSessions);
router.get('/:id/status', getSessionStatus);
router.post('/:id/disconnect', disconnectSession);
router.post('/:id/logout', logoutSession);

export default router;
