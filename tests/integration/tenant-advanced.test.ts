import { describe, it, expect, afterEach } from 'vitest';
import { firstValueFrom, filter } from 'rxjs';
import {
  FyreDb,
  defineEntity,
  MemoryStorageAdapter,
} from '@/index';

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

  it('tenant list multi-device merge — A creates X, B creates Y, both end up with both', async () => {
    // A single shared cloud adapter stands in for the common remote storage two
    // devices both sync their tenant list through. The TenantListManager merges
    // local and cloud lists on construction, so each device converges on both.
    const sharedCloud = new MemoryStorageAdapter();
    const localA = new MemoryStorageAdapter();
    const localB = new MemoryStorageAdapter();

    // Device A creates tenant X — persisted to localA and the shared cloud.
    const fyredbA = track(new FyreDb({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: localA,
      cloudAdapter: sharedCloud,
      deviceId: 'dev-A',
    }));
    await fyredbA.tenants.create({ name: 'Tenant X', meta: { b: 'x' } });

    // Device B comes online with the same shared cloud → init merges X in,
    // then creates Y → the shared cloud ends up with both.
    const fyredbB = track(new FyreDb({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: localB,
      cloudAdapter: sharedCloud,
      deviceId: 'dev-B',
    }));
    await firstValueFrom(
      fyredbB.tenants.tenants$.pipe(filter(ts => ts.some(t => t.name === 'Tenant X'))),
    );
    await fyredbB.tenants.create({ name: 'Tenant Y', meta: { b: 'y' } });

    // Device A reconnects with a fresh instance → init merges cloud [X, Y].
    const fyredbA2 = track(new FyreDb({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: localA,
      cloudAdapter: sharedCloud,
      deviceId: 'dev-A',
    }));

    const listA = await firstValueFrom(
      fyredbA2.tenants.tenants$.pipe(filter(ts => ts.length === 2)),
    );
    const listB = fyredbB.tenants.tenants;

    expect(listA.map(t => t.name).sort()).toEqual(['Tenant X', 'Tenant Y']);
    expect([...listB].map(t => t.name).sort()).toEqual(['Tenant X', 'Tenant Y']);
  });
});






