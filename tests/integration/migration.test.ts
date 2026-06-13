import { describe, it, expect } from 'vitest';
import { createDataAdapter } from '../helpers';
import { Store } from '@/store';
import { DEFAULT_OPTIONS } from '../helpers';
import { loadPartitionFromAdapter } from '@/store/flush';
import type { Hlc } from '@/hlc';
import type { BlobMigration } from '@/schema/migration';

describe('Schema migration integration', () => {
  it('migrates v1 blob to v2 on load', async () => {
    const adapter = createDataAdapter();
    const store = new Store(DEFAULT_OPTIONS);

    const hlc = { timestamp: 1, counter: 0, nodeId: 'a' } as Hlc;
    await adapter.write(undefined, 'item.global', {
      __v: 1,
      item: {
        id1: { id: 'id1', name: 'alice', hlc },
      },
      deleted: {},
    });

    const migrations: BlobMigration[] = [
      {
        version: 2,
        migrate: (b) => {
          const items = b['item'] as Record<string, Record<string, unknown>>;
          const migrated: Record<string, unknown> = {};
          for (const [id, entity] of Object.entries(items)) {
            migrated[id] = { ...entity, displayName: String(entity.name).toUpperCase() };
          }
          return { ...b, item: migrated };
        },
      },
    ];

    const entities = await loadPartitionFromAdapter(adapter, undefined, store, 'item', 'global', migrations);
    expect(entities.size).toBe(1);
    const entity = entities.get('id1') as Record<string, unknown>;
    expect(entity.name).toBe('alice');
    expect(entity.displayName).toBe('ALICE');
  });

  it('applies sequential blob migrations v1→v2→v3', async () => {
    const adapter = createDataAdapter();
    const store = new Store(DEFAULT_OPTIONS);

    const hlc = { timestamp: 1, counter: 0, nodeId: 'a' } as Hlc;
    await adapter.write(undefined, 'item.global', {
      __v: 1,
      item: {
        id1: { id: 'id1', name: 'bob', hlc },
      },
      deleted: {},
    });

    const migrations: BlobMigration[] = [
      {
        version: 2,
        migrate: (b) => {
          const items = b['item'] as Record<string, Record<string, unknown>>;
          const migrated: Record<string, unknown> = {};
          for (const [id, entity] of Object.entries(items)) {
            migrated[id] = { ...entity, displayName: String(entity.name).toUpperCase() };
          }
          return { ...b, item: migrated };
        },
      },
      {
        version: 3,
        migrate: (b) => {
          const items = b['item'] as Record<string, Record<string, unknown>>;
          const migrated: Record<string, unknown> = {};
          for (const [id, entity] of Object.entries(items)) {
            migrated[id] = { ...entity, priority: 0 };
          }
          return { ...b, item: migrated };
        },
      },
    ];

    const entities = await loadPartitionFromAdapter(adapter, undefined, store, 'item', 'global', migrations);
    const entity = entities.get('id1') as Record<string, unknown>;
    expect(entity.name).toBe('bob');
    expect(entity.displayName).toBe('BOB');
    expect(entity.priority).toBe(0);
  });

  it('no-op when blob version matches', async () => {
    const adapter = createDataAdapter();
    const store = new Store(DEFAULT_OPTIONS);

    const hlc = { timestamp: 1, counter: 0, nodeId: 'a' } as Hlc;
    await adapter.write(undefined, 'item.global', {
      __v: 2,
      item: {
        id1: { id: 'id1', name: 'charlie', displayName: 'CHARLIE', hlc },
      },
      deleted: {},
    });

    const migrations: BlobMigration[] = [
      {
        version: 2,
        migrate: () => { throw new Error('should not run'); },
      },
    ];

    const entities = await loadPartitionFromAdapter(adapter, undefined, store, 'item', 'global', migrations);
    const entity = entities.get('id1') as Record<string, unknown>;
    expect(entity.name).toBe('charlie');
    expect(entity.displayName).toBe('CHARLIE');
  });

  it('works without migrations (backward compatible)', async () => {
    const adapter = createDataAdapter();
    const store = new Store(DEFAULT_OPTIONS);

    const hlc = { timestamp: 1, counter: 0, nodeId: 'a' } as Hlc;
    await adapter.write(undefined, 'item.global', {
      item: {
        id1: { id: 'id1', name: 'dave', hlc },
      },
      deleted: {},
    });

    const entities = await loadPartitionFromAdapter(adapter, undefined, store, 'item', 'global');
    expect(entities.size).toBe(1);
    const entity = entities.get('id1') as Record<string, unknown>;
    expect(entity.name).toBe('dave');
  });

  it('blob __v is set after migration', async () => {
    const adapter = createDataAdapter();
    const store = new Store(DEFAULT_OPTIONS);

    const hlc = { timestamp: 1, counter: 0, nodeId: 'a' } as Hlc;
    await adapter.write(undefined, 'item.global', {
      __v: 1,
      item: {
        id1: { id: 'id1', name: 'eve', hlc },
      },
      deleted: {},
    });

    const migrations: BlobMigration[] = [
      {
        version: 2,
        migrate: (b) => ({ ...b }),
      },
    ];

    // After loading with migrations, the blob is migrated internally
    const entities = await loadPartitionFromAdapter(adapter, undefined, store, 'item', 'global', migrations);
    expect(entities.size).toBe(1);
  });
});

