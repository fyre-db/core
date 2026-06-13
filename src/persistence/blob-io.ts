import type { StorageAdapter, EncryptionService } from '@/adapter';
import type { TenantContext } from '@/tenant/tenant-context';
import type { Tenant } from '@/adapter';
import type { PartitionBlob } from './types';
import { serialize, deserialize } from '@/utils';

export type DataAdapter = {
  read(tenant: Tenant | undefined, key: string): Promise<PartitionBlob | null>;
  write(tenant: Tenant | undefined, key: string, data: PartitionBlob): Promise<void>;
  delete(tenant: Tenant | undefined, key: string): Promise<boolean>;
};

export class EncryptedDataAdapter implements DataAdapter {
  constructor(
    private readonly adapter: StorageAdapter,
    private readonly service: EncryptionService,
    private readonly context: TenantContext,
  ) {}

  async read(tenant: Tenant | undefined, key: string): Promise<PartitionBlob | null> {
    const raw = await this.adapter.read(tenant, key);
    if (!raw) return null;
    const decrypted = await this.service.decrypt(key, raw, this.context.getKeys());
    return deserialize<PartitionBlob>(decrypted);
  }

  async write(tenant: Tenant | undefined, key: string, data: PartitionBlob): Promise<void> {
    const bytes = serialize(data);
    const encrypted = await this.service.encrypt(key, bytes, this.context.getKeys());
    await this.adapter.write(tenant, key, encrypted);
  }

  async delete(tenant: Tenant | undefined, key: string): Promise<boolean> {
    return this.adapter.delete(tenant, key);
  }
}



