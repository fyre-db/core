import { DEFAULT_OPTIONS, createDataAdapter } from '../helpers';
import { describe, it, expect } from 'vitest';
import { NOOP_ENCRYPTION_SERVICE } from '@/adapter';
import type { Tenant, StorageAdapter } from '@/adapter';
import type { SyncEngineType } from '@/sync';
import type { ReactiveFlag } from '@/utils';
import type { EntityStore } from '@/store';
import type { DataAdapter } from '@/persistence';
import {
  TenantManager,
  TenantContext,
  writeMarkerBlob,
  saveTenantPrefs,
} from '@/tenant';
import type { TenantManagerDeps } from '@/tenant';

function makeTenant(id: string, meta: Record<string, unknown>): Tenant {
  return { id, name: '', encrypted: false, meta, createdAt: new Date(), updatedAt: new Date() };
}

function stubSyncEngine(): SyncEngineType {
  return {
    sync: async () => ({ result: { changesForA: [], changesForB: [], stale: false, maxHlc: undefined }, deduplicated: false }),
    run: async () => [],
    startScheduler: () => {},
    stopScheduler: () => {},
    emit: () => {},
    on: () => {},
    off: () => {},
    drain: async () => {},
    dispose: () => {},
  };
}

function makeDeps(adapter: DataAdapter, overrides?: Partial<TenantManagerDeps>): TenantManagerDeps {
  return {
    adapter,
    syncEngine: stubSyncEngine(),
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
  it('join reads marker blob and detects existing workspace', async () => {
    const adapter = createDataAdapter();
    const tempTenant = makeTenant('shared-id', { folder: 'shared' });
    await writeMarkerBlob(adapter, tempTenant, ['transaction'], DEFAULT_OPTIONS);

    const tm = new TenantManager(makeDeps(adapter, { rawCloudAdapter: cloudWithDerive(() => 'shared-id') }));
    const tenant = await tm.join({ meta: { folder: 'shared' }, name: 'Project X' });
    expect(tenant).toBeDefined();
    expect(tenant.name).toBe('Project X');
  });

  it('derives same tenant ID as creator via deriveTenantId', async () => {
    const deriveFn = (meta: Record<string, unknown>) =>
      (meta as { folderId: string }).folderId.substring(0, 4);

    // User A creates
    const adapterA = createDataAdapter();
    const tmA = new TenantManager(makeDeps(adapterA, { rawCloudAdapter: cloudWithDerive(deriveFn) }));
    const tenantA = await tmA.create({ name: 'Project X', meta: { folderId: 'abc12345' } });

    // User B sets up (separate adapter simulating separate device, marker blob must exist)
    const adapterB = createDataAdapter();
    const tenantRefB = makeTenant('abc1', { folderId: 'abc12345' });
    await writeMarkerBlob(adapterB, tenantRefB, [], DEFAULT_OPTIONS);
    const tmB = new TenantManager(makeDeps(adapterB, { rawCloudAdapter: cloudWithDerive(deriveFn) }));
    const tenantB = await tmB.join({ meta: { folderId: 'abc12345' } });

    expect(tenantA.id).toBe('abc1');
    expect(tenantB.id).toBe('abc1');
    expect(tenantA.id).toBe(tenantB.id);
  });

  it('merges tenant prefs into local list', async () => {
    const adapter = createDataAdapter();
    const tempTenant = makeTenant('prefs-id', { folder: 'shared' });

    await writeMarkerBlob(adapter, tempTenant, [], DEFAULT_OPTIONS);
    await saveTenantPrefs(adapter, tempTenant, { name: 'Team Project' });

    const tm = new TenantManager(makeDeps(adapter, { rawCloudAdapter: cloudWithDerive(() => 'prefs-id') }));
    const tenant = await tm.join({ meta: { folder: 'shared' } });

    expect(tenant.name).toBe('Team Project');
  });

  it('prefs name takes precedence over opts.name', async () => {
    const adapter = createDataAdapter();
    const tempTenant = makeTenant('prefs-id2', { folder: 'shared' });

    await writeMarkerBlob(adapter, tempTenant, [], DEFAULT_OPTIONS);
    await saveTenantPrefs(adapter, tempTenant, { name: 'From Prefs' });

    const tm = new TenantManager(makeDeps(adapter, { rawCloudAdapter: cloudWithDerive(() => 'prefs-id2') }));
    const tenant = await tm.join({ meta: { folder: 'shared' }, name: 'From Opts' });

    expect(tenant.name).toBe('From Prefs');
  });

  it('rejects location without valid marker blob', async () => {
    const adapter = createDataAdapter();
    const tm = new TenantManager(makeDeps(adapter, { rawCloudAdapter: cloudWithDerive(() => 'no-data') }));

    await expect(tm.join({ meta: { folder: 'empty' } })).rejects.toThrow(
      'No fyredb workspace found',
    );
  });

  it('rejects location with incompatible marker blob version', async () => {
    const adapter = createDataAdapter();
    const tempTenant = makeTenant('bad-ver', {});
    const marker = { version: 99, createdAt: new Date(), entityTypes: [] };
    await adapter.write(tempTenant, DEFAULT_OPTIONS.markerKey, { __system: { marker }, deleted: {} });

    const tm = new TenantManager(makeDeps(adapter, { rawCloudAdapter: cloudWithDerive(() => 'bad-ver') }));
    await expect(tm.join({ meta: {} })).rejects.toThrow(
      'Incompatible fyredb workspace version',
    );
  });

  it('create writes marker blob with entity types', async () => {
    const adapter = createDataAdapter();
    const tm = new TenantManager(makeDeps(adapter, { entityTypes: ['transaction', 'account'] }));

    const created = await tm.create({ name: 'My App', meta: { bucket: 'x' } });

    const { readMarkerBlob } = await import('@/tenant');
    const marker = await readMarkerBlob(adapter, created, DEFAULT_OPTIONS);
    expect(marker).toBeDefined();
    expect(marker!.entityTypes).toEqual(['transaction', 'account']);
  });
});

