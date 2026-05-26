import { describe, it, expect, afterEach } from 'vitest';
import { firstValueFrom, filter } from 'rxjs';
import {
  Strata,
  defineEntity,
  MemoryStorageAdapter,
  partitioned,
} from '@/index';
import type { Repository, SingletonRepository } from '@/repo';

type Task = { title: string; done: boolean };
type Settings = { theme: string; fontSize: number };
type Event = { name: string; date: Date; category: string };

const TaskDef = defineEntity<Task>('task');
const SettingsDef = defineEntity<Settings>('settings', { keyStrategy: 'singleton' });
const EventDef = defineEntity<Event>('event', {
  keyStrategy: partitioned((e: Event) => e.category),
});

describe('Full lifecycle integration', () => {
  const instances: Strata[] = [];

  afterEach(async () => {
    for (const s of instances) {
      await s.dispose().catch(() => {});
    }
    instances.length = 0;
  });

  function track(s: Strata): Strata {
    instances.push(s);
    return s;
  }

  it('save → dispose → reload from same local adapter → data persisted', async () => {
    const localAdapter = new MemoryStorageAdapter();
    const meta = { bucket: 'test' };

    // Phase 1: Create, save data, dispose
    const strata1 = track(new Strata({
      appId: 'test',
      entities: [TaskDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    const tenant = await strata1.tenants.create({ name: 'Workspace', meta });
    await strata1.tenants.open(tenant.id);

    const repo1 = strata1.repo(TaskDef) as Repository<Task>;
    const id1 = repo1.save({ title: 'Buy groceries', done: false });
    const id2 = repo1.save({ title: 'Write tests', done: true });

    await strata1.dispose();

    // Phase 2: Create new instance with same local adapter, verify data
    const strata2 = track(new Strata({
      appId: 'test',
      entities: [TaskDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    await strata2.tenants.open(tenant.id);

    const repo2 = strata2.repo(TaskDef) as Repository<Task>;
    const loaded1 = await firstValueFrom(repo2.observe(id1).pipe(filter((e): e is NonNullable<typeof e> => e !== undefined)));
    const loaded2 = await firstValueFrom(repo2.observe(id2).pipe(filter((e): e is NonNullable<typeof e> => e !== undefined)));

    expect(loaded1).toBeDefined();
    expect(loaded1!.title).toBe('Buy groceries');
    expect(loaded1!.done).toBe(false);

    expect(loaded2).toBeDefined();
    expect(loaded2!.title).toBe('Write tests');
    expect(loaded2!.done).toBe(true);
  });

  it('dispose flushes all dirty data before shutting down', async () => {
    const localAdapter = new MemoryStorageAdapter();
    const meta = { bucket: 'test' };

    const strata = track(new Strata({
      appId: 'test',
      entities: [TaskDef],
      localAdapter,
      deviceId: 'dev-1',
      options: { localFlushIntervalMs: 60000 }, // Long debounce to ensure data isn't flushed before dispose
    }));
    const tenant = await strata.tenants.create({ name: 'W', meta });
    await strata.tenants.open(tenant.id);

    const repo = strata.repo(TaskDef) as Repository<Task>;
    repo.save({ title: 'Urgent', done: false });

    // Dispose forces flush
    await strata.dispose();

    // Reload and verify
    const strata2 = track(new Strata({
      appId: 'test',
      entities: [TaskDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    await strata2.tenants.open(tenant.id);
    const repo2 = strata2.repo(TaskDef) as Repository<Task>;
    const all = await firstValueFrom(repo2.observeQuery().pipe(filter(arr => arr.length > 0)));
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('Urgent');
  });

  it('post-dispose: repo() throws', async () => {
    const strata = track(new Strata({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: new MemoryStorageAdapter(),
      deviceId: 'dev-1',
    }));
    await strata.dispose();

    expect(() => strata.repo(TaskDef)).toThrow('disposed');
  });

  it('post-dispose: sync() rejects', async () => {
    const cloudAdapter = new MemoryStorageAdapter();
    const strata = track(new Strata({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: new MemoryStorageAdapter(),
      cloudAdapter,
      deviceId: 'dev-1',
    }));
    const tenant = await strata.tenants.create({ name: 'T', meta: { b: 1 } });
    await strata.tenants.open(tenant.id);
    await strata.dispose();

    await expect(strata.tenants.sync()).rejects.toThrow('No tenant loaded');
  });

  it('post-dispose: loadTenant() rejects', async () => {
    const strata = track(new Strata({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: new MemoryStorageAdapter(),
      deviceId: 'dev-1',
    }));
    const tenant = await strata.tenants.create({ name: 'T', meta: { b: 1 } });
    await strata.dispose();

    await expect(strata.tenants.open(tenant.id)).rejects.toThrow('disposed');
  });

  it('dispose is idempotent — second call returns same promise', async () => {
    const strata = new Strata({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: new MemoryStorageAdapter(),
      deviceId: 'dev-1',
    });
    const p1 = strata.dispose();
    const p2 = strata.dispose();
    expect(p1).toBe(p2);
    await p1;
  });

  it('multiple entity types survive dispose → reload', async () => {
    const localAdapter = new MemoryStorageAdapter();
    const meta = { bucket: 'test' };

    const strata1 = track(new Strata({
      appId: 'test',
      entities: [TaskDef, SettingsDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    const tenant = await strata1.tenants.create({ name: 'W', meta });
    await strata1.tenants.open(tenant.id);

    const taskRepo = strata1.repo(TaskDef) as Repository<Task>;
    const settingsRepo = strata1.repo(SettingsDef) as SingletonRepository<Settings>;

    const taskId = taskRepo.save({ title: 'Task1', done: false });
    settingsRepo.save({ theme: 'dark', fontSize: 14 });

    await strata1.dispose();

    const strata2 = track(new Strata({
      appId: 'test',
      entities: [TaskDef, SettingsDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    await strata2.tenants.open(tenant.id);

    const taskRepo2 = strata2.repo(TaskDef) as Repository<Task>;
    const settingsRepo2 = strata2.repo(SettingsDef) as SingletonRepository<Settings>;

    const loadedTask = await firstValueFrom(taskRepo2.observe(taskId).pipe(filter((e): e is NonNullable<typeof e> => e !== undefined)));
    const loadedSettings = await firstValueFrom(settingsRepo2.observe().pipe(filter((e): e is NonNullable<typeof e> => e !== undefined)));

    expect(loadedTask?.title).toBe('Task1');
    expect(loadedSettings?.theme).toBe('dark');
    expect(loadedSettings?.fontSize).toBe(14);
  });

  it('partitioned entities survive dispose → reload', async () => {
    const localAdapter = new MemoryStorageAdapter();
    const meta = { bucket: 'test' };

    const strata1 = track(new Strata({
      appId: 'test',
      entities: [EventDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    const tenant = await strata1.tenants.create({ name: 'W', meta });
    await strata1.tenants.open(tenant.id);

    const repo1 = strata1.repo(EventDef) as Repository<Event>;
    const id1 = repo1.save({ name: 'Concert', date: new Date('2026-06-15'), category: 'music' });
    const id2 = repo1.save({ name: 'Conference', date: new Date('2026-07-01'), category: 'tech' });

    await strata1.dispose();

    const strata2 = track(new Strata({
      appId: 'test',
      entities: [EventDef],
      localAdapter,
      deviceId: 'dev-1',
    }));
    await strata2.tenants.open(tenant.id);

    const repo2 = strata2.repo(EventDef) as Repository<Event>;
    const loaded1 = await firstValueFrom(repo2.observe(id1).pipe(filter((e): e is NonNullable<typeof e> => e !== undefined)));
    const loaded2 = await firstValueFrom(repo2.observe(id2).pipe(filter((e): e is NonNullable<typeof e> => e !== undefined)));

    expect(loaded1?.name).toBe('Concert');
    expect(loaded1?.category).toBe('music');
    expect(loaded2?.name).toBe('Conference');
    expect(loaded2?.category).toBe('tech');
  });
});




