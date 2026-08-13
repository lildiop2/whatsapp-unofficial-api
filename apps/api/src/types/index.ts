import { Request } from 'express';

export interface TenantRequest extends Request {
  tenantId?: string;
  tenant?: {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  };
}
