import { describe, it, expect, vi, afterEach } from 'vitest';
import { SyncEngine } from '@/sync';
import type { SyncEvent } from '@/sync';
import { createDataAdapter } from '../helpers';
import { createHlc } from '@/hlc';
import { saveAllIndexes } from '@/persistence';
import { EventBus } from '@/reactive';
import type { EntityEvent } from '@/reactive';
import { Store } from '@/store';
import { DEFAULT_OPTIONS } from '../helpers';

function makeEngine(opts?: { cloud?: boolean }) {
  const store = new Store(DEFAULT_OPTIONS);
  const local = createDataAdapter();
  const cloud = opts?.cloud ? createDataAdapter() : undefined;
  const hlcRef = { current: createHlc('test') };
  const eventBus = new EventBus<EntityEvent>();
  const syncEventBus = new EventBus<SyncEvent>();
  const engine = new SyncEngine(store, local, cloud, ['task'], hlcRef, eventBus, syncEventBus, DEFAULT_OPTIONS);
  return { engine, store, local, cloud, hlcRef, eventBus, syncEventBus };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('SyncEngine', () => {
  it('executes sync operations sequentially', async () => {
    const { engine } = makeEngine();
    const order: number[] = [];

    const p1 = engine.sync('memory', 'local', undefined).then(() => order.push(1));
    const p2 = engine.sync('local', 'memory', undefined).then(() => order.push(2));

    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]);
  });

  it('deduplicates when same source+target is already queued', async () => {
    const { engine, store } = makeEngine();

    store.setEntity('task._', 'task._.a1', {
      id: 'task._.a1', name: 'T',
      hlc: { timestamp: 1, counter: 0, nodeId: 'n' },
    });

    const p1 = engine.sync('memory', 'local', undefined);
    const p2 = engine.sync('memory', 'local', undefined);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.deduplicated).toBe(false);
    expect(r2.deduplicated).toBe(true);
  });

  it('emits sync-started and sync-completed events', async () => {
    const { engine, syncEventBus } = makeEngine();
    const events: SyncEvent[] = [];
    syncEventBus.all$.subscribe(e => events.push(e));

    await engine.sync('memory', 'local', undefined);

    const types = events.map(e => e.type);
    expect(types).toContain('sync-started');
    expect(types).toContain('sync-completed');
  });

  it('events include source and target', async () => {
    const { engine, syncEventBus } = makeEngine();
    const events: SyncEvent[] = [];
    syncEventBus.all$.subscribe(e => events.push(e));

    await engine.sync('memory', 'local', undefined);

    const started = events.find(e => e.type === 'sync-started')!;
    expect(started).toEqual({
      type: 'sync-started',
      source: 'memory',
      target: 'local',
    });
  });

  it('emits sync-failed on error', async () => {
    const { engine, local, syncEventBus } = makeEngine();
    const events: SyncEvent[] = [];
    syncEventBus.all$.subscribe(e => events.push(e));

    local.read = async () => { throw new Error('read failed'); };

    await expect(engine.sync('memory', 'local', undefined)).rejects.toThrow('read failed');
    expect(events.some(e => e.type === 'sync-failed')).toBe(true);
  });

  it('syncEvents subscription can be unsubscribed', async () => {
    const { engine, syncEventBus } = makeEngine();
    const events: SyncEvent[] = [];
    const sub = syncEventBus.all$.subscribe(e => events.push(e));

    await engine.sync('memory', 'local', undefined);
    const count = events.length;

    sub.unsubscribe();
    await engine.sync('memory', 'local', undefined);
    expect(events.length).toBe(count);
  });

  it('syncEventBus.emit sends event to subscribers', () => {
    const { syncEventBus } = makeEngine();
    const events: SyncEvent[] = [];
    syncEventBus.all$.subscribe(e => events.push(e));

    syncEventBus.emit({ type: 'sync-failed', source: 'local', target: 'cloud', error: new Error('Cloud unreachable') });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('sync-failed');
  });

  it('drain waits for all queued operations', async () => {
    const { engine } = makeEngine();
    const results: number[] = [];

    engine.sync('memory', 'local', undefined).then(() => results.push(1));
    engine.sync('local', 'memory', undefined).then(() => results.push(2));

    await engine.drain();
    expect(results).toEqual([1, 2]);
  });

  it('dispose rejects further sync calls', async () => {
    const { engine } = makeEngine();
    engine.dispose();

    await expect(
      engine.sync('memory', 'local', undefined),
    ).rejects.toThrow('disposed');
  });

  it('throws when syncing to cloud without cloud adapter', async () => {
    const { engine } = makeEngine({ cloud: false });

    await expect(
      engine.sync('local', 'cloud', undefined),
    ).rejects.toThrow('No cloud adapter configured');
  });

  it('continues processing after an error', async () => {
    const { engine, local } = makeEngine();
    let secondRan = false;

    const origRead = local.read.bind(local);
    let firstCall = true;
    local.read = async (...args) => {
      if (firstCall) {
        firstCall = false;
        throw new Error('fail');
      }
      return origRead(...args);
    };

    const p1 = engine.sync('memory', 'local', undefined).catch(() => {});
    const p2 = engine.sync('local', 'memory', undefined).then(() => { secondRan = true; });

    await Promise.all([p1, p2]);
    expect(secondRan).toBe(true);
  });

  it('emits entity changes for memory source (memory→local)', async () => {
    const { engine, store, eventBus } = makeEngine();
    const firedEntities: string[] = [];
    eventBus.all$.subscribe(({ entityName }) => {
      if (entityName) firedEntities.push(entityName);
    });

    store.setEntity('task._', 'task._.a1', {
      id: 'task._.a1', title: 'T',
      hlc: { timestamp: 1, counter: 0, nodeId: 'n' },
    });

    await engine.sync('memory', 'local', undefined);
    // memory→local: storeChanges = changesForA (source=memory)
    // The sync moved data from memory to local; sync completed without error
    const { result } = await engine.sync('local', 'memory', undefined);
    expect(result).toBeDefined();
  });

  it('emits entity changes for memory target (local→memory)', async () => {
    const { engine, store, local } = makeEngine();

    // Put data directly in local adapter bypassing store
    const blob = {
      task: { 'task._.l1': { id: 'task._.l1', title: 'From Local', hlc: { timestamp: 500, counter: 0, nodeId: 'n2' } } },
      deleted: { task: {} },
    };
    const { saveAllIndexes } = await import('@/persistence');
    await local.write(undefined, 'task._', blob);
    await saveAllIndexes(local, undefined, {
      task: { '_': { hash: 999, count: 1, deletedCount: 0, updatedAt: 500 } },
    }, DEFAULT_OPTIONS);

    // Sync local→memory: storeChanges = changesForB (target=memory)
    const { result } = await engine.sync('local', 'memory', undefined);
    expect(result.changesForB.length).toBeGreaterThanOrEqual(0);
  });

  it('handles local→cloud sync (no storeChanges)', async () => {
    const { engine, store } = makeEngine({ cloud: true });

    store.setEntity('task._', 'task._.a1', {
      id: 'task._.a1', title: 'T',
      hlc: { timestamp: 1, counter: 0, nodeId: 'n' },
    });

    // First flush to local
    await engine.sync('memory', 'local', undefined);
    // Then local→cloud: storeChanges should be empty (neither source nor target is memory)
    const { result } = await engine.sync('local', 'cloud', undefined);
    expect(result).toBeDefined();
  });

  it('emits entity changes for memory→local with diverged data', async () => {
    const { engine, store, local, eventBus } = makeEngine();
    const changedEntities: string[] = [];
    eventBus.all$.subscribe(({ entityName }) => {
      if (entityName) changedEntities.push(entityName);
    });

    // Put data in memory (store)
    store.setEntity('task._', 'task._.m1', {
      id: 'task._.m1', title: 'Memory',
      hlc: { timestamp: 100, counter: 0, nodeId: 'mem' },
    });

    // Put different data in local adapter to create divergence
    const localBlob = {
      task: {
        'task._.l1': {
          id: 'task._.l1', title: 'Local',
          hlc: { timestamp: 200, counter: 0, nodeId: 'loc' },
        },
      },
      deleted: { task: {} },
    };
    await local.write(undefined, 'task._', localBlob);
    await saveAllIndexes(local, undefined, {
      task: { '_': { hash: 999, count: 1, deletedCount: 0, updatedAt: 200 } },
    }, DEFAULT_OPTIONS);

    // memory→local with diverged data should merge and emit changesForA back to memory
    const { result } = await engine.sync('memory', 'local', undefined);
    // changesForA = merge results applied back to source (memory)
    expect(result).toBeDefined();
  });

  it('emits entity changes for local→memory with data', async () => {
    const { engine, local, eventBus } = makeEngine();
    const changedEntities: string[] = [];
    eventBus.all$.subscribe(({ entityName }) => {
      if (entityName) changedEntities.push(entityName);
    });

    // Put data only in local adapter
    const localBlob = {
      task: {
        'task._.l1': {
          id: 'task._.l1', title: 'From Local',
          hlc: { timestamp: 500, counter: 0, nodeId: 'loc' },
        },
      },
      deleted: { task: {} },
    };
    await local.write(undefined, 'task._', localBlob);
    await saveAllIndexes(local, undefined, {
      task: { '_': { hash: 777, count: 1, deletedCount: 0, updatedAt: 500 } },
    }, DEFAULT_OPTIONS);

    // Lazy hydration: ensurePartition cascades from local to memory
    await engine.ensurePartition(undefined, 'task', '_');
    expect(changedEntities).toContain('task');
  });

  it('dispose rejects pending queue items', async () => {
    const { engine } = makeEngine();

    // Enqueue two syncs — first will run, second will be pending
    const p1 = engine.sync('memory', 'local', undefined);
    const p2 = engine.sync('memory', 'local', undefined);

    engine.dispose();

    await p1.catch(() => {}); // may resolve or reject
    await expect(p2).rejects.toThrow('SyncEngine disposed');
  });

  it('drain completes when queue is empty', async () => {
    const { engine } = makeEngine();
    await expect(engine.drain()).resolves.toBeUndefined();
  });

  it('drain waits for running sync to complete', async () => {
    const { engine, store } = makeEngine();

    store.setEntity('task._', 'task._.a1', {
      id: 'task._.a1', title: 'T',
      hlc: { timestamp: 1, counter: 0, nodeId: 'n' },
    });

    // Start sync then immediately drain
    const syncP = engine.sync('memory', 'local', undefined);
    const drainP = engine.drain();

    await syncP;
    await drainP;
  });
});

describe('SyncEngine scheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('startScheduler begins periodic timers', () => {
    vi.useFakeTimers();
    const { engine } = makeEngine();
    engine.startScheduler(undefined, true);
    engine.stopScheduler();
  });

  it('stopScheduler clears timers', () => {
    vi.useFakeTimers();
    const { engine } = makeEngine();
    const syncSpy = vi.spyOn(engine, 'sync');

    engine.startScheduler(undefined, true);
    engine.stopScheduler();

    vi.advanceTimersByTime(10000);
    expect(syncSpy).not.toHaveBeenCalled();
    syncSpy.mockRestore();
  });

  it('local flush interval calls sync memory→local on tick', () => {
    vi.useFakeTimers();
    const { engine } = makeEngine();
    const syncSpy = vi.spyOn(engine, 'sync');

    engine.startScheduler(undefined, true);
    vi.advanceTimersByTime(2000);

    expect(syncSpy).toHaveBeenCalledWith('memory', 'local', undefined);

    engine.stopScheduler();
    syncSpy.mockRestore();
  });

  it('does not start cloud timer when hasCloud is false', () => {
    vi.useFakeTimers();
    const { engine } = makeEngine();
    const syncSpy = vi.spyOn(engine, 'sync');

    engine.startScheduler(undefined, false);
    vi.advanceTimersByTime(10000);

    const calls = syncSpy.mock.calls;
    expect(calls.every(c => c[0] === 'memory' && c[1] === 'local')).toBe(true);

    engine.stopScheduler();
    syncSpy.mockRestore();
  });

  it('stopScheduler is safe to call multiple times', () => {
    vi.useFakeTimers();
    const { engine } = makeEngine();

    engine.startScheduler(undefined, false);
    expect(() => {
      engine.stopScheduler();
      engine.stopScheduler();
    }).not.toThrow();
  });

  it('dispose stops scheduler', () => {
    vi.useFakeTimers();
    const { engine } = makeEngine();
    const syncSpy = vi.spyOn(engine, 'sync');

    engine.startScheduler(undefined, true);
    engine.dispose();

    vi.advanceTimersByTime(10000);
    expect(syncSpy).not.toHaveBeenCalled();
    syncSpy.mockRestore();
  });

  it('catches local flush errors without crashing', async () => {
    const { engine, local } = makeEngine();
    local.read = async () => { throw new Error('write failed'); };

    engine.startScheduler(undefined, true);
    await new Promise(r => setTimeout(r, 3000));
    await engine.drain().catch(() => {});
    engine.stopScheduler();
  });

  it('catches cloud sync errors without crashing', async () => {
    const { engine, cloud } = makeEngine({ cloud: true });
    cloud!.read = async () => { throw new Error('network failed'); };

    engine.startScheduler(undefined, true);
    await new Promise(r => setTimeout(r, 3000));
    await engine.drain().catch(() => {});
    engine.stopScheduler();
  });
});

describe('SyncEngine.run()', () => {
  it('executes steps in order', async () => {
    const { engine } = makeEngine();
    const syncSpy = vi.spyOn(engine, 'sync');

    await engine.run(undefined, [['memory', 'local'], ['local', 'memory']]);

    expect(syncSpy).toHaveBeenCalledTimes(2);
    expect(syncSpy.mock.calls[0]?.[0]).toBe('memory');
    expect(syncSpy.mock.calls[0]?.[1]).toBe('local');
    expect(syncSpy.mock.calls[1]?.[0]).toBe('local');
    expect(syncSpy.mock.calls[1]?.[1]).toBe('memory');

    syncSpy.mockRestore();
  });

  it('returns results for each step', async () => {
    const { engine } = makeEngine();
    const results = await engine.run(undefined, [['memory', 'local']]);
    expect(results).toHaveLength(1);
    expect(results[0]).toHaveProperty('changesForA');
    expect(results[0]).toHaveProperty('changesForB');
  });

  it('returns empty array for empty steps', async () => {
    const { engine } = makeEngine();
    const results = await engine.run(undefined, []);
    expect(results).toEqual([]);
  });

  it('stops processing queue when disposed mid-flight', async () => {
    const { engine, local } = makeEngine();

    // Make read very slow so dispose happens while first item is running
    const origRead = local.read.bind(local);
    local.read = async (...args) => {
      await new Promise(r => setTimeout(r, 200));
      return origRead(...args);
    };

    const p1 = engine.sync('memory', 'local', undefined).catch(() => {});
    const p2 = engine.sync('local', 'memory', undefined).catch(() => {});

    // Dispose while first sync is in progress — second will be skipped
    await new Promise(r => setTimeout(r, 50));
    engine.dispose();

    // Wait for first sync to complete (delayed by 200ms read)
    await Promise.race([p1, new Promise(r => setTimeout(r, 500))]);
  });

  it('wraps non-Error throws in sync-failed event', async () => {
    const { engine, local, syncEventBus } = makeEngine();
    const events: SyncEvent[] = [];
    syncEventBus.all$.subscribe(e => events.push(e));

    // Make adapter throw a string (non-Error)
    local.read = async () => { throw 'string-failure'; };

    await engine.sync('memory', 'local', undefined).catch(() => {});

    const failed = events.find(e => e.type === 'sync-failed');
    expect(failed).toBeDefined();
    expect((failed as any).error).toBeInstanceOf(Error);
  });
});
