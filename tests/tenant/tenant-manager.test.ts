import { DEFAULT_OPTIONS, createDataAdapter } from '../helpers';
import { describe, it, expect } from 'vitest';
import { NOOP_ENCRYPTION_SERVICE, InvalidEncryptionKeyError, MemoryStorageAdapter } from '@/adapter';
import type { Tenant, StorageAdapter } from '@/adapter';
import type { SyncEngineType } from '@/sync';
import type { SyncEvent } from '@/sync';
import type { ReactiveFlag } from '@/utils';
import type { EntityStore } from '@/store';
import type { DataAdapter } from '@/persistence';
import { EventBus } from '@/reactive';
import { loadTenantList, saveTenantList, TenantManager, TenantContext } from '@/tenant';
import type { TenantManagerDeps } from '@/tenant';

function stubSyncEngine(): SyncEngineType {
  return {
    sync: async () => ({ result: { changesForA: [], changesForB: [], stale: false, maxHlc: undefined }, deduplicated: false }),
    run: async () => [],
    startScheduler: () => {},
    stopScheduler: () => {},
    drain: async () => {},
    dispose: () => {},
  };
}

function makeDeps(adapter: DataAdapter, overrides?: Partial<TenantManagerDeps>): TenantManagerDeps {
  return {
    adapter,
    rawAdapter: new MemoryStorageAdapter(),
    syncEngine: stubSyncEngine(),
    syncEventBus: new EventBus<SyncEvent>(),
    store: { clear: () => {} } as unknown as EntityStore,
    dirtyTracker: { value: false, value$: { pipe: () => ({}) }, set: () => {}, clear: () => {} } as unknown as ReactiveFlag,
    encryptionService: NOOP_ENCRYPTION_SERVICE,
    tenantContext: new TenantContext(),
    options: DEFAULT_OPTIONS,
    appId: 'test-app',
    entityTypes: [],
    ...overrides,
  };
}

function cloudWithDerive(fn: (meta: Record<string, unknown>) => string): StorageAdapter {
  return {
    read: async () => null,
    write: async () => {},
    delete: async () => false,
    deriveTenantId: fn,
  };
}

describe('tenant list persistence', () => {
  it('loadTenantList returns empty array when no blob', async () => {
    const adapter = createDataAdapter();
    const list = await loadTenantList(adapter, DEFAULT_OPTIONS);
    expect(list).toEqual([]);
  });

  it('loadTenantList returns empty when blob has no __tenants key', async () => {
    const adapter = createDataAdapter();
    await adapter.write(undefined, DEFAULT_OPTIONS.tenantKey, { deleted: {} });
    const list = await loadTenantList(adapter, DEFAULT_OPTIONS);
    expect(list).toEqual([]);
  });

  it('save and load round-trip', async () => {
    const adapter = createDataAdapter();
    const now = new Date('2026-03-23T12:00:00Z');
    const tenants: Tenant[] = [
      { id: 't1', name: 'Tenant 1', encrypted: false, meta: { folder: 'abc' }, createdAt: now, updatedAt: now },
    ];
    await saveTenantList(adapter, tenants, DEFAULT_OPTIONS);
    const loaded = await loadTenantList(adapter, DEFAULT_OPTIONS);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('t1');
    expect(loaded[0].name).toBe('Tenant 1');
  });

  it('stores under __tenants key', async () => {
    const adapter = createDataAdapter();
    const now = new Date();
    await saveTenantList(adapter, [
      { id: 't1', name: 'T', encrypted: false, meta: {}, createdAt: now, updatedAt: now },
    ], DEFAULT_OPTIONS);
    const data = await adapter.read(undefined, DEFAULT_OPTIONS.tenantKey);
    expect(data).not.toBeNull();
  });
});

describe('TenantManager', () => {
  describe('list', () => {
    it('returns empty array initially', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const list = await tm.list();
      expect(list).toEqual([]);
    });
  });

  describe('probe', () => {
    it('returns exists: false when no marker found', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const result = await tm.probe({ meta: { folder: 'missing' } });
      expect(result.exists).toBe(false);
    });

    it('returns exists: true with unencrypted marker', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter, { rawCloudAdapter: cloudWithDerive(() => 'probe-id') }));
      const tempTenant = { id: 'probe-id', name: '', encrypted: false, meta: {}, createdAt: new Date(), updatedAt: new Date() };
      await adapter.write(tempTenant, DEFAULT_OPTIONS.markerKey, {
        __system: { marker: { version: 1, createdAt: new Date().toISOString(), entityTypes: [] } },
        deleted: {},
      });
      const result = await tm.probe({ meta: {} });
      expect(result.exists).toBe(true);
      expect(result.encrypted).toBe(false);
      expect(result.tenantId).toBe('probe-id');
    });

    it('returns encrypted: true when read throws (parse failure)', async () => {
      const adapter = createDataAdapter();
      // Make read throw to simulate encrypted data parse failure
      const failAdapter = {
        ...adapter,
        read: async (tenant: Tenant | undefined, key: string) => {
          if (key === DEFAULT_OPTIONS.markerKey && tenant?.id === 'fail-id') {
            throw new InvalidEncryptionKeyError('decrypt failed');
          }
          return adapter.read(tenant, key);
        },
        write: adapter.write.bind(adapter),
        delete: adapter.delete.bind(adapter),
      };
      const tm = new TenantManager(makeDeps(adapter, {
        adapter: failAdapter,
        rawCloudAdapter: cloudWithDerive(() => 'fail-id'),
      }));
      const result = await tm.probe({ meta: {} });
      expect(result.exists).toBe(true);
      expect(result.encrypted).toBe(true);
    });

    it('re-throws non-InvalidEncryptionKeyError from probe', async () => {
      const adapter = createDataAdapter();
      const failAdapter = {
        ...adapter,
        read: async (tenant: Tenant | undefined, key: string) => {
          if (key === DEFAULT_OPTIONS.markerKey && tenant?.id === 'err-id') {
            throw new Error('disk failure');
          }
          return adapter.read(tenant, key);
        },
        write: adapter.write.bind(adapter),
        delete: adapter.delete.bind(adapter),
      };
      const tm = new TenantManager(makeDeps(adapter, {
        adapter: failAdapter,
        rawCloudAdapter: cloudWithDerive(() => 'err-id'),
      }));
      await expect(tm.probe({ meta: {} })).rejects.toThrow('disk failure');
    });
  });

  describe('create', () => {
    it('creates tenant with provided ID', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const tenant = await tm.create({ name: 'My App', meta: { bucket: 'x' }, id: 'custom-id' });
      expect(tenant.id).toBe('custom-id');
      expect(tenant.name).toBe('My App');
      expect(tenant.createdAt).toBeInstanceOf(Date);
    });

    it('generates ID when not provided', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const tenant = await tm.create({ name: 'My App', meta: { bucket: 'x' } });
      expect(tenant.id).toHaveLength(8);
    });

    it('derives ID from meta when cloud adapter has deriveTenantId', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter, {
        rawCloudAdapter: cloudWithDerive((meta) => (meta as { folderId: string }).folderId.substring(0, 4)),
      }));
      const tenant = await tm.create({ name: 'Shared', meta: { folderId: 'abcdefgh' } });
      expect(tenant.id).toBe('abcd');
    });

    it('writes __fyredb marker blob', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const created = await tm.create({ name: 'T', meta: { folder: 'f1' } });
      const marker = await adapter.read(created, DEFAULT_OPTIONS.markerKey);
      expect(marker).not.toBeNull();
      const system = (marker as Record<string, unknown>)['__system'] as Record<string, unknown>;
      const markerData = system['marker'] as { version: number };
      expect(markerData.version).toBe(1);
    });

    it('persists tenant to list', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await tm.create({ name: 'T', meta: {}, id: 'abc' });
      const list = await tm.list();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('abc');
    });
  });

  describe('open', () => {
    it('sets active tenant', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await tm.create({ name: 'T1', meta: {}, id: 't1' });
      await tm.open('t1');
      expect(tm.activeTenant!.id).toBe('t1');
    });

    it('throws for unknown tenant ID', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await expect(tm.open('unknown')).rejects.toThrow('Tenant not found: unknown');
    });

    it('notifies subscribers', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await tm.create({ name: 'T1', meta: {}, id: 't1' });

      const values: (string | undefined)[] = [];
      tm.activeTenant$.subscribe(t => values.push(t?.id));

      await tm.open('t1');
      expect(values).toContain('t1');
    });
  });

  describe('join', () => {
    it('reads marker blob and adds tenant', async () => {
      const adapter = createDataAdapter();
      const marker = { version: 1, createdAt: new Date().toISOString(), entityTypes: [] };
      const tempTenant: Tenant = { id: 'shared-id', name: 'Shared', encrypted: false, meta: { folder: 'shared' }, createdAt: new Date(), updatedAt: new Date() };
      await adapter.write(tempTenant, DEFAULT_OPTIONS.markerKey, { __system: { marker }, deleted: {} });

      const tm = new TenantManager(makeDeps(adapter, { rawCloudAdapter: cloudWithDerive(() => 'shared-id') }));
      const tenant = await tm.join({ meta: { folder: 'shared' }, name: 'Shared' });
      expect(tenant.name).toBe('Shared');
      const list = await tm.list();
      expect(list).toHaveLength(1);
    });

    it('throws if no marker blob found', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await expect(tm.join({ meta: { folder: 'empty' } })).rejects.toThrow(
        'No fyredb workspace found',
      );
    });

    it('returns existing tenant if already in list', async () => {
      const adapter = createDataAdapter();
      const marker = { version: 1, createdAt: new Date().toISOString(), entityTypes: [] };
      const tempTenant: Tenant = { id: 'derived-id', name: '', encrypted: false, meta: { folder: 'f1' }, createdAt: new Date(), updatedAt: new Date() };
      await adapter.write(tempTenant, DEFAULT_OPTIONS.markerKey, { __system: { marker }, deleted: {} });

      const tm = new TenantManager(makeDeps(adapter, {
        rawCloudAdapter: cloudWithDerive(() => 'derived-id'),
      }));
      const t1 = await tm.join({ meta: { folder: 'f1' } });
      const t2 = await tm.join({ meta: { folder: 'f1' } });
      expect(t1.id).toBe(t2.id);
      const list = await tm.list();
      expect(list).toHaveLength(1);
    });

    it('defaults name to Shared Workspace', async () => {
      const adapter = createDataAdapter();
      const marker = { version: 1, createdAt: new Date().toISOString(), entityTypes: [] };
      const tempTenant: Tenant = { id: 'default-id', name: '', encrypted: false, meta: {}, createdAt: new Date(), updatedAt: new Date() };
      await adapter.write(tempTenant, DEFAULT_OPTIONS.markerKey, { __system: { marker }, deleted: {} });

      const tm = new TenantManager(makeDeps(adapter, { rawCloudAdapter: cloudWithDerive(() => 'default-id') }));
      const tenant = await tm.join({ meta: {} });
      expect(tenant.name).toBe('Shared Workspace');
    });

    it('throws for incompatible workspace version', async () => {
      const adapter = createDataAdapter();
      const marker = { version: 99, createdAt: new Date().toISOString(), entityTypes: [] };
      const tempTenant: Tenant = { id: 'bad-ver', name: '', encrypted: false, meta: {}, createdAt: new Date(), updatedAt: new Date() };
      await adapter.write(tempTenant, DEFAULT_OPTIONS.markerKey, { __system: { marker }, deleted: {} });

      const tm = new TenantManager(makeDeps(adapter, { rawCloudAdapter: cloudWithDerive(() => 'bad-ver') }));
      await expect(tm.join({ meta: {} })).rejects.toThrow('Incompatible fyredb workspace version');
    });

    it('detects encrypted workspace via parse failure during join', async () => {
      const adapter = createDataAdapter();
      const failAdapter = {
        ...adapter,
        read: async (tenant: Tenant | undefined, key: string) => {
          if (key === DEFAULT_OPTIONS.markerKey && tenant?.id === 'enc-join') {
            throw new InvalidEncryptionKeyError('decrypt failed');
          }
          return adapter.read(tenant, key);
        },
        write: adapter.write.bind(adapter),
        delete: adapter.delete.bind(adapter),
      };
      const tm = new TenantManager(makeDeps(adapter, {
        adapter: failAdapter,
        rawCloudAdapter: cloudWithDerive(() => 'enc-join'),
      }));
      const tenant = await tm.join({ meta: {} });
      expect(tenant.encrypted).toBe(true);
    });
  });

  describe('remove', () => {
    it('removes tenant from list', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await tm.create({ name: 'T', meta: {}, id: 't1' });
      await tm.remove('t1');
      const list = await tm.list();
      expect(list).toHaveLength(0);
    });

    it('clears active tenant if removed is active', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await tm.create({ name: 'T', meta: {}, id: 't1' });
      await tm.open('t1');
      expect(tm.activeTenant?.id).toBe('t1');
      await tm.remove('t1');
      expect(tm.activeTenant).toBeUndefined();
    });

    it('does not delete cloud data', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const created = await tm.create({ name: 'T', meta: { f: '1' }, id: 't1' });
      await tm.remove('t1');
      // Marker blob should still exist
      const marker = await adapter.read(created, DEFAULT_OPTIONS.markerKey);
      expect(marker).not.toBeNull();
    });
  });

  describe('remove with purge', () => {
    it('removes tenant from list and deletes cloud data', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await tm.create({ name: 'T', meta: { f: '1' }, id: 't1' });
      await tm.remove('t1', { purge: true });
      const list = await tm.list();
      expect(list).toHaveLength(0);
    });

    it('clears active tenant if deleted is active', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await tm.create({ name: 'T', meta: {}, id: 't1' });
      await tm.open('t1');
      await tm.remove('t1', { purge: true });
      expect(tm.activeTenant).toBeUndefined();
    });

    it('is a no-op for unknown tenant ID', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await expect(tm.remove('unknown', { purge: true })).resolves.toBeUndefined();
    });

    it('deletes partition blobs when marker has indexes', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const tenant = await tm.create({ name: 'T', meta: {}, id: 'idx1' });
      await tm.open('idx1');

      // Write a marker that has indexes with partition keys
      const markerBlob = {
        __system: {
          marker: {
            version: 1,
            createdAt: new Date().toISOString(),
            entityTypes: ['task'],
            indexes: { task: { '_': { hash: 1, count: 1, deletedCount: 0, updatedAt: 1 } } },
          },
        },
        deleted: {},
      };
      await adapter.write(tenant, DEFAULT_OPTIONS.markerKey, markerBlob);

      // Write a partition blob that should be deleted
      await adapter.write(tenant, 'task._', { task: { 'task._.a1': { id: 'a1' } }, deleted: {} });

      await tm.remove('idx1', { purge: true });

      // Partition blob should be deleted
      const partitionData = await adapter.read(tenant, 'task._');
      expect(partitionData).toBeNull();
      // Marker should be deleted
      const marker = await adapter.read(tenant, DEFAULT_OPTIONS.markerKey);
      expect(marker).toBeNull();
    });

    it('purge deletes marker even when it has no indexes', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const tenant = await tm.create({ name: 'T', meta: {}, id: 'noidx' });
      await tm.open('noidx');

      // Write a marker without indexes field
      const markerBlob = {
        __system: {
          marker: { version: 1, createdAt: new Date().toISOString(), entityTypes: [] },
        },
        deleted: {},
      };
      await adapter.write(tenant, DEFAULT_OPTIONS.markerKey, markerBlob);

      await tm.remove('noidx', { purge: true });
      const markerAfter = await adapter.read(tenant, DEFAULT_OPTIONS.markerKey);
      expect(markerAfter).toBeNull();
    });
  });

  describe('open - encrypted tenant edge cases', () => {
    it('throws when no credential provided for encrypted tenant', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));

      const now = new Date();
      const tenant: Tenant = { id: 'enc2', name: 'Encrypted', encrypted: true, meta: {}, createdAt: now, updatedAt: now };
      await saveTenantList(adapter, [tenant], DEFAULT_OPTIONS);

      await expect(tm.open('enc2')).rejects.toThrow('Credential required');
      expect(tm.activeTenant).toBeUndefined();
    });

    it('opens encrypted tenant when marker has no keyData', async () => {
      const adapter = createDataAdapter();
      const rawAdapter = new MemoryStorageAdapter();
      const mockEncService = {
        ...NOOP_ENCRYPTION_SERVICE,
        targets: ['local'] as const,
        deriveKeys: async () => ({ kek: 'mock-kek' }),
      };
      const tm = new TenantManager(makeDeps(adapter, {
        rawAdapter,
        encryptionService: mockEncService as any,
      }));

      const now = new Date();
      const tenant: Tenant = { id: 'enc-nokd', name: 'Enc NoKeyData', encrypted: true, meta: {}, createdAt: now, updatedAt: now };
      await saveTenantList(adapter, [tenant], DEFAULT_OPTIONS);

      // Write marker without keyData
      const markerBlob = {
        __system: { marker: { version: 1, createdAt: now.toISOString(), entityTypes: [] } },
        deleted: {},
      };
      await adapter.write(tenant, DEFAULT_OPTIONS.markerKey, markerBlob);

      await tm.open('enc-nokd', { credential: 'pass' });
      expect(tm.activeTenant?.id).toBe('enc-nokd');
    });
  });

  describe('open - cloud adapter', () => {
    it('emits sync-failed when cloud sync fails', async () => {
      const adapter = createDataAdapter();
      const syncEventBus = new EventBus<SyncEvent>();
      const emittedEvents: string[] = [];
      syncEventBus.all$.subscribe(e => emittedEvents.push(e.type));
      const failingSync = async (source: string) => {
        if (source === 'cloud') throw new Error('network error');
        return { result: { changesForA: [], changesForB: [], stale: false, maxHlc: undefined }, deduplicated: false };
      };
      const syncEngine = {
        ...stubSyncEngine(),
        sync: failingSync,
        run: async (_tenant: unknown, steps: [string, string][]) => {
          const results = [];
          for (const [source, target] of steps) {
            const { result } = await failingSync(source);
            results.push(result);
          }
          return results;
        },
      };
      const cloudAdapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter, { syncEngine: syncEngine as unknown as SyncEngineType, syncEventBus, cloudAdapter }));

      const now = new Date();
      const tenant: Tenant = { id: 'c1', name: 'Cloud', encrypted: false, meta: {}, createdAt: now, updatedAt: now };
      await saveTenantList(adapter, [tenant], DEFAULT_OPTIONS);
      await adapter.write(tenant, DEFAULT_OPTIONS.markerKey, {
        __system: { marker: { version: 1, createdAt: now.toISOString(), entityTypes: [] } },
        deleted: {},
      });

      await tm.open('c1');
      expect(emittedEvents).toContain('sync-failed');
    });
  });

  describe('changeCredential', () => {
    it('throws when no tenant is loaded', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await expect(tm.changeCredential('old', 'new')).rejects.toThrow('No tenant loaded');
    });

    it('throws when tenant is not encrypted', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await tm.create({ name: 'T', meta: {}, id: 'plain' });
      await tm.open('plain');
      await expect(tm.changeCredential('old', 'new')).rejects.toThrow('Current tenant is not encrypted');
    });

    it('error recovery restores encryption on failure', async () => {
      const adapter = createDataAdapter();
      const now = new Date();
      const tenant: Tenant = { id: 'enc-cp', name: 'Encrypted', encrypted: true, meta: {}, createdAt: now, updatedAt: now };
      await saveTenantList(adapter, [tenant], DEFAULT_OPTIONS);

      // Write marker with keyData so readMarkerBlob returns valid marker
      await adapter.write(tenant, DEFAULT_OPTIONS.markerKey, {
        __system: { marker: { version: 1, createdAt: now.toISOString(), entityTypes: [], keyData: { dek: 'fakeDek' } } },
        deleted: {},
      });

      // Provide raw marker bytes via rawAdapter so changeCredential can read salt
      const rawAdapter = new MemoryStorageAdapter();
      await rawAdapter.write(tenant, DEFAULT_OPTIONS.markerKey, new Uint8Array(32));

      const verifiedKeys = { kek: 'old-kek', dek: 'old-dek' };
      const rekeyedKeys = { kek: 'new-kek', dek: 'old-dek' };
      const mockService = {
        targets: ['local'] as const,
        deriveKeys: async () => verifiedKeys,
        generateKeyData: async (keys: unknown) => ({ keys }),
        loadKeyData: async () => verifiedKeys,
        rekey: async () => ({ keys: rekeyedKeys, keyData: { dek: 'fakeDek' } }),
        encrypt: async (_blobKey: string, data: Uint8Array) => data,
        decrypt: async (_blobKey: string, data: Uint8Array) => data,
      };

      // Wrap adapter to fail on marker write during changeCredential
      let allowNextMarkerWrite = false;
      const failingAdapter: DataAdapter = {
        read: adapter.read.bind(adapter),
        write: async (t, key, blob) => {
          if (key === DEFAULT_OPTIONS.markerKey && allowNextMarkerWrite) {
            throw new Error('write failed');
          }
          return adapter.write(t, key, blob);
        },
        delete: adapter.delete.bind(adapter),
      };

      const ctx = new TenantContext();
      const tm = new TenantManager(makeDeps(failingAdapter, { rawAdapter, encryptionService: mockService as any, tenantContext: ctx }));

      // Set active tenant via context (bypass open which needs real crypto)
      ctx.set(tenant, verifiedKeys as any);

      // Enable the write trap so the next marker write fails
      allowNextMarkerWrite = true;

      // Marker write will throw → enters catch block → restores old keys
      await expect(tm.changeCredential('old', 'new')).rejects.toThrow('write failed');

      // Verify infallible rollback restored old keys (no re-derivation needed)
      expect(ctx.getKeys()).toBe(verifiedKeys);
    });

    it('throws when marker cannot be read during changeCredential', async () => {
      const adapter = createDataAdapter();
      const now = new Date();
      const tenant: Tenant = { id: 'enc-nm', name: 'Encrypted', encrypted: true, meta: {}, createdAt: now, updatedAt: now };
      await saveTenantList(adapter, [tenant], DEFAULT_OPTIONS);

      // No marker blob written — readMarkerBlob returns undefined
      const rawAdapter = new MemoryStorageAdapter();
      await rawAdapter.write(tenant, DEFAULT_OPTIONS.markerKey, new Uint8Array(32));

      const mockService = {
        targets: ['local'] as const,
        deriveKeys: async () => ({ kek: 'kek' }),
        generateKeyData: async (keys: unknown) => ({ keys }),
        loadKeyData: async (keys: unknown) => keys,
        rekey: async (keys: unknown) => ({ keys, keyData: {} }),
        encrypt: async (_blobKey: string, data: Uint8Array) => data,
        decrypt: async (_blobKey: string, data: Uint8Array) => data,
      };

      const ctx = new TenantContext();
      const tm = new TenantManager(makeDeps(adapter, { rawAdapter, encryptionService: mockService as any, tenantContext: ctx }));
      ctx.set(tenant, { kek: 'kek' } as any);

      await expect(tm.changeCredential('old', 'new')).rejects.toThrow('Failed to read marker blob');
    });

    it('changeCredential works when marker has no keyData', async () => {
      const adapter = createDataAdapter();
      const now = new Date();
      const tenant: Tenant = { id: 'enc-nkd', name: 'Encrypted', encrypted: true, meta: {}, createdAt: now, updatedAt: now };
      await saveTenantList(adapter, [tenant], DEFAULT_OPTIONS);

      // Marker WITHOUT keyData
      await adapter.write(tenant, DEFAULT_OPTIONS.markerKey, {
        __system: { marker: { version: 1, createdAt: now.toISOString(), entityTypes: [] } },
        deleted: {},
      });

      const rawAdapter = new MemoryStorageAdapter();
      await rawAdapter.write(tenant, DEFAULT_OPTIONS.markerKey, new Uint8Array(32));

      const derivedKeys = { kek: 'kek', dek: 'dek' };
      const mockService = {
        targets: ['local'] as const,
        deriveKeys: async () => derivedKeys,
        generateKeyData: async (keys: unknown) => ({ keys }),
        loadKeyData: async (keys: unknown) => keys,
        rekey: async () => ({ keys: { kek: 'new', dek: 'dek' }, keyData: { dek: 'wrapped' } }),
        encrypt: async (_blobKey: string, data: Uint8Array) => data,
        decrypt: async (_blobKey: string, data: Uint8Array) => data,
      };

      const ctx = new TenantContext();
      const tm = new TenantManager(makeDeps(adapter, { rawAdapter, encryptionService: mockService as any, tenantContext: ctx }));
      ctx.set(tenant, derivedKeys as any);

      await tm.changeCredential('old', 'new');
      // Credential changed successfully — keys updated
      expect(ctx.getKeys()).toEqual({ kek: 'new', dek: 'dek' });
    });
  });
});



