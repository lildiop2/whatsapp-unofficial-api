import { Response } from 'express';
import { prisma } from '../services/prisma.service.js';
import { hashPassword, comparePassword } from '../services/hash.service.js';
import { signToken } from '../services/jwt.service.js';
import { TenantRequest } from '../types/index.js';

export const register = async (req: TenantRequest, res: Response) => {
  const { email, password, name, tenantName } = req.body;

  if (!email || !password || !name || !tenantName) {
    return res.status(400).json({
      error: 'Os campos "email", "password", "name" e "tenantName" são obrigatórios.',
    });
  }

  try {
    // 1. Verificar se o e-mail já está cadastrado
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Este endereço de e-mail já está registrado.' });
    }

    const hashedPassword = await hashPassword(password);

    // 2. Criar Tenant e User em uma transação atômica
    const result = await prisma.$transaction(async tx => {
      // Criar o Tenant
      const tenant = await tx.tenant.create({
        data: {
          name: tenantName,
        },
      });

      // Criar o Usuário com Perfil de Admin do Tenant
      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role: 'TENANT_ADMIN',
          tenantId: tenant.id,
        },
      });

      // Criar uma chave de API inicial para o Tenant
      const apiKey = await tx.apiKey.create({
        data: {
          key: `zap_${crypto.randomUUID().replace(/-/g, '')}`,
          name: 'Chave de Produção',
          tenantId: tenant.id,
        },
      });

      return { user, tenant, apiKey };
    });

    // 3. Gerar Token JWT
    const token = signToken({
      userId: result.user.id,
      email: result.user.email,
      role: result.user.role,
      tenantId: result.user.tenantId,
    });

    return res.status(201).json({
      message: 'Organização e usuário administrador registrados com sucesso.',
      token,
      apiKey: result.apiKey.key,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
      },
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const login = async (req: TenantRequest, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Os campos "email" e "password" são obrigatórios.' });
  }

  try {
    // Buscar usuário
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas. E-mail ou senha incorretos.' });
    }

    // Verificar hash de senha
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Credenciais inválidas. E-mail ou senha incorretos.' });
    }

    // Assinar JWT Token
    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const me = async (req: TenantRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }
  return res.json({ user: req.user });
};
