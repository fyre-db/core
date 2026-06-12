import { describe, it, expect, afterEach } from 'vitest';
import {
  FyreDb,
  defineEntity,
  MemoryStorageAdapter,
} from '@/index';
import type { Repository } from '@/repo';

type Task = { title: string; done: boolean };

const TaskDef = defineEntity<Task>('task');

describe('Dirty tracking integration', () => {
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

  it('isDirty transitions — false → true after save → false after sync', async () => {
    const fyredb = track(new FyreDb({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: new MemoryStorageAdapter(),
      cloudAdapter: new MemoryStorageAdapter(),
      deviceId: 'dev-1',
    }));

    const tenant = await fyredb.tenants.create({
      name: 'Test',
      meta: { b: 1 },
    });
    await fyredb.tenants.open(tenant.id);

    // Initially not dirty
    expect(fyredb.isDirty).toBe(false);

    // Save makes it dirty
    const repo = fyredb.repo(TaskDef) as Repository<Task>;
    repo.save({ title: 'Test', done: false });
    expect(fyredb.isDirty).toBe(true);

    // Sync clears dirty
    await fyredb.tenants.sync();
    expect(fyredb.isDirty).toBe(false);
  });

  it('isDirty$ observable — emits true on save, false on sync', async () => {
    const fyredb = track(new FyreDb({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: new MemoryStorageAdapter(),
      cloudAdapter: new MemoryStorageAdapter(),
      deviceId: 'dev-1',
    }));

    const tenant = await fyredb.tenants.create({
      name: 'Test',
      meta: { b: 1 },
    });
    await fyredb.tenants.open(tenant.id);

    const emissions: boolean[] = [];
    const sub = fyredb.observe('dirty').subscribe(v => emissions.push(v));

    // Save
    const repo = fyredb.repo(TaskDef) as Repository<Task>;
    repo.save({ title: 'Test', done: false });

    // Sync
    await fyredb.tenants.sync();

    sub.unsubscribe();

    // Should have emitted: false (initial from BehaviorSubject), true (after save), false (after sync)
    expect(emissions).toContain(false);
    expect(emissions).toContain(true);
    expect(emissions[emissions.length - 1]).toBe(false);
  });
});




