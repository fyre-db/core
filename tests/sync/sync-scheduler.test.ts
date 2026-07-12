import { describe, it, expect, vi, afterEach } from 'vitest';
import { createDataAdapter } from '../helpers';
import { createHlc } from '@/hlc';
import { EventBus } from '@/reactive';
import type { EntityEvent } from '@/reactive';
import { Store } from '@/store';
import { DEFAULT_OPTIONS } from '../helpers';
import { SyncEngine } from '@/sync';
import type { SyncEvent } from '@/sync';
import { ReactiveFlag } from '@/utils';
import type { ResolvedFyreDbOptions } from '@/index';

function makeEngine(opts?: { cloud?: boolean; options?: ResolvedFyreDbOptions }) {
  const options = opts?.options ?? DEFAULT_OPTIONS;
  const store = new Store(options);
  const local = createDataAdapter();
  const cloud = opts?.cloud !== false ? createDataAdapter() : undefined;
  const hlcRef = { current: createHlc('test') };
  const eventBus = new EventBus<EntityEvent>();
  const syncEventBus = new EventBus<SyncEvent>();
  const engine = new SyncEngine(store, local, cloud, ['task'], hlcRef, eventBus, syncEventBus, options);
  return { engine, store, local, cloud, eventBus };
}

const emitEdit = (bus: EventBus<EntityEvent>) =>
  bus.emit({ entityName: 'task', source: 'user', updates: ['t1'], deletes: [] });

const SHORT_OPTIONS: ResolvedFyreDbOptions = {
  ...DEFAULT_OPTIONS,
  localFlushDebounceMs: 20,
  localFlushMaxWaitMs: 40,
  cloudSyncDebounceMs: 20,
  cloudSyncMaxWaitMs: 40,
  cloudPullIntervalMs: 100,
};

describe('SyncEngine scheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('startScheduler begins the scheduler', () => {
    vi.useFakeTimers();
    const { engine } = makeEngine();
    engine.startScheduler(undefined, true);
    engine.stopScheduler();
  });

  it('stopScheduler cancels a pending debounced flush', () => {
    vi.useFakeTimers();
    const { engine, eventBus } = makeEngine();
    const syncSpy = vi.spyOn(engine, 'sync');

    engine.startScheduler(undefined, true);
    emitEdit(eventBus);
    engine.stopScheduler();

    vi.advanceTimersByTime(10000);
    expect(syncSpy).not.toHaveBeenCalled();
    syncSpy.mockRestore();
  });

  it('local flush fires memory→local after a user edit (debounced)', () => {
    vi.useFakeTimers();
    const { engine, eventBus } = makeEngine();
    const syncSpy = vi.spyOn(engine, 'sync');

    engine.startScheduler(undefined, true);
    emitEdit(eventBus);
    vi.advanceTimersByTime(DEFAULT_OPTIONS.localFlushDebounceMs);

    expect(syncSpy).toHaveBeenCalledWith('memory', 'local', undefined);

    engine.stopScheduler();
    syncSpy.mockRestore();
  });

  it('does not exceed the max-wait ceiling during sustained edits', () => {
    vi.useFakeTimers();
    const { engine, eventBus } = makeEngine();
    const syncSpy = vi.spyOn(engine, 'sync');

    engine.startScheduler(undefined, true);
    // Keep editing just under the debounce window so the trailing timer never
    // settles; the ceiling must still force a flush.
    const step = DEFAULT_OPTIONS.localFlushDebounceMs - 100;
    for (let elapsed = 0; elapsed < DEFAULT_OPTIONS.localFlushMaxWaitMs + step; elapsed += step) {
      emitEdit(eventBus);
      vi.advanceTimersByTime(step);
    }

    expect(syncSpy).toHaveBeenCalledWith('memory', 'local', undefined);

    engine.stopScheduler();
    syncSpy.mockRestore();
  });

  it('pull backstop timer runs a cloud cycle without any edits', async () => {
    vi.useFakeTimers();
    const { engine } = makeEngine({ options: SHORT_OPTIONS });
    const syncSpy = vi.spyOn(engine, 'sync');

    engine.startScheduler(undefined, true);
    // No edits emitted — only the periodic pull timer should fire. Advance with
    // the async variant so the cloud cycle's awaited steps (memory→local, then
    // local→cloud) actually run.
    await vi.advanceTimersByTimeAsync(SHORT_OPTIONS.cloudPullIntervalMs + 10);

    expect(syncSpy).toHaveBeenCalledWith('local', 'cloud', undefined);

    engine.stopScheduler();
    syncSpy.mockRestore();
  });

  it('does not arm cloud sync when hasCloud is false', () => {
    vi.useFakeTimers();
    const { engine, eventBus } = makeEngine({ cloud: false });
    const syncSpy = vi.spyOn(engine, 'sync');

    engine.startScheduler(undefined, false);
    emitEdit(eventBus);
    vi.advanceTimersByTime(DEFAULT_OPTIONS.cloudSyncMaxWaitMs + 1000);

    const calls = syncSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(c => c[0] === 'memory' && c[1] === 'local')).toBe(true);

    engine.stopScheduler();
    syncSpy.mockRestore();
  });

  it('stopScheduler is safe to call multiple times', () => {
    vi.useFakeTimers();
    const { engine } = makeEngine({ cloud: false });

    engine.startScheduler(undefined, false);
    expect(() => {
      engine.stopScheduler();
      engine.stopScheduler();
    }).not.toThrow();
  });

  it('dispose stops scheduler', () => {
    vi.useFakeTimers();
    const { engine, eventBus } = makeEngine();
    const syncSpy = vi.spyOn(engine, 'sync');

    engine.startScheduler(undefined, true);
    emitEdit(eventBus);
    engine.dispose();

    vi.advanceTimersByTime(10000);
    expect(syncSpy).not.toHaveBeenCalled();
    syncSpy.mockRestore();
  });

  it('catches local flush errors without crashing', async () => {
    const { engine, local, eventBus } = makeEngine({ options: SHORT_OPTIONS });
    local.read = async () => { throw new Error('write failed'); };

    engine.startScheduler(undefined, true);
    emitEdit(eventBus);
    await new Promise(r => setTimeout(r, 100));
    await engine.drain().catch(() => {});
    engine.stopScheduler();
  });

  it('catches cloud sync errors without crashing', async () => {
    const { engine, cloud, eventBus } = makeEngine({ options: SHORT_OPTIONS });
    cloud!.read = async () => { throw new Error('network failed'); };

    engine.startScheduler(undefined, true);
    emitEdit(eventBus);
    await new Promise(r => setTimeout(r, 100));
    await engine.drain().catch(() => {});
    engine.stopScheduler();
  });

  it('cloud sync clears dirtyTracker on success after an edit', async () => {
    const { engine, eventBus } = makeEngine({ options: SHORT_OPTIONS });

    const tracker = new ReactiveFlag();
    tracker.set();
    expect(tracker.value).toBe(true);

    engine.startScheduler(undefined, true, tracker);
    emitEdit(eventBus);
    await new Promise(r => setTimeout(r, 300));
    await engine.drain().catch(() => {});
    engine.stopScheduler();

    expect(tracker.value).toBe(false);
  });

  it('cloud sync catches errors with short debounce', async () => {
    const { engine, cloud, eventBus } = makeEngine({ options: SHORT_OPTIONS });
    cloud!.read = async () => { throw new Error('cloud failure'); };

    engine.startScheduler(undefined, true);
    emitEdit(eventBus);
    await new Promise(r => setTimeout(r, 300));
    await engine.drain().catch(() => {});
    engine.stopScheduler();
  });

  it('starts with default options', () => {
    vi.useFakeTimers();
    const { engine } = makeEngine();

    engine.startScheduler(undefined, true);
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
});

