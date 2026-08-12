import { z } from 'zod';

export const createSessionSchema = z.object({
  body: z.object({
    id: z.string().uuid('O ID da sessão deve ser um UUID válido').optional(),
    name: z.string().min(1, 'O campo "name" é obrigatório e não pode ser vazio.'),
    webhookUrl: z
      .string()
      .url('O campo "webhookUrl" deve ser uma URL válida.')
      .optional()
      .nullable(),
  }),
});

export const sessionParamSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'O ID da sessão nos parâmetros é obrigatório.'),
  }),
});
