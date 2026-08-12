import { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { zapoSessionManager } from '../services/zapo.service.js';
import { prisma } from '../services/prisma.service.js';

export const sendMessage = async (req: Request, res: Response) => {
  const {
    sessionId,
    to,
    text,
    mediaUrl,
    mediaType,
    fileName,
    caption,
    mimetype,
    presenceDelay,
    presenceType,
  } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'O campo "sessionId" é obrigatório.' });
  }
  if (!to) {
    return res.status(400).json({ error: 'O campo "to" (destinatário) é obrigatório.' });
  }
  if (!text && !mediaUrl) {
    return res.status(400).json({
      error: 'Pelo menos um dos campos "text" ou "mediaUrl" deve ser fornecido.',
    });
  }

  const client = zapoSessionManager.getClient(sessionId);
  if (!client) {
    return res.status(444).json({ error: `Sessão ${sessionId} não está ativa ou conectada.` });
  }

  try {
    // Normalizar JID de destino (se for apenas dígitos, Zapo resolve, mas adicionamos sufixo se necessário)
    let targetJid = to;
    if (!to.includes('@')) {
      targetJid = `${to}@s.whatsapp.net`;
    }

    // 1. Simular Estado Humano (Typing/Recording) se solicitado
    if (presenceDelay && presenceDelay > 0 && presenceType) {
      const validStates = ['composing', 'recording', 'paused'];
      if (validStates.includes(presenceType)) {
        await client.presence.sendChatstate(targetJid, { state: presenceType as any });
        await new Promise(resolve => setTimeout(resolve, presenceDelay));
        // Parar estado de digitação/gravação antes de enviar
        await client.presence.sendChatstate(targetJid, { state: 'paused' });
      }
    }

    let publishResult;

    // 2. Tratar envio de Mídia
    if (mediaUrl) {
      let mediaSource: string | Readable = mediaUrl;

      // Baixar mídia se for URL HTTP/S
      if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
        const response = await fetch(mediaUrl);
        if (!response.ok) {
          return res.status(400).json({
            error: `Falha ao baixar mídia da URL. HTTP Status: ${response.status}`,
          });
        }
        if (!response.body) {
          return res.status(400).json({ error: 'Corpo da resposta HTTP de mídia está vazio.' });
        }
        mediaSource = Readable.fromWeb(response.body as any);
      }

      const type = mediaType || 'document';
      const fileMime = mimetype || 'application/octet-stream';

      publishResult = await client.message.send(targetJid, {
        type: type as any,
        media: mediaSource,
        mimetype: fileMime,
        caption: caption,
        fileName: fileName,
      });
    } else {
      // 3. Tratar envio de Texto simples
      publishResult = await client.message.send(targetJid, {
        type: 'text',
        text: text,
        linkPreview: true,
      });
    }

    // 4. Salvar histórico de mensagem enviada no Prisma
    const messageId = publishResult.id || crypto.randomUUID();
    await prisma.sentMessage.create({
      data: {
        sessionId,
        recipient: targetJid,
        content: text || `[Mídia: ${mediaType || 'document'}]`,
        messageId: messageId,
        status: 'sent',
      },
    });

    return res.json({
      success: true,
      messageId: messageId,
      result: publishResult,
    });
  } catch (err: any) {
    console.error(`Erro ao enviar mensagem na sessão ${sessionId}:`, err);
    return res.status(500).json({ error: err.message });
  }
};
