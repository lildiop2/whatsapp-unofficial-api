import { Router } from 'express';
import { sendMessage } from '../controllers/message.controller.js';

import { validateRequest } from '../middlewares/validation.middleware.js';
import { sendMessageSchema } from '../validators/message.validator.js';

const router = Router();

router.post('/send', validateRequest(sendMessageSchema), sendMessage);

export default router;
