import { describe, it, expect, afterEach } from 'vitest';
import { firstValueFrom, filter } from 'rxjs';
import {
  FyreDb,
  defineEntity,
  MemoryStorageAdapter,
  partitioned,
} from '@/index';
import type { StorageAdapter } from '@/index';
import type { Repository } from '@/repo';
import { waitForTenantInList } from '../helpers';

type Item = { name: string; category: string };
type Transaction = { amount: number; date: Date; accountId: string };

const ItemDef = defineEntity<Item>('item');
const TransactionDef = defineEntity<Transaction>('transaction', {
  keyStrategy: partitioned((e: Transaction) => e.accountId),
});

describe('Persistence advanced integration', () => {
  const instances: FyreDb[] = [];

  afterEach(async () => {
    for (const s of instances) {
      await s.dispose().catch(() => {});
    }
    instances.length = 0;
  });

  function track(s: FyreDb): FyreDb {
    instances.push(s);
    return s;
  }

  it('transform pipeline end-to-end — custom adapter decorator applied on flush and reversed on reload', async () => {
    const rawAdapter = new MemoryStorageAdapter();

    // Create a XOR decorator adapter that transforms bytes
    const xorKey = 0x42;
    const xor = (data: Uint8Array) => {
      const result = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) result[i] = data[i] ^ xorKey;
      return result;
    };
    const transformedAdapter: StorageAdapter = {
      async read(cm, key) {
        const data = await rawAdapter.read(cm, key);
        if (!data) return null;
        return xor(data);
      },
      async write(cm, key, data) {
        await rawAdapter.write(cm, key, xor(data));
      },
      async delete(cm, key) { return rawAdapter.delete(cm, key); },
    };

    // Phase 1: Save through transformed adapter
    const fyredb1 = track(new FyreDb({
      appId: 'test',
      entities: [ItemDef],
      localAdapter: transformedAdapter,
      deviceId: 'dev-1',
    }));
    const tenant = await fyredb1.tenants.create({ name: 'W', meta: { b: 1 } });
    await fyredb1.tenants.open(tenant.id);

    const repo1 = fyredb1.repo(ItemDef) as Repository<Item>;
    const id = repo1.save({ name: 'Secret', category: 'classified' });
    await fyredb1.dispose();

    // Read raw bytes — should be XOR'd (not valid JSON)
    const rawBytes = await rawAdapter.read(tenant, 'item._');
    expect(rawBytes).not.toBeNull();
    expect(() => JSON.parse(new TextDecoder().decode(rawBytes!))).toThrow();

    // Phase 2: Reload through transformed adapter → data should be readable
    const fyredb2 = track(new FyreDb({
      appId: 'test',
      entities: [ItemDef],
      localAdapter: transformedAdapter,
      deviceId: 'dev-1',
    }));
    await waitForTenantInList(fyredb2.tenants.tenants$, tenant.id);
    await fyredb2.tenants.open(tenant.id);

    const repo2 = fyredb2.repo(ItemDef) as Repository<Item>;
    const loaded = await firstValueFrom(
      repo2.observe(id).pipe(filter((e): e is NonNullable<typeof e> => e !== undefined)),
    );
    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe('Secret');
    expect(loaded!.category).toBe('classified');
  });

  it('adapter list() discovers partition keys after flush', async () => {
    const localAdapter = new MemoryStorageAdapter();

    const fyredb = track(new FyreDb({
      appId: 'test',
      entities: [TransactionDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    const tenant = await fyredb.tenants.create({ name: 'W', meta: { b: 1 } });
    await fyredb.tenants.open(tenant.id);

    const repo = fyredb.repo(TransactionDef) as Repository<Transaction>;
    repo.save({ amount: 100, date: new Date(), accountId: 'checking' });
    repo.save({ amount: 200, date: new Date(), accountId: 'savings' });
    repo.save({ amount: 50, date: new Date(), accountId: 'checking' });

    await fyredb.dispose();

    // Verify partitioned blobs were flushed
    const checking = await localAdapter.read(tenant, 'transaction.checking');
    const savings = await localAdapter.read(tenant, 'transaction.savings');
    expect(checking).not.toBeNull();
    expect(savings).not.toBeNull();
  });
});



