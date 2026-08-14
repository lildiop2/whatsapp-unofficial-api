import { z } from 'zod';

export const createSessionSchema = z.object({
  body: z.object({
    id: z.string().uuid('O ID da sessão deve ser um UUID válido').optional(),
    name: z.string().min(1, 'O campo "name" é obrigatório e não pode ser vazio.'),
    phone: z
      .string()
      .regex(/^\d+$/, 'O telefone de pareamento deve conter apenas números.')
      .optional()
      .nullable(),
    webhookUrl: z
      .string()
      .url('O campo "webhookUrl" deve ser uma URL válida.')
      .optional()
      .nullable(),
    webhookEvents: z.array(z.string()).optional(),
    botEnabled: z.boolean().optional(),
    botConfig: z.any().optional().nullable(),
  }),
});

export const sessionParamSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'O ID da sessão nos parâmetros é obrigatório.'),
  }),
});

export const updateSessionSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'O ID da sessão nos parâmetros é obrigatório.'),
  }),
  body: z.object({
    name: z.string().min(1).optional(),
    phone: z
      .string()
      .regex(/^\d+$/, 'O telefone de pareamento deve conter apenas números.')
      .optional()
      .nullable(),
    webhookUrl: z
      .string()
      .url('O campo "webhookUrl" deve ser uma URL válida.')
      .optional()
      .nullable(),
    webhookEvents: z.array(z.string()).optional(),
    botEnabled: z.boolean().optional(),
    botConfig: z.any().optional().nullable(),
  }),
});
