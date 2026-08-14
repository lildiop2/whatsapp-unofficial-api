import { Response } from 'express';
import { zapoSessionManager } from '../services/zapo.service.js';
import { prisma } from '../services/prisma.service.js';
import { TenantRequest } from '../types/index.js';

export const createSession = async (req: TenantRequest, res: Response) => {
  const { id, name, webhookUrl, phone, webhookEvents, botEnabled, botConfig } = req.body;
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
        phone,
        webhookEvents: webhookEvents || ['all'],
        botEnabled: botEnabled || false,
        botConfig: botConfig || null,
        status: 'DISCONNECTED',
      },
    });

    // Inicializar o cliente WhatsApp em background
    zapoSessionManager.initSession(sessionId).catch(err => {
      console.error(`Erro ao inicializar WaClient para ${sessionId}:`, err);
    });

    return res.status(201).json(session);
  } catch (err: any) {
    console.error(`Erro ao criar sessão ${sessionId}:`, err);
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

export const updateSession = async (req: TenantRequest, res: Response) => {
  const { id } = req.params;
  const tenantId = req.tenantId!;
  const { name, phone, webhookUrl, webhookEvents, botEnabled, botConfig } = req.body;

  try {
    const session = await prisma.whatsappSession.findUnique({
      where: { id },
    });

    if (!session || session.tenantId !== tenantId) {
      return res.status(444).json({ error: `Sessão ${id} não encontrada ou sem permissão.` });
    }

    const updated = await prisma.whatsappSession.update({
      where: { id },
      data: {
        name,
        phone,
        webhookUrl,
        webhookEvents,
        botEnabled,
        botConfig: botConfig !== undefined ? botConfig : undefined,
      },
    });

    return res.json(updated);
  } catch (err: any) {
    console.error(`Erro ao atualizar sessão ${id}:`, err);
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
    const pairingCode = zapoSessionManager.getSessionPairingCode(id);
    const client = zapoSessionManager.getClient(id);

    return res.json({
      id: session.id,
      name: session.name,
      status: session.status,
      phone: session.phone,
      meJid: session.meJid,
      webhookUrl: session.webhookUrl,
      webhookEvents: session.webhookEvents,
      botEnabled: session.botEnabled,
      botConfig: session.botConfig,
      qrCode: qr || null,
      pairingCode: pairingCode || session.pairingCode || null,
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
