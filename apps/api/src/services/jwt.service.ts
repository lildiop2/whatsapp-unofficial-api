import jwt from 'jsonwebtoken';
import { validateEnv } from '@zap/shared';

const env = validateEnv(process.env);
const JWT_SECRET = env.JWT_SECRET;

export interface TokenPayload {
  userId: string;
  email: string;
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'TENANT_USER';
  tenantId: string | null;
}

export const signToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};

export const verifyToken = (token: string): TokenPayload => {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
};
