import { DEFAULT_OPTIONS, createDataAdapter, wrapAdapter } from '../helpers';
import { describe, it, expect } from 'vitest';
import {
  NOOP_ENCRYPTION_SERVICE,
  InvalidEncryptionKeyError,
  MemoryStorageAdapter,
} from '@/adapter';
import type { Tenant, StorageAdapter, EncryptionService } from '@/adapter';
import type { SyncEngineType, SyncEvent } from '@/sync';
import type { ReactiveFlag } from '@/utils';
import type { EntityStore } from '@/store';
import type { DataAdapter } from '@/persistence';
import { EventBus } from '@/reactive';
import {
  TenantManager,
  TenantContext,
  TenantListManager,
  writeMarkerBlob,
} from '@/tenant';
import type { TenantManagerDeps } from '@/tenant';

// ─── Helpers ─────────────────────────────────────────────

/** Flush pending microtasks so async constructor init (TenantListManager) completes. */
const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function stubSyncEngine(): SyncEngineType {
  return {
    sync: async () => ({
      result: { changesForA: [], changesForB: [], stale: false, maxHlc: undefined },
      deduplicated: false,
    }),
    run: async () => [],
    ensurePartition: async () => {},
    startScheduler: () => {},
    stopScheduler: () => {},
    drain: async () => {},
    dispose: async () => {},
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

/**
 * A raw storage adapter and a NOOP-encrypted data adapter that share the same
 * underlying byte store. Needed for probe/join tests because `probe` checks
 * existence via the raw adapter and reads the marker via the data adapter.
 */
function sharedAdapters(): { raw: MemoryStorageAdapter; adapter: DataAdapter } {
  const raw = new MemoryStorageAdapter();
  return { raw, adapter: wrapAdapter(raw) };
}

function makeTenant(id: string, meta: Record<string, unknown> = {}, overrides?: Partial<Tenant>): Tenant {
  const now = new Date();
  return { id, name: '', encrypted: false, meta, createdAt: now, updatedAt: now, ...overrides };
}

/** Seed a tenant list blob directly (replaces the removed `saveTenantList`). */
async function seedTenantList(adapter: DataAdapter, tenants: readonly Tenant[]): Promise<void> {
  const entities: Record<string, Tenant> = {};
  for (const t of tenants) entities[t.id] = t;
  await adapter.write(undefined, DEFAULT_OPTIONS.tenantKey, {
    [DEFAULT_OPTIONS.tenantKey]: entities,
    deleted: {},
  });
}

function mockEncryptionService(overrides: Partial<EncryptionService>): EncryptionService {
  return { ...NOOP_ENCRYPTION_SERVICE, ...overrides };
}

// ─── Tenant list persistence (now owned by TenantListManager) ─────

describe('TenantListManager persistence', () => {
  it('starts empty when no blob exists', async () => {
    const adapter = createDataAdapter();
    const list = new TenantListManager(adapter, undefined, DEFAULT_OPTIONS);
    await flush();
    expect(list.tenants).toEqual([]);
  });

  it('starts empty when blob has no tenant entries', async () => {
    const adapter = createDataAdapter();
    await adapter.write(undefined, DEFAULT_OPTIONS.tenantKey, { deleted: {} });
    const list = new TenantListManager(adapter, undefined, DEFAULT_OPTIONS);
    await flush();
    expect(list.tenants).toEqual([]);
  });

  it('persists added tenants and reloads them in a new manager', async () => {
    const adapter = createDataAdapter();
    const now = new Date('2026-03-23T12:00:00Z');
    const list = new TenantListManager(adapter, undefined, DEFAULT_OPTIONS);
    await list.add({ id: 't1', name: 'Tenant 1', encrypted: false, meta: { folder: 'abc' }, createdAt: now, updatedAt: now });

    const reloaded = new TenantListManager(adapter, undefined, DEFAULT_OPTIONS);
    await flush();
    expect(reloaded.tenants).toHaveLength(1);
    expect(reloaded.find('t1')?.id).toBe('t1');
    expect(reloaded.find('t1')?.name).toBe('Tenant 1');
  });

  it('stores the list under the configured tenantKey', async () => {
    const adapter = createDataAdapter();
    const now = new Date();
    const list = new TenantListManager(adapter, undefined, DEFAULT_OPTIONS);
    await list.add({ id: 't1', name: 'T', encrypted: false, meta: {}, createdAt: now, updatedAt: now });
    const data = await adapter.read(undefined, DEFAULT_OPTIONS.tenantKey);
    expect(data).not.toBeNull();
  });

  it('still persists locally when the cloud save fails', async () => {
    // init() succeeds (cloud read returns empty); only the cloud *write* in
    // persist() rejects. add() should swallow the cloud failure (logged warn)
    // and keep the tenant in the local list.
    const local = createDataAdapter();
    const now = new Date();
    let cloudWriteAttempts = 0;
    const cloud: DataAdapter = {
      read: async () => null,
      write: async (_t, key) => {
        if (key === DEFAULT_OPTIONS.tenantKey) {
          cloudWriteAttempts++;
          throw new Error('cloud unreachable');
        }
      },
      delete: async () => false,
    };

    const list = new TenantListManager(local, cloud, DEFAULT_OPTIONS);
    await flush();

    await expect(
      list.add({ id: 'tc', name: 'Cloud Fail', encrypted: false, meta: {}, createdAt: now, updatedAt: now }),
    ).resolves.toBeUndefined();

    expect(cloudWriteAttempts).toBeGreaterThan(0);
    expect(list.find('tc')?.id).toBe('tc');

    // Reloading from local proves the tenant was persisted locally.
    const reloaded = new TenantListManager(local, undefined, DEFAULT_OPTIONS);
    await flush();
    expect(reloaded.find('tc')?.id).toBe('tc');
  });
});

describe('TenantManager', () => {
  describe('tenants', () => {
    it('returns empty array initially', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await flush();
      expect(tm.tenants).toEqual([]);
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
      const { raw, adapter } = sharedAdapters();
      await writeMarkerBlob(adapter, makeTenant('probe-id'), [], DEFAULT_OPTIONS);
      const tm = new TenantManager(makeDeps(adapter, {
        rawAdapter: raw,
        rawCloudAdapter: cloudWithDerive(() => 'probe-id'),
      }));
      const result = await tm.probe({ meta: {} });
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(result.encrypted).toBe(false);
        expect(result.tenantId).toBe('probe-id');
      }
    });

    it('returns encrypted: true when marker read throws (parse/decrypt failure)', async () => {
      const { raw, adapter: base } = sharedAdapters();
      await writeMarkerBlob(base, makeTenant('fail-id'), [], DEFAULT_OPTIONS);
      const failAdapter: DataAdapter = {
        read: async (tenant, key) => {
          if (key === DEFAULT_OPTIONS.markerKey && tenant?.id === 'fail-id') {
            throw new InvalidEncryptionKeyError('decrypt failed');
          }
          return base.read(tenant, key);
        },
        write: base.write.bind(base),
        delete: base.delete.bind(base),
      };
      const tm = new TenantManager(makeDeps(failAdapter, {
        rawAdapter: raw,
        rawCloudAdapter: cloudWithDerive(() => 'fail-id'),
      }));
      const result = await tm.probe({ meta: {} });
      expect(result.exists).toBe(true);
      if (result.exists) expect(result.encrypted).toBe(true);
    });

    it('treats any marker read failure as encrypted (best-effort probe)', async () => {
      // Current source uses a bare catch in probe: any failure reading the
      // marker (not just InvalidEncryptionKeyError) is reported as encrypted.
      const { raw, adapter: base } = sharedAdapters();
      await writeMarkerBlob(base, makeTenant('err-id'), [], DEFAULT_OPTIONS);
      const failAdapter: DataAdapter = {
        read: async (tenant, key) => {
          if (key === DEFAULT_OPTIONS.markerKey && tenant?.id === 'err-id') {
            throw new Error('disk failure');
          }
          return base.read(tenant, key);
        },
        write: base.write.bind(base),
        delete: base.delete.bind(base),
      };
      const tm = new TenantManager(makeDeps(failAdapter, {
        rawAdapter: raw,
        rawCloudAdapter: cloudWithDerive(() => 'err-id'),
      }));
      const result = await tm.probe({ meta: {} });
      expect(result.exists).toBe(true);
      if (result.exists) expect(result.encrypted).toBe(true);
    });
  });

  describe('create', () => {
    it('creates tenant with name and timestamps', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const tenant = await tm.create({ name: 'My App', meta: { bucket: 'x' } });
      expect(tenant.name).toBe('My App');
      expect(tenant.createdAt).toBeInstanceOf(Date);
      expect(tenant.updatedAt).toBeInstanceOf(Date);
    });

    it('generates an 8-char ID when no deriveTenantId is available', async () => {
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
      const system = (marker as Record<string, unknown>)[DEFAULT_OPTIONS.systemEntityKey] as Record<string, unknown>;
      const markerData = system['marker'] as { version: number };
      expect(markerData.version).toBe(1);
    });

    it('persists tenant to the list', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const created = await tm.create({ name: 'T', meta: {} });
      expect(tm.tenants).toHaveLength(1);
      expect(tm.tenants[0].id).toBe(created.id);
    });

    it('throws when creating where a workspace already exists', async () => {
      const { raw, adapter } = sharedAdapters();
      await writeMarkerBlob(adapter, makeTenant('dup-id', { folder: 'f' }), [], DEFAULT_OPTIONS);
      const tm = new TenantManager(makeDeps(adapter, {
        rawAdapter: raw,
        rawCloudAdapter: cloudWithDerive(() => 'dup-id'),
      }));
      await expect(tm.create({ name: 'T', meta: { folder: 'f' } })).rejects.toThrow(
        'Workspace already exists at this location',
      );
    });
  });

  describe('open', () => {
    it('sets active tenant', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const created = await tm.create({ name: 'T1', meta: {} });
      await tm.open(created.id);
      expect(tm.activeTenant?.id).toBe(created.id);
    });

    it('throws for unknown tenant ID', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await expect(tm.open('unknown')).rejects.toThrow('Tenant not found: unknown');
    });

    it('notifies subscribers', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const created = await tm.create({ name: 'T1', meta: {} });

      const values: (string | undefined)[] = [];
      tm.activeTenant$.subscribe(t => values.push(t?.id));

      await tm.open(created.id);
      expect(values).toContain(created.id);
    });
  });

  describe('join', () => {
    it('reads marker blob and adds tenant', async () => {
      const { raw, adapter } = sharedAdapters();
      await writeMarkerBlob(adapter, makeTenant('shared-id', { folder: 'shared' }), [], DEFAULT_OPTIONS);
      const tm = new TenantManager(makeDeps(adapter, {
        rawAdapter: raw,
        rawCloudAdapter: cloudWithDerive(() => 'shared-id'),
      }));
      const tenant = await tm.join({ meta: { folder: 'shared' }, name: 'Shared' });
      expect(tenant.name).toBe('Shared');
      expect(tm.tenants).toHaveLength(1);
    });

    it('throws if no marker blob found', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      await expect(tm.join({ meta: { folder: 'empty' }, name: 'X' })).rejects.toThrow(
        'No workspace found at this location',
      );
    });

    it('returns existing tenant if already in list', async () => {
      const { raw, adapter } = sharedAdapters();
      await writeMarkerBlob(adapter, makeTenant('derived-id', { folder: 'f1' }), [], DEFAULT_OPTIONS);
      const tm = new TenantManager(makeDeps(adapter, {
        rawAdapter: raw,
        rawCloudAdapter: cloudWithDerive(() => 'derived-id'),
      }));
      const t1 = await tm.join({ meta: { folder: 'f1' }, name: 'A' });
      const t2 = await tm.join({ meta: { folder: 'f1' }, name: 'B' });
      expect(t1.id).toBe(t2.id);
      expect(tm.tenants).toHaveLength(1);
    });

    // INTENTIONALLY FAILING — exposes a genuine source bug.
    // `validateMarkerBlob` (marker-blob.ts:48) and the 'workspace-incompatible'
    // TenantError kind (errors.ts:8) both exist but are never called from
    // `probe`/`register`/`join`. A workspace written by a newer, incompatible
    // version is silently joined instead of being rejected. This test asserts
    // the correct behaviour (rejection) and currently fails because the source
    // does not validate the marker version. Do NOT mask by removing it.
    it('throws for incompatible workspace version', async () => {
      const { raw, adapter } = sharedAdapters();
      await adapter.write(makeTenant('bad-ver'), DEFAULT_OPTIONS.markerKey, {
        [DEFAULT_OPTIONS.systemEntityKey]: {
          marker: { version: 99, createdAt: new Date().toISOString(), entityTypes: [] },
        },
        deleted: {},
      });
      const tm = new TenantManager(makeDeps(adapter, {
        rawAdapter: raw,
        rawCloudAdapter: cloudWithDerive(() => 'bad-ver'),
      }));
      await expect(tm.join({ meta: {}, name: 'X' })).rejects.toThrow(/incompatible/i);
    });

    it('detects encrypted workspace via parse failure during join', async () => {
      const { raw, adapter: base } = sharedAdapters();
      await writeMarkerBlob(base, makeTenant('enc-join'), [], DEFAULT_OPTIONS);
      const failAdapter: DataAdapter = {
        read: async (tenant, key) => {
          if (key === DEFAULT_OPTIONS.markerKey && tenant?.id === 'enc-join') {
            throw new InvalidEncryptionKeyError('decrypt failed');
          }
          return base.read(tenant, key);
        },
        write: base.write.bind(base),
        delete: base.delete.bind(base),
      };
      const tm = new TenantManager(makeDeps(failAdapter, {
        rawAdapter: raw,
        rawCloudAdapter: cloudWithDerive(() => 'enc-join'),
      }));
      const tenant = await tm.join({ meta: {}, name: 'X' });
      expect(tenant.encrypted).toBe(true);
    });

    it('joins when the marker becomes unreadable during version validation', async () => {
      // probe() reads the (unencrypted) marker successfully, so encrypted=false
      // and the version-validation branch runs. There readMarkerBlob throws
      // (transient failure) → the catch treats the marker as absent and the
      // join proceeds without rejecting.
      const { raw, adapter: base } = sharedAdapters();
      await writeMarkerBlob(base, makeTenant('flaky-join'), [], DEFAULT_OPTIONS);
      let markerReads = 0;
      const flakyAdapter: DataAdapter = {
        read: async (tenant, key) => {
          if (key === DEFAULT_OPTIONS.markerKey && tenant?.id === 'flaky-join') {
            markerReads++;
            if (markerReads >= 2) throw new Error('transient read failure');
          }
          return base.read(tenant, key);
        },
        write: base.write.bind(base),
        delete: base.delete.bind(base),
      };
      const tm = new TenantManager(makeDeps(flakyAdapter, {
        rawAdapter: raw,
        rawCloudAdapter: cloudWithDerive(() => 'flaky-join'),
      }));
      const tenant = await tm.join({ meta: {}, name: 'Flaky' });
      expect(tenant.id).toBe('flaky-join');
      expect(tenant.encrypted).toBe(false);
      expect(tm.tenants).toHaveLength(1);
      expect(markerReads).toBeGreaterThanOrEqual(2);
    });
  });

  describe('remove', () => {
    it('removes tenant from list', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const created = await tm.create({ name: 'T', meta: {} });
      await tm.remove(created.id);
      expect(tm.tenants).toHaveLength(0);
    });

    it('clears active tenant if removed is active', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const created = await tm.create({ name: 'T', meta: {} });
      await tm.open(created.id);
      expect(tm.activeTenant?.id).toBe(created.id);
      await tm.remove(created.id);
      expect(tm.activeTenant).toBeUndefined();
    });

    it('does not delete cloud data', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const created = await tm.create({ name: 'T', meta: { f: '1' } });
      await tm.remove(created.id);
      // Marker blob should still exist
      const marker = await adapter.read(created, DEFAULT_OPTIONS.markerKey);
      expect(marker).not.toBeNull();
    });
  });

  describe('remove with purge', () => {
    it('removes tenant from list and deletes cloud data', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const created = await tm.create({ name: 'T', meta: { f: '1' } });
      await tm.remove(created.id, { purge: true });
      expect(tm.tenants).toHaveLength(0);
    });

    it('clears active tenant if deleted is active', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));
      const created = await tm.create({ name: 'T', meta: {} });
      await tm.open(created.id);
      await tm.remove(created.id, { purge: true });
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
      const tenant = await tm.create({ name: 'T', meta: {} });
      await tm.open(tenant.id);

      // Write a marker that has indexes with partition keys
      const markerBlob = {
        [DEFAULT_OPTIONS.systemEntityKey]: {
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

      await tm.remove(tenant.id, { purge: true });

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
      const tenant = await tm.create({ name: 'T', meta: {} });
      await tm.open(tenant.id);

      // Write a marker without indexes field
      const markerBlob = {
        [DEFAULT_OPTIONS.systemEntityKey]: {
          marker: { version: 1, createdAt: new Date().toISOString(), entityTypes: [] },
        },
        deleted: {},
      };
      await adapter.write(tenant, DEFAULT_OPTIONS.markerKey, markerBlob);

      await tm.remove(tenant.id, { purge: true });
      const markerAfter = await adapter.read(tenant, DEFAULT_OPTIONS.markerKey);
      expect(markerAfter).toBeNull();
    });
  });

  describe('open - encrypted tenant edge cases', () => {
    it('throws when no credential provided for encrypted tenant', async () => {
      const adapter = createDataAdapter();
      const tm = new TenantManager(makeDeps(adapter));

      // create with encryption marks the tenant encrypted (NOOP service)
      const tenant = await tm.create({ name: 'Encrypted', meta: {}, encryption: { credential: 'pw' } });
      expect(tenant.encrypted).toBe(true);

      await expect(tm.open(tenant.id)).rejects.toThrow('Credential required');
      expect(tm.activeTenant).toBeUndefined();
    });

    it('opens encrypted tenant when marker has no keyData', async () => {
      const { raw, adapter } = sharedAdapters();
      const tenant = makeTenant('enc-nokd', {}, { name: 'Enc NoKeyData', encrypted: true });
      await seedTenantList(adapter, [tenant]);
      // Marker without keyData
      await writeMarkerBlob(adapter, tenant, [], DEFAULT_OPTIONS);

      const encryptionService = mockEncryptionService({
        deriveKeys: async () => ({ kek: 'mock-kek' }),
      });
      const tm = new TenantManager(makeDeps(adapter, { rawAdapter: raw, encryptionService }));
      await flush();

      await tm.open('enc-nokd', { credential: 'pass' });
      expect(tm.activeTenant?.id).toBe('enc-nokd');
    });

    it('pulls the encryption marker from cloud when missing locally', async () => {
      // Data adapter can read the marker (so open succeeds), but the *raw*
      // local bytes are absent — they must be pulled from rawCloudAdapter and
      // cached locally so deriveKeys has the encryption envelope.
      const adapter = createDataAdapter();
      const raw = new MemoryStorageAdapter();
      const tenant = makeTenant('enc-cloud-pull', {}, { name: 'Cloud Pull', encrypted: true });
      await seedTenantList(adapter, [tenant]);
      await writeMarkerBlob(adapter, tenant, [], DEFAULT_OPTIONS);

      const cloudMarkerBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      let cloudReads = 0;
      const rawCloudAdapter: StorageAdapter = {
        read: async (_t, key) => {
          if (key === DEFAULT_OPTIONS.markerKey) {
            cloudReads++;
            return cloudMarkerBytes;
          }
          return null;
        },
        write: async () => {},
        delete: async () => false,
      };

      const receivedRawBytes: (Uint8Array | null | undefined)[] = [];
      const encryptionService = mockEncryptionService({
        deriveKeys: async (_cred, _appId, rawMarkerBytes) => {
          receivedRawBytes.push(rawMarkerBytes);
          return { kek: 'mock-kek' };
        },
      });

      const tm = new TenantManager(makeDeps(adapter, { rawAdapter: raw, rawCloudAdapter, encryptionService }));
      await flush();

      await tm.open('enc-cloud-pull', { credential: 'pass' });

      expect(tm.activeTenant?.id).toBe('enc-cloud-pull');
      expect(cloudReads).toBe(1);
      // The cloud bytes were cached in the local raw adapter...
      expect(await raw.read(tenant, DEFAULT_OPTIONS.markerKey)).toEqual(cloudMarkerBytes);
      // ...and handed to deriveKeys.
      expect(receivedRawBytes).toEqual([cloudMarkerBytes]);
    });

    it('clears the tenant context and rethrows when key derivation fails', async () => {
      const adapter = createDataAdapter();
      const raw = new MemoryStorageAdapter();
      const tenant = makeTenant('enc-derive-fail', {}, { name: 'Derive Fail', encrypted: true });
      await seedTenantList(adapter, [tenant]);
      await writeMarkerBlob(adapter, tenant, [], DEFAULT_OPTIONS);

      const encryptionService = mockEncryptionService({
        deriveKeys: async () => {
          throw new Error('derive boom');
        },
      });
      const ctx = new TenantContext();
      const tm = new TenantManager(makeDeps(adapter, { rawAdapter: raw, encryptionService, tenantContext: ctx }));
      await flush();

      await expect(tm.open('enc-derive-fail', { credential: 'pass' })).rejects.toThrow('derive boom');
      expect(tm.activeTenant).toBeUndefined();
      expect(ctx.activeTenant).toBeUndefined();
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
      const created = await tm.create({ name: 'T', meta: {} });
      await tm.open(created.id);
      await expect(tm.changeCredential('old', 'new')).rejects.toThrow('Current tenant is not encrypted');
    });

    it('error recovery restores encryption keys on marker-write failure', async () => {
      const { raw, adapter: base } = sharedAdapters();
      const now = new Date();
      const tenant = makeTenant('enc-cp', {}, { name: 'Encrypted', encrypted: true });

      // Marker with keyData so readMarkerBlob returns a valid marker
      await base.write(tenant, DEFAULT_OPTIONS.markerKey, {
        [DEFAULT_OPTIONS.systemEntityKey]: {
          marker: { version: 1, createdAt: now.toISOString(), entityTypes: [], keyData: { dek: 'fakeDek' } },
        },
        deleted: {},
      });

      const verifiedOldKeys: unknown = { kek: 'old-kek', dek: 'old-dek' };
      const rekeyedKeys: unknown = { kek: 'new-kek', dek: 'old-dek' };
      const encryptionService = mockEncryptionService({
        deriveKeys: async () => verifiedOldKeys,
        loadKeyData: async () => verifiedOldKeys,
        rekey: async () => ({ keys: rekeyedKeys, keyData: { dek: 'fakeDek' } }),
      });

      // Wrap adapter to fail on the marker write triggered by changeCredential
      let trapMarkerWrite = false;
      const failingAdapter: DataAdapter = {
        read: base.read.bind(base),
        write: async (t, key, blob) => {
          if (key === DEFAULT_OPTIONS.markerKey && trapMarkerWrite) {
            throw new Error('write failed');
          }
          return base.write(t, key, blob);
        },
        delete: base.delete.bind(base),
      };

      const ctx = new TenantContext();
      const tm = new TenantManager(makeDeps(failingAdapter, {
        rawAdapter: raw,
        encryptionService,
        tenantContext: ctx,
      }));

      // Set active tenant via context (bypass open which needs real crypto)
      ctx.set(tenant, verifiedOldKeys);

      // Enable the write trap so the next marker write fails
      trapMarkerWrite = true;

      await expect(tm.changeCredential('old', 'new')).rejects.toThrow('write failed');

      // Verify infallible rollback restored the old keys (same reference)
      expect(ctx.getKeys()).toBe(verifiedOldKeys);
    });

    it('throws when marker cannot be read during changeCredential', async () => {
      const adapter = createDataAdapter();
      const tenant = makeTenant('enc-nm', {}, { name: 'Encrypted', encrypted: true });

      // No marker blob written to `adapter` — readMarkerBlob returns undefined.
      // Provide raw marker bytes via a separate rawAdapter so deriveKeys has a salt.
      const rawAdapter = new MemoryStorageAdapter();
      await rawAdapter.write(tenant, DEFAULT_OPTIONS.markerKey, new Uint8Array(32));

      const encryptionService = mockEncryptionService({
        deriveKeys: async () => ({ kek: 'kek' }),
      });

      const ctx = new TenantContext();
      const tm = new TenantManager(makeDeps(adapter, { rawAdapter, encryptionService, tenantContext: ctx }));
      ctx.set(tenant, { kek: 'kek' });

      await expect(tm.changeCredential('old', 'new')).rejects.toThrow('Failed to read marker blob');
    });

    it('works when marker has no keyData', async () => {
      const adapter = createDataAdapter();
      const now = new Date();
      const tenant = makeTenant('enc-nkd', {}, { name: 'Encrypted', encrypted: true });

      // Marker WITHOUT keyData
      await adapter.write(tenant, DEFAULT_OPTIONS.markerKey, {
        [DEFAULT_OPTIONS.systemEntityKey]: {
          marker: { version: 1, createdAt: now.toISOString(), entityTypes: [] },
        },
        deleted: {},
      });

      const rawAdapter = new MemoryStorageAdapter();
      await rawAdapter.write(tenant, DEFAULT_OPTIONS.markerKey, new Uint8Array(32));

      const derivedKeys: unknown = { kek: 'kek', dek: 'dek' };
      const newKeys: unknown = { kek: 'new', dek: 'dek' };
      const encryptionService = mockEncryptionService({
        deriveKeys: async () => derivedKeys,
        rekey: async () => ({ keys: newKeys, keyData: { dek: 'wrapped' } }),
      });

      const ctx = new TenantContext();
      const tm = new TenantManager(makeDeps(adapter, { rawAdapter, encryptionService, tenantContext: ctx }));
      ctx.set(tenant, derivedKeys);

      await tm.changeCredential('old', 'new');
      expect(ctx.getKeys()).toEqual(newKeys);
    });

    it('also writes the rekeyed marker to the cloud adapter when configured', async () => {
      const adapter = createDataAdapter();
      const now = new Date();
      const tenant = makeTenant('enc-cloud-cp', {}, { name: 'Encrypted', encrypted: true });

      await adapter.write(tenant, DEFAULT_OPTIONS.markerKey, {
        [DEFAULT_OPTIONS.systemEntityKey]: {
          marker: { version: 1, createdAt: now.toISOString(), entityTypes: ['task'] },
        },
        deleted: {},
      });

      const rawAdapter = new MemoryStorageAdapter();
      await rawAdapter.write(tenant, DEFAULT_OPTIONS.markerKey, new Uint8Array(32));

      const derivedKeys: unknown = { kek: 'kek', dek: 'dek' };
      const newKeys: unknown = { kek: 'new', dek: 'dek' };
      const encryptionService = mockEncryptionService({
        deriveKeys: async () => derivedKeys,
        rekey: async () => ({ keys: newKeys, keyData: { dek: 'wrapped' } }),
      });

      // A cloud data adapter that records marker writes.
      const cloudBase = createDataAdapter();
      const cloudMarkerWrites: string[] = [];
      const cloudAdapter: DataAdapter = {
        read: cloudBase.read.bind(cloudBase),
        write: async (t, key, blob) => {
          if (key === DEFAULT_OPTIONS.markerKey && t?.id === 'enc-cloud-cp') {
            cloudMarkerWrites.push(key);
          }
          return cloudBase.write(t, key, blob);
        },
        delete: cloudBase.delete.bind(cloudBase),
      };

      const ctx = new TenantContext();
      const tm = new TenantManager(makeDeps(adapter, {
        rawAdapter, encryptionService, tenantContext: ctx, cloudAdapter,
      }));
      ctx.set(tenant, derivedKeys);

      await tm.changeCredential('old', 'new');

      expect(ctx.getKeys()).toEqual(newKeys);
      // Marker rewritten both locally and to the cloud.
      expect(cloudMarkerWrites).toEqual([DEFAULT_OPTIONS.markerKey]);
      const cloudMarker = await cloudAdapter.read(tenant, DEFAULT_OPTIONS.markerKey);
      expect(cloudMarker).not.toBeNull();
    });
  });
});
