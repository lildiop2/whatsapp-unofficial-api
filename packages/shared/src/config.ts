import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL deve ser uma URL válida'),
  REDIS_URL: z.string().url('REDIS_URL deve ser uma URL válida'),
  RABBITMQ_URL: z.string().url('RABBITMQ_URL deve ser uma URL válida'),
  PORT: z.preprocess(val => Number(val), z.number().default(3000)),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  GEMINI_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(processEnv: Record<string, unknown>): Env {
  const result = envSchema.safeParse(processEnv);

  if (!result.success) {
    const errorDetails = result.error.format();
    console.error('❌ Erro de validação das variáveis de ambiente (.env):');
    console.error(JSON.stringify(errorDetails, null, 2));
    throw new Error('Variáveis de ambiente inválidas ou ausentes.');
  }

  return result.data;
}
