import { z } from 'zod';

export const sendMessageSchema = z.object({
  body: z
    .object({
      sessionId: z.string().min(1, 'O campo "sessionId" é obrigatório.'),
      to: z.string().min(1, 'O campo "to" (destinatário) é obrigatório.'),
      text: z.string().optional(),
      mediaUrl: z.string().url('O campo "mediaUrl" deve ser uma URL válida.').optional(),
      mediaType: z.enum(['image', 'video', 'audio', 'document', 'sticker', 'ptv']).optional(),
      fileName: z.string().optional(),
      caption: z.string().optional(),
      mimetype: z.string().optional(),
      presenceDelay: z.number().int().nonnegative().optional(),
      presenceType: z.enum(['composing', 'recording', 'paused']).optional(),
    })
    .refine(data => data.text || data.mediaUrl, {
      message: 'Pelo menos um dos campos "text" ou "mediaUrl" deve ser fornecido.',
      path: ['text'],
    }),
});
