export type SessionStatus = 'DISCONNECTED' | 'PAIRING_REQUIRED' | 'CONNECTING' | 'CONNECTED';

export interface WhatsappSessionInfo {
  id: string;
  name: string;
  status: SessionStatus;
  webhookUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SendMessagePayload {
  to: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  fileName?: string;
}

export interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export * from './config.js';
