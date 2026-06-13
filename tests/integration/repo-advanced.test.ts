import { describe, it, expect, afterEach } from 'vitest';
import { firstValueFrom } from 'rxjs';
import {
  FyreDb,
  defineEntity,
  MemoryStorageAdapter,
} from '@/index';
import type { Repository, SingletonRepository } from '@/repo';
import type { BaseEntity } from '@/schema';

type Task = { title: string; done: boolean; priority: number };
type Settings = { theme: string; fontSize: number };
type DerivedItem = { slug: string; value: number };

const TaskDef = defineEntity<Task>('task');
const SettingsDef = defineEntity<Settings>('settings', { keyStrategy: 'singleton' });
const DerivedDef = defineEntity<DerivedItem>('derived', {
  deriveId: (e: DerivedItem) => e.slug,
});

describe('Repository advanced integration', () => {
  let fyredb: FyreDb;

  afterEach(async () => {
    if (fyredb) {
      await fyredb.dispose().catch(() => {});
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function setup(entities: any[] = [TaskDef]) {
    fyredb = new FyreDb({
      appId: 'test',
      entities,
      localAdapter: new MemoryStorageAdapter(),
      deviceId: 'dev-1',
    });
  }

  it('deriveId upsert — second save with same derived key updates existing entity', () => {
    setup([DerivedDef]);
    const repo = fyredb.repo(DerivedDef) as Repository<DerivedItem>;

    const id1 = repo.save({ slug: 'my-item', value: 10 });
    const id2 = repo.save({ slug: 'my-item', value: 20 });

    expect(id1).toBe(id2);
    const all = repo.query();
    expect(all).toHaveLength(1);
    expect(all[0].value).toBe(20);
    expect(all[0].version).toBe(2);
  });

  it('range queries — filters entities by numeric field range', () => {
    setup();
    const repo = fyredb.repo(TaskDef) as Repository<Task>;

    repo.save({ title: 'Low', done: false, priority: 1 });
    repo.save({ title: 'Mid-Low', done: false, priority: 2 });
    repo.save({ title: 'Mid', done: false, priority: 3 });
    repo.save({ title: 'Mid-High', done: false, priority: 4 });
    repo.save({ title: 'High', done: false, priority: 5 });

    const results = repo.query({
      range: { field: 'priority', gt: 2, lte: 5 },
    });

    expect(results).toHaveLength(3);
    const titles = results.map(r => r.title).sort();
    expect(titles).toEqual(['High', 'Mid', 'Mid-High']);
  });

  it('query edge cases — offset > count returns empty, limit=0 returns empty', () => {
    setup();
    const repo = fyredb.repo(TaskDef) as Repository<Task>;

    repo.save({ title: 'A', done: false, priority: 1 });
    repo.save({ title: 'B', done: false, priority: 2 });

    const offsetResult = repo.query({ offset: 100 });
    expect(offsetResult).toHaveLength(0);

    const limitResult = repo.query({ limit: 0 });
    expect(limitResult).toHaveLength(0);
  });

  it('SingletonRepository full lifecycle — get → save → get → observe → delete → get → observe', async () => {
    setup([SettingsDef]);
    const repo = fyredb.repo(SettingsDef) as SingletonRepository<Settings>;

    // Initially undefined
    expect(repo.get()).toBeUndefined();

    // Save
    repo.save({ theme: 'dark', fontSize: 14 });
    expect(repo.get()?.theme).toBe('dark');
    expect(repo.get()?.fontSize).toBe(14);

    // Observe current value
    const current = await firstValueFrom(repo.observe());
    expect(current).toBeDefined();
    expect(current!.theme).toBe('dark');

    // Delete
    const deleted = repo.delete();
    expect(deleted).toBe(true);
    expect(repo.get()).toBeUndefined();

    // Observe after delete
    const afterDelete = await firstValueFrom(repo.observe());
    expect(afterDelete).toBeUndefined();
  });

  it('multiple simultaneous observers — all receive updates, unsubscribing one keeps others', () => {
    setup();
    const repo = fyredb.repo(TaskDef) as Repository<Task>;

    const id = repo.save({ title: 'Watched', done: false, priority: 1 });

    const values1: ((Task & BaseEntity) | undefined)[] = [];
    const values2: ((Task & BaseEntity) | undefined)[] = [];
    const values3: ((Task & BaseEntity) | undefined)[] = [];

    const sub1 = repo.observe(id).subscribe(v => values1.push(v));
    const sub2 = repo.observe(id).subscribe(v => values2.push(v));
    const sub3 = repo.observe(id).subscribe(v => values3.push(v));

    // All should have received initial value
    expect(values1).toHaveLength(1);
    expect(values2).toHaveLength(1);
    expect(values3).toHaveLength(1);

    // Update entity
    repo.save({ title: 'Updated', done: true, priority: 2, id } as Task & { id: string });

    expect(values1).toHaveLength(2);
    expect(values2).toHaveLength(2);
    expect(values3).toHaveLength(2);

    // Unsubscribe sub2
    sub2.unsubscribe();

    // Another update
    repo.save({ title: 'V3', done: false, priority: 3, id } as Task & { id: string });

    expect(values1).toHaveLength(3);
    expect(values2).toHaveLength(2); // Didn't receive this update
    expect(values3).toHaveLength(3);

    sub1.unsubscribe();
    sub3.unsubscribe();
  });

  it('event bus listener cleanup — unsubscribed observer does not fire on save', () => {
    setup();
    const repo = fyredb.repo(TaskDef) as Repository<Task>;

    let callCount = 0;
    const sub = repo.observeQuery().subscribe(() => { callCount++; });

    // Initial emission
    expect(callCount).toBe(1);

    // Save triggers emission
    repo.save({ title: 'Test', done: false, priority: 1 });
    expect(callCount).toBe(2);

    // Unsubscribe
    sub.unsubscribe();

    // Another save — should NOT increase callCount
    repo.save({ title: 'Test2', done: false, priority: 2 });
    expect(callCount).toBe(2);
  });
});



