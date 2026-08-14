import { Router } from 'express';
import {
  createGroup,
  listGroups,
  getGroupInfo,
  updateGroup,
  manageParticipants,
  leaveGroup,
  getGroupInvite,
  revokeGroupInvite,
  joinGroup,
  createNewsletter,
  listNewsletters,
  getNewsletterInfo,
  deleteNewsletter,
  followNewsletter,
  unfollowNewsletter,
  muteNewsletter,
  createCommunity,
  linkSubgroups,
  unlinkSubgroups,
  deactivateCommunity,
  checkNumbers,
  getContactProfile,
} from '../controllers/management.controller.js';

const router = Router({ mergeParams: true });

// 1. Grupos (Groups)
router.post('/groups', createGroup);
router.get('/groups', listGroups);
router.post('/groups/join', joinGroup);
router.get('/groups/:jid', getGroupInfo);
router.patch('/groups/:jid', updateGroup);
router.post('/groups/:jid/participants', manageParticipants);
router.post('/groups/:jid/leave', leaveGroup);
router.get('/groups/:jid/invite', getGroupInvite);
router.post('/groups/:jid/invite/revoke', revokeGroupInvite);

// 2. Canais (Newsletters)
router.post('/newsletters', createNewsletter);
router.get('/newsletters', listNewsletters);
router.get('/newsletters/:jid', getNewsletterInfo);
router.delete('/newsletters/:jid', deleteNewsletter);
router.post('/newsletters/:jid/follow', followNewsletter);
router.post('/newsletters/:jid/unfollow', unfollowNewsletter);
router.post('/newsletters/:jid/mute', muteNewsletter);

// 3. Comunidades (Communities)
router.post('/communities', createCommunity);
router.post('/communities/:jid/link', linkSubgroups);
router.post('/communities/:jid/unlink', unlinkSubgroups);
router.delete('/communities/:jid', deactivateCommunity);

// 4. Contatos (Contacts)
router.post('/contacts/check', checkNumbers);
router.get('/contacts/:jid/profile', getContactProfile);

export default router;
