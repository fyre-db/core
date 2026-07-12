import { DEFAULT_OPTIONS, wrapAdapter } from '../helpers';
import { describe, it, expect } from 'vitest';
import { NOOP_ENCRYPTION_SERVICE, MemoryStorageAdapter } from '@/adapter';
import type { Tenant, StorageAdapter } from '@/adapter';
import type { SyncEngineType, SyncEvent } from '@/sync';
import type { ReactiveFlag } from '@/utils';
import type { EntityStore } from '@/store';
import type { DataAdapter } from '@/persistence';
import { EventBus } from '@/reactive';
import {
  TenantManager,
  TenantContext,
  writeMarkerBlob,
  readMarkerBlob,
} from '@/tenant';
import type { TenantManagerDeps } from '@/tenant';

function makeTenant(id: string, meta: Record<string, unknown>): Tenant {
  return { id, name: '', encrypted: false, meta, createdAt: new Date(), updatedAt: new Date() };
}

function stubSyncEngine(): SyncEngineType {
  return {
    sync: async () => ({ result: { changesForA: [], changesForB: [], stale: false, maxHlc: undefined }, deduplicated: false }),
    run: async () => [],
    runCloudCycle: async () => ({ entitiesUpdated: 0, conflictsResolved: 0, partitionsSynced: 0 }),
    ensurePartition: async () => {},
    startScheduler: () => {},
    stopScheduler: () => {},
    drain: async () => {},
    dispose: async () => {},
  };
}

// `probe` reads the marker through the raw StorageAdapter, while `writeMarkerBlob`
// writes through the (NOOP-encrypted) DataAdapter. They must share one underlying
// store, so callers pass the same MemoryStorageAdapter that backs `adapter`.
function makeDeps(
  adapter: DataAdapter,
  rawAdapter: StorageAdapter,
  overrides?: Partial<TenantManagerDeps>,
): TenantManagerDeps {
  return {
    adapter,
    rawAdapter,
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

describe('Sharing flow', () => {
  it('join adds an existing workspace to the tenant list', async () => {
    const raw = new MemoryStorageAdapter();
    const adapter = wrapAdapter(raw);
    await writeMarkerBlob(adapter, makeTenant('shared-id', { folder: 'shared' }), ['transaction'], DEFAULT_OPTIONS);

    const tm = new TenantManager(makeDeps(adapter, raw, { rawCloudAdapter: cloudWithDerive(() => 'shared-id') }));
    const tenant = await tm.join({ meta: { folder: 'shared' }, name: 'Project X' });

    expect(tenant.id).toBe('shared-id');
    expect(tenant.name).toBe('Project X');
    expect(tm.tenants).toHaveLength(1);
  });

  it('create and join derive the same tenant id via deriveTenantId', async () => {
    const deriveFn = (meta: Record<string, unknown>) =>
      (meta as { folderId: string }).folderId.substring(0, 4);

    // User A creates the workspace.
    const rawA = new MemoryStorageAdapter();
    const adapterA = wrapAdapter(rawA);
    const tmA = new TenantManager(makeDeps(adapterA, rawA, { rawCloudAdapter: cloudWithDerive(deriveFn) }));
    const tenantA = await tmA.create({ name: 'Project X', meta: { folderId: 'abc12345' } });

    // User B joins from a separate device (separate store; marker must exist there).
    const rawB = new MemoryStorageAdapter();
    const adapterB = wrapAdapter(rawB);
    await writeMarkerBlob(adapterB, makeTenant('abc1', { folderId: 'abc12345' }), [], DEFAULT_OPTIONS);
    const tmB = new TenantManager(makeDeps(adapterB, rawB, { rawCloudAdapter: cloudWithDerive(deriveFn) }));
    const tenantB = await tmB.join({ meta: { folderId: 'abc12345' }, name: 'Project X' });

    expect(tenantA.id).toBe('abc1');
    expect(tenantB.id).toBe('abc1');
    expect(tenantA.id).toBe(tenantB.id);
  });

  it('join names the joined tenant from the provided options', async () => {
    const raw = new MemoryStorageAdapter();
    const adapter = wrapAdapter(raw);
    await writeMarkerBlob(adapter, makeTenant('team-id', { folder: 'shared' }), [], DEFAULT_OPTIONS);

    const tm = new TenantManager(makeDeps(adapter, raw, { rawCloudAdapter: cloudWithDerive(() => 'team-id') }));
    const tenant = await tm.join({ meta: { folder: 'shared' }, name: 'Team Project' });

    expect(tenant.name).toBe('Team Project');
  });

  it('join rejects a location with no workspace', async () => {
    const raw = new MemoryStorageAdapter();
    const adapter = wrapAdapter(raw);
    const tm = new TenantManager(makeDeps(adapter, raw, { rawCloudAdapter: cloudWithDerive(() => 'no-data') }));

    await expect(tm.join({ meta: { folder: 'empty' }, name: 'X' })).rejects.toThrow(
      'No workspace found at this location',
    );
  });

  it('create rejects when a workspace already exists at the location', async () => {
    const raw = new MemoryStorageAdapter();
    const adapter = wrapAdapter(raw);
    await writeMarkerBlob(adapter, makeTenant('dup-id', { folder: 'shared' }), [], DEFAULT_OPTIONS);

    const tm = new TenantManager(makeDeps(adapter, raw, { rawCloudAdapter: cloudWithDerive(() => 'dup-id') }));

    await expect(tm.create({ meta: { folder: 'shared' }, name: 'X' })).rejects.toThrow(
      'Workspace already exists at this location',
    );
  });

  it('create writes a marker blob with the entity types', async () => {
    const raw = new MemoryStorageAdapter();
    const adapter = wrapAdapter(raw);
    const tm = new TenantManager(makeDeps(adapter, raw, { entityTypes: ['transaction', 'account'] }));

    const created = await tm.create({ name: 'My App', meta: { bucket: 'x' } });

    const marker = await readMarkerBlob(adapter, created, DEFAULT_OPTIONS);
    expect(marker).toBeDefined();
    expect(marker!.entityTypes).toEqual(['transaction', 'account']);
  });
});

