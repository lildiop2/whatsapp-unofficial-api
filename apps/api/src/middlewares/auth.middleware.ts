import { Response, NextFunction } from 'express';
import { prisma } from '../services/prisma.service.js';
import { TenantRequest } from '../types/index.js';
import { tenantLocalStorage } from '../services/tenant-context.service.js';
import { verifyToken } from '../services/jwt.service.js';

export const authenticateApiKey = async (req: TenantRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const customHeader = req.headers['x-api-key'];

  let apiKeyString = '';

  if (customHeader && typeof customHeader === 'string') {
    apiKeyString = customHeader;
  } else if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    apiKeyString = authHeader.substring(7);
  }

  if (!apiKeyString) {
    return res.status(401).json({
      error:
        'Não autorizado. A chave de API ("x-api-key" ou "Authorization: Bearer") está ausente.',
    });
  }

  try {
    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { key: apiKeyString },
      include: { tenant: true },
    });

    if (!apiKeyRecord) {
      return res.status(401).json({
        error: 'Chave de API inválida ou revogada.',
      });
    }

    // Associar os dados do Tenant à requisição
    req.tenantId = apiKeyRecord.tenantId;
    req.tenant = apiKeyRecord.tenant;

    return tenantLocalStorage.run({ tenantId: apiKeyRecord.tenantId }, () => {
      next();
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro interno ao validar chave de API.' });
  }
};

export const authenticateUser = async (req: TenantRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Não autorizado. Token de acesso JWT ("Authorization: Bearer <token>") está ausente.',
    });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = verifyToken(token);

    req.user = {
      id: decoded.userId,
      email: decoded.email,
      name: '',
      role: decoded.role,
      tenantId: decoded.tenantId,
    };

    if (decoded.tenantId) {
      req.tenantId = decoded.tenantId;
      return tenantLocalStorage.run({ tenantId: decoded.tenantId }, () => {
        next();
      });
    }

    // Se for Super Admin (sem tenantId associado), não inicializamos AsyncLocalStorage
    // permitindo acesso global ao banco de dados sem filtros.
    return next();
  } catch (err: any) {
    return res.status(401).json({ error: 'Token de acesso inválido ou expirado.' });
  }
};

export const requireRole = (roles: ('SUPER_ADMIN' | 'TENANT_ADMIN' | 'TENANT_USER')[]) => {
  return (req: TenantRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autorizado. Usuário não autenticado.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Acesso negado. Nível de permissão insuficiente para acessar este recurso.',
      });
    }

    return next();
  };
};

export const authenticateHybrid = async (req: TenantRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const customHeader = req.headers['x-api-key'];

  // 1. Tentar autenticar via x-api-key se fornecido diretamente
  if (customHeader && typeof customHeader === 'string') {
    return authenticateApiKey(req, res, next);
  }

  // 2. Se for Authorization Header, determinar se é API Key ou JWT Token
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    // Chaves de API no nosso sistema têm o prefixo "zap_"
    if (token.startsWith('zap_')) {
      return authenticateApiKey(req, res, next);
    } else {
      return authenticateUser(req, res, next);
    }
  }

  return res.status(401).json({
    error:
      'Não autorizado. Envie um Token JWT ("Authorization: Bearer <jwt>") ou uma Chave de API ("x-api-key" ou "Authorization: Bearer <api_key>").',
  });
};
