import { Response } from 'express';
import { prisma } from '../services/prisma.service.js';
import { TenantRequest } from '../types/index.js';
import crypto from 'node:crypto';

export const getAiConfig = async (req: TenantRequest, res: Response) => {
  const tenantId = req.tenantId;

  if (!tenantId) {
    return res.status(400).json({ error: 'Nenhum Tenant associado a esta requisição.' });
  }

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return res.status(444).json({ error: 'Tenant não encontrado.' });
    }

    return res.json({
      aiProvider: tenant.aiProvider,
      aiApiKey: tenant.aiApiKey,
      aiBaseUrl: tenant.aiBaseUrl,
      aiChatModel: tenant.aiChatModel,
      aiEmbeddingModel: tenant.aiEmbeddingModel,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const updateAiConfig = async (req: TenantRequest, res: Response) => {
  const tenantId = req.tenantId;
  const { aiProvider, aiApiKey, aiBaseUrl, aiChatModel, aiEmbeddingModel } = req.body;

  if (!tenantId) {
    return res.status(400).json({ error: 'Nenhum Tenant associado a esta requisição.' });
  }

  const validProviders = ['gemini', 'openai', 'ollama'];
  if (aiProvider && !validProviders.includes(aiProvider)) {
    return res.status(400).json({
      error: `Provedor de IA inválido. Escolha um dos seguintes: ${validProviders.join(', ')}`,
    });
  }

  try {
    const updatedTenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        aiProvider: aiProvider || undefined,
        aiApiKey: aiApiKey !== undefined ? aiApiKey : undefined,
        aiBaseUrl: aiBaseUrl !== undefined ? aiBaseUrl : undefined,
        aiChatModel: aiChatModel !== undefined ? aiChatModel : undefined,
        aiEmbeddingModel: aiEmbeddingModel !== undefined ? aiEmbeddingModel : undefined,
      },
    });

    return res.json({
      message: 'Configurações de LLM e RAG salvas com sucesso.',
      aiConfig: {
        aiProvider: updatedTenant.aiProvider,
        aiApiKey: updatedTenant.aiApiKey,
        aiBaseUrl: updatedTenant.aiBaseUrl,
        aiChatModel: updatedTenant.aiChatModel,
        aiEmbeddingModel: updatedTenant.aiEmbeddingModel,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const listApiKeys = async (req: TenantRequest, res: Response) => {
  const tenantId = req.tenantId;

  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant não associado.' });
  }

  try {
    const apiKeys = await prisma.apiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(apiKeys);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const createApiKey = async (req: TenantRequest, res: Response) => {
  const tenantId = req.tenantId;
  const { name } = req.body;

  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant não associado.' });
  }

  if (!name) {
    return res.status(400).json({ error: 'O campo "name" é obrigatório.' });
  }

  try {
    const key = `zap_${crypto.randomUUID().replace(/-/g, '')}`;
    const apiKey = await prisma.apiKey.create({
      data: {
        key,
        name,
        tenantId,
      },
    });
    return res.status(201).json(apiKey);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const deleteApiKey = async (req: TenantRequest, res: Response) => {
  const tenantId = req.tenantId;
  const { id } = req.params;

  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant não associado.' });
  }

  try {
    const apiKey = await prisma.apiKey.findFirst({
      where: { id, tenantId },
    });

    if (!apiKey) {
      return res.status(404).json({ error: 'Chave de API não encontrada ou sem permissão.' });
    }

    await prisma.apiKey.delete({
      where: { id },
    });

    return res.json({ message: 'Chave de API excluída com sucesso.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const listLogs = async (req: TenantRequest, res: Response) => {
  const tenantId = req.tenantId;

  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant não associado.' });
  }

  try {
    // 1. Obter sessões do tenant (automaticamente filtradas pela extensão do Prisma)
    const sessions = await prisma.whatsappSession.findMany({
      select: { id: true, name: true },
    });

    const sessionIds = sessions.map(s => s.id);

    // 2. Buscar logs de mensagens e webhooks para as sessões do tenant
    const messages = await prisma.sentMessage.findMany({
      where: { sessionId: { in: sessionIds } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const webhookLogs = await prisma.webhookLog.findMany({
      where: { sessionId: { in: sessionIds } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return res.json({
      sessions,
      messages,
      webhookLogs,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};
