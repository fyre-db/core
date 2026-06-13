import { wrapAdapter } from '../helpers';
import { describe, it, expect, afterEach } from 'vitest';
import {
  FyreDb,
  defineEntity,
  MemoryStorageAdapter,
  resolveOptions,
} from '@/index';
import type { Repository } from '@/repo';
import { loadAllIndexes } from '@/persistence';

type Task = { title: string; done: boolean };

const TaskDef = defineEntity<Task>('task');

describe('syncBetween integration', () => {
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

  async function createDevice(
    deviceId: string,
    cloudAdapter: InstanceType<typeof MemoryStorageAdapter>,
  ) {
    const localAdapter = new MemoryStorageAdapter();
    const fyredb = track(new FyreDb({
      appId: 'test',
      entities: [TaskDef],
      localAdapter,
      cloudAdapter,
      deviceId,
    }));
    return { fyredb, localAdapter };
  }

  it('deletedCount is tracked in partition index after flush and sync', async () => {
    const sharedCloud = new MemoryStorageAdapter();

    const { fyredb: fyredbA, localAdapter } = await createDevice('device-A', sharedCloud);
    const tenant = await fyredbA.tenants.create({
      name: 'Test',
      meta: { folder: 'test' },
    });
    await fyredbA.tenants.open(tenant.id);

    const repo = fyredbA.repo(TaskDef) as Repository<Task>;
    const id1 = repo.save({ title: 'Task 1', done: false });
    const id2 = repo.save({ title: 'Task 2', done: false });
    repo.delete(id2);

    await fyredbA.tenants.sync();

    const indexes = await loadAllIndexes(wrapAdapter(localAdapter), tenant, resolveOptions());
    const taskIndex = indexes['task'];
    expect(taskIndex).toBeDefined();
    const partitionEntry = Object.values(taskIndex)[0];
    expect(partitionEntry).toBeDefined();
    expect(partitionEntry.deletedCount).toBeGreaterThanOrEqual(1);
  });

  it('syncBetween propagates data bidirectionally through full lifecycle', async () => {
    const sharedCloud = new MemoryStorageAdapter();

    // Device A saves data and syncs
    const { fyredb: fyredbA } = await createDevice('device-A', sharedCloud);
    const tenant = await fyredbA.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
    });
    await fyredbA.tenants.open(tenant.id);

    const repoA = fyredbA.repo(TaskDef) as Repository<Task>;
    const idA = repoA.save({ title: 'From A', done: false });
    await fyredbA.tenants.sync();

    // Device B saves different data and syncs
    const { fyredb: fyredbB } = await createDevice('device-B', sharedCloud);
    await fyredbB.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
      id: tenant.id,
    });
    await fyredbB.tenants.open(tenant.id);

    const repoB = fyredbB.repo(TaskDef) as Repository<Task>;
    const idB = repoB.save({ title: 'From B', done: true });
    await fyredbB.tenants.sync();

    // Device A syncs again — should get B's data
    await fyredbA.tenants.sync();

    expect(repoA.get(idB)).toBeDefined();
    expect(repoA.get(idB)!.title).toBe('From B');

    // Device B should still have A's data from hydrate
    expect(repoB.get(idA)).toBeDefined();
    expect(repoB.get(idA)!.title).toBe('From A');
  });

  it('indexes are consistent on both local and cloud after sync', async () => {
    const sharedCloud = new MemoryStorageAdapter();

    const { fyredb, localAdapter } = await createDevice('device-A', sharedCloud);
    const tenant = await fyredb.tenants.create({
      name: 'Test',
      meta: { folder: 'test' },
    });
    await fyredb.tenants.open(tenant.id);

    const repo = fyredb.repo(TaskDef) as Repository<Task>;
    repo.save({ title: 'Task 1', done: false });
    await fyredb.tenants.sync();

    const localIndexes = await loadAllIndexes(wrapAdapter(localAdapter), tenant, resolveOptions());
    const cloudIndexes = await loadAllIndexes(wrapAdapter(sharedCloud), tenant, resolveOptions());

    const localEntry = localIndexes['task']?.['_'];
    const cloudEntry = cloudIndexes['task']?.['_'];

    expect(localEntry).toBeDefined();
    expect(cloudEntry).toBeDefined();
    expect(localEntry.hash).toBe(cloudEntry.hash);
    expect(localEntry.count).toBe(cloudEntry.count);
  });
});






