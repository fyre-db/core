import type { StorageAdapter, Tenant } from './types';
import { compositeKey } from '@/utils';

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly store = new Map<string, Uint8Array>();

  read(tenant: Tenant | undefined, key: string): Promise<Uint8Array | null> {
    const data = this.store.get(compositeKey(tenant, key));
    return Promise.resolve(data !== undefined ? data.slice() : null);
  }

  write(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<void> {
    this.store.set(compositeKey(tenant, key), data.slice());
    return Promise.resolve();
  }

  delete(tenant: Tenant | undefined, key: string): Promise<boolean> {
    return Promise.resolve(this.store.delete(compositeKey(tenant, key)));
  }
}



