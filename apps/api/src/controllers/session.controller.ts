import { Response } from 'express';
import { zapoSessionManager } from '../services/zapo.service.js';
import { prisma } from '../services/prisma.service.js';
import { TenantRequest } from '../types/index.js';

export const createSession = async (req: TenantRequest, res: Response) => {
  const { id, name, webhookUrl } = req.body;
  const tenantId = req.tenantId!;

  if (!name) {
    return res.status(400).json({ error: 'O campo "name" é obrigatório.' });
  }

  const sessionId = id || crypto.randomUUID();

  try {
    // Verificar se a sessão já existe
    const existing = await prisma.whatsappSession.findUnique({
      where: { id: sessionId },
    });

    if (existing) {
      return res.status(400).json({ error: `Sessão com ID ${sessionId} já existe.` });
    }

    // Criar a sessão no banco vinculada ao Tenant
    const session = await prisma.whatsappSession.create({
      data: {
        id: sessionId,
        tenantId,
        name,
        webhookUrl,
        status: 'DISCONNECTED',
      },
    });

    // Inicializar o cliente WhatsApp em background
    zapoSessionManager.initSession(sessionId).catch(err => {
      console.error(`Erro ao inicializar WaClient para ${sessionId}:`, err);
    });

    return res.status(201).json(session);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const listSessions = async (req: TenantRequest, res: Response) => {
  const tenantId = req.tenantId!;

  try {
    const sessions = await prisma.whatsappSession.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(sessions);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const getSessionStatus = async (req: TenantRequest, res: Response) => {
  const { id } = req.params;
  const tenantId = req.tenantId!;

  try {
    const session = await prisma.whatsappSession.findUnique({
      where: { id },
    });

    if (!session || session.tenantId !== tenantId) {
      return res.status(444).json({ error: `Sessão ${id} não encontrada ou sem permissão.` });
    }

    const qr = zapoSessionManager.getSessionQr(id);
    const client = zapoSessionManager.getClient(id);

    return res.json({
      id: session.id,
      name: session.name,
      status: session.status,
      webhookUrl: session.webhookUrl,
      qrCode: qr || null,
      isConnected: client?.getState()?.connected || false,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const disconnectSession = async (req: TenantRequest, res: Response) => {
  const { id } = req.params;
  const tenantId = req.tenantId!;

  try {
    const session = await prisma.whatsappSession.findUnique({
      where: { id },
    });

    if (!session || session.tenantId !== tenantId) {
      return res.status(444).json({ error: `Sessão ${id} não encontrada ou sem permissão.` });
    }

    await zapoSessionManager.disconnectSession(id);
    return res.json({ message: `Sessão ${id} desconectada com sucesso.` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const logoutSession = async (req: TenantRequest, res: Response) => {
  const { id } = req.params;
  const tenantId = req.tenantId!;

  try {
    const session = await prisma.whatsappSession.findUnique({
      where: { id },
    });

    if (!session || session.tenantId !== tenantId) {
      return res.status(444).json({ error: `Sessão ${id} não encontrada ou sem permissão.` });
    }

    await zapoSessionManager.logoutSession(id);

    // Deletar a sessão do banco relacional de controle
    await prisma.whatsappSession.delete({
      where: { id },
    });

    return res.json({ message: `Sessão ${id} removida e desvinculada com sucesso.` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};
