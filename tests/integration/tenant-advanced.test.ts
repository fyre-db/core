import { wrapAdapter } from '../helpers';
import { describe, it, expect, afterEach } from 'vitest';
import {
  FyreDb,
  defineEntity,
  MemoryStorageAdapter,
  saveTenantPrefs,
  loadTenantPrefs,
  pushTenantList,
  pullTenantList,
  loadTenantList,
  resolveOptions,
} from '@/index';
import type { Tenant } from '@/index';

type Task = { title: string; done: boolean };

const TaskDef = defineEntity<Task>('task');

describe('Tenant advanced integration', () => {
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

  it('tenant preferences sync — save prefs on A, load on B via shared cloud', async () => {
    const sharedCloud = wrapAdapter(new MemoryStorageAdapter());
    const now = new Date();
    const tenant: Tenant = { id: 'prefs-test', name: 'Test', encrypted: false, meta: { folder: 'shared' }, createdAt: now, updatedAt: now };

    // Device A saves prefs to cloud
    await saveTenantPrefs(sharedCloud, tenant, {
      name: 'My Workspace',
    });

    // Device B loads prefs from cloud
    const loaded = await loadTenantPrefs(sharedCloud, tenant);

    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe('My Workspace');
  });

  it('tenant list multi-device merge — A creates X, B creates Y, both end up with both', async () => {
    const sharedCloudRaw = new MemoryStorageAdapter();
    const localARaw = new MemoryStorageAdapter();
    const localBRaw = new MemoryStorageAdapter();

    const sharedCloud = wrapAdapter(sharedCloudRaw);
    const localADa = wrapAdapter(localARaw);
    const localBDa = wrapAdapter(localBRaw);

    // Device A creates tenant X
    const fyredbA = track(new FyreDb({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: localARaw,
      deviceId: 'dev-A',
    }));
    await fyredbA.tenants.create({ name: 'Tenant X', meta: { b: 'x' } });

    // Device B creates tenant Y
    const fyredbB = track(new FyreDb({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: localBRaw,
      deviceId: 'dev-B',
    }));
    await fyredbB.tenants.create({ name: 'Tenant Y', meta: { b: 'y' } });

    const opts = resolveOptions();

    // A pushes → cloud = [X]
    await pushTenantList(localADa, sharedCloud, opts);

    // B pulls → B merges local [Y] with cloud [X] → B has [X, Y]
    await pullTenantList(localBDa, sharedCloud, opts);

    // B pushes → cloud = [X, Y]
    await pushTenantList(localBDa, sharedCloud, opts);

    // A pulls → A merges local [X] with cloud [X, Y] → A has [X, Y]
    await pullTenantList(localADa, sharedCloud, opts);

    // Both should have both tenants
    const listA = await loadTenantList(localADa, opts);
    const listB = await loadTenantList(localBDa, opts);

    expect(listA).toHaveLength(2);
    expect(listB).toHaveLength(2);

    const namesA = listA.map(t => t.name).sort();
    const namesB = listB.map(t => t.name).sort();
    expect(namesA).toEqual(['Tenant X', 'Tenant Y']);
    expect(namesB).toEqual(['Tenant X', 'Tenant Y']);
  });
});





