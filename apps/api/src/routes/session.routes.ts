import { Router } from 'express';
import {
   createSession,
   listSessions,
   getSessionStatus,
   disconnectSession,
   logoutSession,
   updateSession,
 } from '../controllers/session.controller.js';
 
 import { validateRequest } from '../middlewares/validation.middleware.js';
 import {
   createSessionSchema,
   sessionParamSchema,
   updateSessionSchema,
 } from '../validators/session.validator.js';
 
 const router = Router();
 
 router.post('/', validateRequest(createSessionSchema), createSession);
 router.get('/', listSessions);
 router.get('/:id/status', validateRequest(sessionParamSchema), getSessionStatus);
 router.patch('/:id', validateRequest(updateSessionSchema), updateSession);
 router.post('/:id/disconnect', validateRequest(sessionParamSchema), disconnectSession);
 router.post('/:id/logout', validateRequest(sessionParamSchema), logoutSession);

export default router;
