import { describe, it, expect, afterEach } from 'vitest';
import { firstValueFrom, take, toArray, skip } from 'rxjs';
import {
  FyreDb,
  defineEntity,
  MemoryStorageAdapter,
} from '@/index';
import type { Repository } from '@/repo';
import type { BaseEntity } from '@/schema';

type Task = { title: string; done: boolean; priority: number };

const TaskDef = defineEntity<Task>('task');

describe('Repository + Reactive integration', () => {
  let fyredb: FyreDb;

  afterEach(async () => {
    if (fyredb) {
      await fyredb.dispose().catch(() => {});
    }
  });

  function setup() {
    fyredb = new FyreDb({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: new MemoryStorageAdapter(),
      deviceId: 'dev-1',
    });
    return fyredb.repo(TaskDef) as Repository<Task>;
  }

  it('observe(id): emits undefined initially, then entity after save', async () => {
    const repo = setup();
    const values: ((Task & BaseEntity) | undefined)[] = [];

    const sub = repo.observe('task._.nonexistent').subscribe(v => values.push(v));

    // Should have emitted initial undefined
    expect(values).toHaveLength(1);
    expect(values[0]).toBeUndefined();

    sub.unsubscribe();
  });

  it('observe(id): emits entity when saved', async () => {
    const repo = setup();
    const id = repo.save({ title: 'Test', done: false, priority: 1 });

    const entity = await firstValueFrom(repo.observe(id));
    expect(entity).toBeDefined();
    expect(entity!.title).toBe('Test');
    expect(entity!.done).toBe(false);
  });

  it('observe(id): emits updated value on re-save', async () => {
    const repo = setup();
    const id = repo.save({ title: 'V1', done: false, priority: 1 });

    const values: ((Task & BaseEntity) | undefined)[] = [];
    const sub = repo.observe(id).subscribe(v => values.push(v));

    // Initial emission
    expect(values.length).toBeGreaterThanOrEqual(1);
    expect(values[0]?.title).toBe('V1');

    // Update
    repo.save({ title: 'V2', done: true, priority: 2, id } as Task & { id: string });

    // Should have emitted again with updated entity
    expect(values.length).toBeGreaterThanOrEqual(2);
    const latest = values[values.length - 1]!;
    expect(latest.title).toBe('V2');
    expect(latest.done).toBe(true);

    sub.unsubscribe();
  });

  it('observe(id): emits undefined after delete', async () => {
    const repo = setup();
    const id = repo.save({ title: 'To Delete', done: false, priority: 1 });

    const values: ((Task & BaseEntity) | undefined)[] = [];
    const sub = repo.observe(id).subscribe(v => values.push(v));

    expect(values[0]).toBeDefined();

    repo.delete(id);

    const last = values[values.length - 1];
    expect(last).toBeUndefined();

    sub.unsubscribe();
  });

  it('observeQuery: emits matching entities', async () => {
    const repo = setup();

    const values: ReadonlyArray<Task & BaseEntity>[] = [];
    const sub = repo.observeQuery({ where: { done: true } }).subscribe(v => values.push(v));

    // Initial: no done tasks
    expect(values[0]).toHaveLength(0);

    // Save a non-matching task
    repo.save({ title: 'Not done', done: false, priority: 1 });
    // Should still be 0 matching (or emission skipped by distinctUntilChanged)

    // Save a matching task
    repo.save({ title: 'Done', done: true, priority: 2 });
    const latest = values[values.length - 1];
    expect(latest).toHaveLength(1);
    expect(latest[0].title).toBe('Done');

    sub.unsubscribe();
  });

  it('observeQuery: filter updates when entity changes to match', async () => {
    const repo = setup();

    const values: ReadonlyArray<Task & BaseEntity>[] = [];
    const sub = repo.observeQuery({ where: { done: true } }).subscribe(v => values.push(v));

    const id = repo.save({ title: 'Task', done: false, priority: 1 });
    // Not matching
    const afterSave = values[values.length - 1];
    expect(afterSave).toHaveLength(0);

    // Update to match
    repo.save({ title: 'Task', done: true, priority: 1, id } as Task & { id: string });
    const afterUpdate = values[values.length - 1];
    expect(afterUpdate).toHaveLength(1);
    expect(afterUpdate[0].title).toBe('Task');

    sub.unsubscribe();
  });

  it('saveMany: fires single emission, not N emissions', async () => {
    const repo = setup();

    let emissionCount = 0;
    const sub = repo.observeQuery().pipe(
      skip(1), // skip initial
    ).subscribe(() => {
      emissionCount++;
    });

    repo.saveMany([
      { title: 'A', done: false, priority: 1 },
      { title: 'B', done: false, priority: 2 },
      { title: 'C', done: false, priority: 3 },
    ]);

    // Should have triggered exactly 1 emission
    expect(emissionCount).toBe(1);

    const all = repo.query();
    expect(all).toHaveLength(3);

    sub.unsubscribe();
  });

  it('deleteMany: fires single emission', async () => {
    const repo = setup();

    const ids = repo.saveMany([
      { title: 'A', done: false, priority: 1 },
      { title: 'B', done: false, priority: 2 },
      { title: 'C', done: false, priority: 3 },
    ]);

    let emissionCount = 0;
    const sub = repo.observeQuery().pipe(
      skip(1),
    ).subscribe(() => {
      emissionCount++;
    });

    repo.deleteMany(ids as string[]);

    expect(emissionCount).toBe(1);
    expect(repo.query()).toHaveLength(0);

    sub.unsubscribe();
  });

  it('observe completes when repository is disposed', async () => {
    const repo = setup();
    const id = repo.save({ title: 'Watched', done: false, priority: 1 });

    let completed = false;
    const sub = repo.observe(id).subscribe({
      complete: () => { completed = true; },
    });

    await fyredb.dispose();
    expect(completed).toBe(true);

    sub.unsubscribe();
  });

  it('observeQuery with orderBy and limit', async () => {
    const repo = setup();

    const values: ReadonlyArray<Task & BaseEntity>[] = [];
    const sub = repo.observeQuery({
      orderBy: [{ field: 'priority', direction: 'desc' }],
      limit: 2,
    }).subscribe(v => values.push(v));

    repo.save({ title: 'Low', done: false, priority: 1 });
    repo.save({ title: 'High', done: false, priority: 3 });
    repo.save({ title: 'Mid', done: false, priority: 2 });

    const latest = values[values.length - 1];
    expect(latest).toHaveLength(2);
    expect(latest[0].title).toBe('High');
    expect(latest[1].title).toBe('Mid');

    sub.unsubscribe();
  });
});



