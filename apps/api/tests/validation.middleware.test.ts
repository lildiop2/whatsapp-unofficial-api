import '../src/load-env.js';
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { validateRequest } from '../src/middlewares/validation.middleware.js';

const testSchema = z.object({
  body: z.object({
    username: z.string().min(3, 'Username muito curto'),
  }),
});

describe('Validation Middleware', () => {
  it('deve chamar next() e sanitizar quando dados forem validos', async () => {
    const middleware = validateRequest(testSchema);
    const req = {
      body: { username: 'diogo' },
      query: {},
      params: {},
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.body.username).toBe('diogo');
  });

  it('deve retornar 400 e erro do zod quando dados forem invalidos', async () => {
    const middleware = validateRequest(testSchema);
    const req = {
      body: { username: 'di' }, // muito curto
      query: {},
      params: {},
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Erro de validação de dados de entrada.',
      })
    );
  });
});
