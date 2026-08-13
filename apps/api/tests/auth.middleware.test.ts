import '../src/load-env.js';
import { describe, it, expect, vi } from 'vitest';
import { requireRole } from '../src/middlewares/auth.middleware.js';

describe('Authorization Roles Middleware', () => {
  it('deve chamar next() se usuario tiver uma das roles permitidas', () => {
    const middleware = requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']);
    const req = {
      user: {
        id: '123',
        email: 'super@admin.com',
        name: 'Super',
        role: 'SUPER_ADMIN',
        tenantId: null,
      },
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('deve retornar 403 se usuario nao tiver a role requerida', () => {
    const middleware = requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']);
    const req = {
      user: {
        id: '123',
        email: 'user@tenant.com',
        name: 'User',
        role: 'TENANT_USER',
        tenantId: 'tenant-123',
      },
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Acesso negado. Nível de permissão insuficiente para acessar este recurso.',
      })
    );
  });

  it('deve retornar 401 se usuario nao estiver autenticado', () => {
    const middleware = requireRole(['SUPER_ADMIN']);
    const req = {} as any; // sem req.user
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
