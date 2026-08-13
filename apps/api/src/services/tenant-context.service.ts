import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantStore {
  tenantId: string;
}

export const tenantLocalStorage = new AsyncLocalStorage<TenantStore>();
