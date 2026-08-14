import { Response } from 'express';
import { zapoSessionManager } from '../services/zapo.service.js';
import { prisma } from '../services/prisma.service.js';
import { TenantRequest } from '../types/index.js';

// Helper para obter o cliente Zapo validando segurança do Tenant
const getClientForTenant = async (sessionId: string, tenantId: string) => {
  const session = await prisma.whatsappSession.findUnique({
    where: { id: sessionId },
  });
  if (!session || session.tenantId !== tenantId) {
    return null;
  }
  return zapoSessionManager.getClient(sessionId);
};

// ==========================================
// 1. GRUPOS (Groups)
// ==========================================

export const createGroup = async (req: TenantRequest, res: Response) => {
  const { sessionId } = req.params;
  const { subject, participants, description } = req.body;
  const tenantId = req.tenantId!;

  if (!subject || !participants || !Array.isArray(participants)) {
    return res.status(400).json({ error: 'Os campos "subject" e "participants" (array) são obrigatórios.' });
  }

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    // Converter números de telefone simples em JIDs
    const formattedParticipants = participants.map(p => p.includes('@') ? p : `${p}@s.whatsapp.net`);

    const result = await client.group.createGroup(subject, formattedParticipants, { description });
    return res.status(201).json({ success: true, group: result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const listGroups = async (req: TenantRequest, res: Response) => {
  const { sessionId } = req.params;
  const tenantId = req.tenantId!;

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    const groups = await client.group.queryAllGroups();
    return res.json({ success: true, groups });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const getGroupInfo = async (req: TenantRequest, res: Response) => {
  const { sessionId, jid } = req.params;
  const tenantId = req.tenantId!;

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    const targetJid = jid.includes('@') ? jid : `${jid}@g.us`;
    const metadata = await client.group.queryGroupMetadata(targetJid);
    return res.json({ success: true, metadata });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const updateGroup = async (req: TenantRequest, res: Response) => {
  const { sessionId, jid } = req.params;
  const { subject, description } = req.body;
  const tenantId = req.tenantId!;

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    const targetJid = jid.includes('@') ? jid : `${jid}@g.us`;

    if (subject) {
      await client.group.setSubject(targetJid, subject);
    }
    if (description !== undefined) {
      await client.group.setDescription(targetJid, description);
    }

    return res.json({ success: true, message: 'Grupo atualizado com sucesso.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const manageParticipants = async (req: TenantRequest, res: Response) => {
  const { sessionId, jid } = req.params;
  const { participants, action } = req.body; // action: 'add' | 'remove' | 'promote' | 'demote'
  const tenantId = req.tenantId!;

  if (!participants || !Array.isArray(participants) || !action) {
    return res.status(400).json({ error: 'Parâmetros "participants" (array) e "action" são obrigatórios.' });
  }

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    const targetJid = jid.includes('@') ? jid : `${jid}@g.us`;
    const formattedParticipants = participants.map(p => p.includes('@') ? p : `${p}@s.whatsapp.net`);

    let result;
    switch (action) {
      case 'add':
        result = await client.group.addParticipants(targetJid, formattedParticipants);
        break;
      case 'remove':
        result = await client.group.removeParticipants(targetJid, formattedParticipants);
        break;
      case 'promote':
        result = await client.group.promoteParticipants(targetJid, formattedParticipants);
        break;
      case 'demote':
        result = await client.group.demoteParticipants(targetJid, formattedParticipants);
        break;
      default:
        return res.status(400).json({ error: 'Ação inválida. Use "add", "remove", "promote" ou "demote".' });
    }

    return res.json({ success: true, result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const leaveGroup = async (req: TenantRequest, res: Response) => {
  const { sessionId, jid } = req.params;
  const tenantId = req.tenantId!;

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    const targetJid = jid.includes('@') ? jid : `${jid}@g.us`;
    await client.group.leaveGroup([targetJid]);

    return res.json({ success: true, message: 'Você saiu do grupo.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const getGroupInvite = async (req: TenantRequest, res: Response) => {
  const { sessionId, jid } = req.params;
  const tenantId = req.tenantId!;

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    const targetJid = jid.includes('@') ? jid : `${jid}@g.us`;
    const code = await client.group.queryInviteCode(targetJid);
    return res.json({ success: true, inviteLink: `https://chat.whatsapp.com/${code}`, code });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const revokeGroupInvite = async (req: TenantRequest, res: Response) => {
  const { sessionId, jid } = req.params;
  const tenantId = req.tenantId!;

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    const targetJid = jid.includes('@') ? jid : `${jid}@g.us`;
    const result = await client.group.revokeInvite(targetJid);
    return res.json({ success: true, newCode: result.code, result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const joinGroup = async (req: TenantRequest, res: Response) => {
  const { sessionId } = req.params;
  const { code } = req.body;
  const tenantId = req.tenantId!;

  if (!code) {
    return res.status(400).json({ error: 'O código de convite é obrigatório.' });
  }

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    const cleanCode = code.replace('https://chat.whatsapp.com/', '');
    const groupMetadata = await client.group.joinGroupViaInvite(cleanCode);
    return res.json({ success: true, groupMetadata });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

// ==========================================
// 2. CANAIS / NEWSLETTERS
// ==========================================

export const createNewsletter = async (req: TenantRequest, res: Response) => {
  const { sessionId } = req.params;
  const { name, description } = req.body;
  const tenantId = req.tenantId!;

  if (!name) {
    return res.status(400).json({ error: 'O campo "name" é obrigatório.' });
  }

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    const metadata = await client.newsletter.create({ name, description });
    return res.status(201).json({ success: true, newsletter: metadata });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const listNewsletters = async (req: TenantRequest, res: Response) => {
  const { sessionId } = req.params;
  const tenantId = req.tenantId!;

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    const newsletters = await client.newsletter.listSubscribed();
    return res.json({ success: true, newsletters });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const getNewsletterInfo = async (req: TenantRequest, res: Response) => {
  const { sessionId, jid } = req.params;
  const tenantId = req.tenantId!;

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    const targetJid = jid.includes('@') ? jid : `${jid}@newsletter`;
    const metadata = await client.newsletter.fetch(targetJid);
    return res.json({ success: true, metadata });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const deleteNewsletter = async (req: TenantRequest, res: Response) => {
  const { sessionId, jid } = req.params;
  const tenantId = req.tenantId!;

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    const targetJid = jid.includes('@') ? jid : `${jid}@newsletter`;
    await client.newsletter.delete(targetJid);
    return res.json({ success: true, message: 'Canal excluído permanentemente.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const followNewsletter = async (req: TenantRequest, res: Response) => {
  const { sessionId, jid } = req.params;
  const tenantId = req.tenantId!;

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    const targetJid = jid.includes('@') ? jid : `${jid}@newsletter`;
    await client.newsletter.follow(targetJid);
    return res.json({ success: true, message: 'Agora você está seguindo este canal.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const unfollowNewsletter = async (req: TenantRequest, res: Response) => {
  const { sessionId, jid } = req.params;
  const tenantId = req.tenantId!;

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    const targetJid = jid.includes('@') ? jid : `${jid}@newsletter`;
    await client.newsletter.unfollow(targetJid);
    return res.json({ success: true, message: 'Você deixou de seguir este canal.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const muteNewsletter = async (req: TenantRequest, res: Response) => {
  const { sessionId, jid } = req.params;
  const { mute } = req.body;
  const tenantId = req.tenantId!;

  if (mute === undefined) {
    return res.status(400).json({ error: 'O campo "mute" (boolean) é obrigatório.' });
  }

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    const targetJid = jid.includes('@') ? jid : `${jid}@newsletter`;
    await client.newsletter.mute({ newsletterJid: targetJid, mute });
    return res.json({ success: true, message: mute ? 'Canal silenciado.' : 'Canal desmutado.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

// ==========================================
// 3. COMUNIDADES (Communities)
// ==========================================

export const createCommunity = async (req: TenantRequest, res: Response) => {
  const { sessionId } = req.params;
  const { subject, description } = req.body;
  const tenantId = req.tenantId!;

  if (!subject) {
    return res.status(400).json({ error: 'O campo "subject" é obrigatório.' });
  }

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    const community = await client.group.createCommunity(subject, { description });
    return res.status(201).json({ success: true, community });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const linkSubgroups = async (req: TenantRequest, res: Response) => {
  const { sessionId, jid } = req.params; // communityJid
  const { subgroupJids } = req.body;
  const tenantId = req.tenantId!;

  if (!subgroupJids || !Array.isArray(subgroupJids)) {
    return res.status(400).json({ error: 'O campo "subgroupJids" (array) é obrigatório.' });
  }

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    const communityJid = jid.includes('@') ? jid : `${jid}@g.us`;
    const formattedSubgroups = subgroupJids.map(s => s.includes('@') ? s : `${s}@g.us`);

    const result = await client.group.linkSubGroups(communityJid, formattedSubgroups);
    return res.json({ success: true, result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const unlinkSubgroups = async (req: TenantRequest, res: Response) => {
  const { sessionId, jid } = req.params; // communityJid
  const { subgroupJids, removeOrphanedMembers } = req.body;
  const tenantId = req.tenantId!;

  if (!subgroupJids || !Array.isArray(subgroupJids)) {
    return res.status(400).json({ error: 'O campo "subgroupJids" (array) é obrigatório.' });
  }

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    const communityJid = jid.includes('@') ? jid : `${jid}@g.us`;
    const formattedSubgroups = subgroupJids.map(s => s.includes('@') ? s : `${s}@g.us`);

    const result = await client.group.unlinkSubGroups(communityJid, formattedSubgroups, {
      removeOrphanedMembers,
    });
    return res.json({ success: true, result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const deactivateCommunity = async (req: TenantRequest, res: Response) => {
  const { sessionId, jid } = req.params;
  const tenantId = req.tenantId!;

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    const communityJid = jid.includes('@') ? jid : `${jid}@g.us`;
    await client.group.deactivateCommunity(communityJid);
    return res.json({ success: true, message: 'Comunidade desativada permanentemente.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

// ==========================================
// 4. CONTATOS E VERIFICAÇÃO (Contacts)
// ==========================================

export const checkNumbers = async (req: TenantRequest, res: Response) => {
  const { sessionId } = req.params;
  const { numbers } = req.body;
  const tenantId = req.tenantId!;

  if (!numbers || !Array.isArray(numbers)) {
    return res.status(400).json({ error: 'O campo "numbers" (array de strings) é obrigatório.' });
  }

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    // Zapo-JS resolve contatos usando getLidsByPhoneNumbers
    const results = await client.profile.getLidsByPhoneNumbers(numbers);
    
    // Retornar formatado para o usuário
    const formatted = results.map(r => ({
      input: r.queriedJid,
      phone: r.phoneJid,
      lid: r.lidJid,
      exists: r.exists,
      invalid: r.invalid,
    }));

    return res.json({ success: true, results: formatted });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const getContactProfile = async (req: TenantRequest, res: Response) => {
  const { sessionId, jid } = req.params;
  const tenantId = req.tenantId!;

  try {
    const client = await getClientForTenant(sessionId, tenantId);
    if (!client) return res.status(444).json({ error: 'Sessão inexistente, inativa ou sem permissão.' });

    const targetJid = jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;
    
    // Buscar foto de perfil e status/sobre em paralelo
    const [picture, statusResult, about] = await Promise.all([
      client.profile.getProfilePicture(targetJid).catch(() => ({} as any)),
      client.profile.getStatus(targetJid).catch(() => ({ status: null } as any)),
      client.profile.getAboutStatus(targetJid).catch(() => null),
    ]);

    return res.json({
      success: true,
      profile: {
        jid: targetJid,
        pictureUrl: picture.url || null,
        status: statusResult.status || about || null,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};
