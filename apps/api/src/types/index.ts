import { Request } from 'express';

export interface TenantRequest extends Request {
  tenantId?: string;
  tenant?: {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  };
  user?: {
    id: string;
    email: string;
    name: string;
    role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'TENANT_USER';
    tenantId: string | null;
  };
}
