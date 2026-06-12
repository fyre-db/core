import { describe, it, expect, afterEach } from 'vitest';
import { firstValueFrom, filter } from 'rxjs';
import {
  FyreDb,
  defineEntity,
  MemoryStorageAdapter,
} from '@/index';
import type { StorageAdapter } from '@/index';
import type { Repository } from '@/repo';

type Task = { title: string; done: boolean };

const TaskDef = defineEntity<Task>('task');

describe('Lifecycle advanced integration', () => {
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

  it('empty entity definitions throws', () => {
    expect(() => new FyreDb({
      appId: 'test',
      entities: [],
      localAdapter: new MemoryStorageAdapter(),
      deviceId: 'dev-1',
    })).toThrow('At least one entity definition is required');
  });

  it('duplicate entity names throws', () => {
    const TaskDef2 = defineEntity<Task>('task');

    expect(() => new FyreDb({
      appId: 'test',
      entities: [TaskDef, TaskDef2],
      localAdapter: new MemoryStorageAdapter(),
      deviceId: 'dev-1',
    })).toThrow('Duplicate entity name: task');
  });

  it('data persists to local adapter on dispose', async () => {
    const innerAdapter = new MemoryStorageAdapter();

    const fyredb = track(new FyreDb({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: innerAdapter,
      deviceId: 'dev-1',
    }));

    const tenant = await fyredb.tenants.create({
      name: 'Test',
      meta: { b: 1 },
    });
    await fyredb.tenants.open(tenant.id);

    const repo = fyredb.repo(TaskDef) as Repository<Task>;
    for (let i = 0; i < 5; i++) {
      repo.save({ title: `Task ${i}`, done: false });
    }

    await fyredb.dispose();

    // After dispose, data should be flushed to local adapter
    const blob = await innerAdapter.read(tenant, 'task._');
    expect(blob).not.toBeNull();
  });

  it('tenant load triggers hydrate from cloud automatically', async () => {
    const sharedCloud = new MemoryStorageAdapter();

    // Device A: create, save, sync
    const localA = new MemoryStorageAdapter();
    const fyredbA = track(new FyreDb({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: localA,
      cloudAdapter: sharedCloud,
      deviceId: 'device-A',
    }));
    const tenant = await fyredbA.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
    });
    await fyredbA.tenants.open(tenant.id);

    const repoA = fyredbA.repo(TaskDef) as Repository<Task>;
    const id = repoA.save({ title: 'From A', done: false });
    await fyredbA.tenants.sync();

    // Device B: load tenant → auto-hydrate from cloud (no explicit sync needed)
    const localB = new MemoryStorageAdapter();
    const fyredbB = track(new FyreDb({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: localB,
      cloudAdapter: sharedCloud,
      deviceId: 'device-B',
    }));
    await fyredbB.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
      id: tenant.id,
    });
    await fyredbB.tenants.open(tenant.id);

    const repoB = fyredbB.repo(TaskDef) as Repository<Task>;
    const entity = await firstValueFrom(repoB.observe(id).pipe(filter((e): e is NonNullable<typeof e> => e !== undefined)));
    expect(entity).toBeDefined();
    expect(entity!.title).toBe('From A');
  });
});




