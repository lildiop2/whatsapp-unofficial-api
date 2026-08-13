import { Response, NextFunction } from 'express';
import { prisma } from '../services/prisma.service.js';
import { TenantRequest } from '../types/index.js';

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

    return next();
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro interno ao validar chave de API.' });
  }
};
