import { describe, it, expect } from 'vitest';
import { Store } from '@/store';
import { DEFAULT_OPTIONS } from '../helpers';
import { createHlc, compareHlc } from '@/hlc';
import { EventBus } from '@/reactive';
import type { EntityEvent } from '@/reactive';
import { defineEntity } from '@/schema';
import { Repository } from '@/repo';

type Task = {
  name: string;
};

const taskDef = defineEntity<Task>('task');

describe('Repository delete tombstone integration', () => {
  it('delete records tombstone with a freshly ticked HLC (newer than the entity)', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const hlc = { current: createHlc('device1') };
    const eventBus = new EventBus<EntityEvent>();
    const repo = new Repository(taskDef, store, hlc, eventBus);

    const id = repo.save({ name: 'Test' } as Task);
    const savedEntity = repo.get(id)!;
    const savedHlc = savedEntity.hlc;

    repo.delete(id);

    const entityKey = id.substring(0, id.lastIndexOf('.'));
    const tombstones = store.getTombstones(entityKey);
    expect(tombstones.has(id)).toBe(true);
    // A delete is a new operation: its tombstone must be causally AFTER the
    // entity's own HLC, not equal to it. An equal/stale tombstone HLC would
    // lose merges and be pruned by retention, resurrecting the row.
    const tombstoneHlc = tombstones.get(id)!;
    expect(compareHlc(tombstoneHlc, savedHlc)).toBeGreaterThan(0);
  });

  it('deleteMany records tombstones for all deleted entities', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const hlc = { current: createHlc('device1') };
    const eventBus = new EventBus<EntityEvent>();
    const repo = new Repository(taskDef, store, hlc, eventBus);

    const id1 = repo.save({ name: 'Test1' } as Task);
    const id2 = repo.save({ name: 'Test2' } as Task);

    repo.deleteMany([id1, id2]);

    const entityKey = id1.substring(0, id1.lastIndexOf('.'));
    const tombstones = store.getTombstones(entityKey);
    expect(tombstones.has(id1)).toBe(true);
    expect(tombstones.has(id2)).toBe(true);
  });

  it('delete of non-existent entity does not create tombstone', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const hlc = { current: createHlc('device1') };
    const eventBus = new EventBus<EntityEvent>();
    const repo = new Repository(taskDef, store, hlc, eventBus);

    repo.delete('task._.nonexistent');

    const tombstones = store.getTombstones('task._');
    expect(tombstones.size).toBe(0);
  });
});

describe('Repository mutation HLC never lags stored state', () => {
  const HOUR_MS = 3600_000;

  it('save over an id with a future-dated tombstone mints an HLC newer than the tombstone', () => {
    const store = new Store(DEFAULT_OPTIONS);
    // Device clock starts fresh (timestamp 0), as after a reload before any sync.
    const hlc = { current: createHlc('device1') };
    const eventBus = new EventBus<EntityEvent>();
    const repo = new Repository(taskDef, store, hlc, eventBus);

    // A delete performed on another device whose clock is an hour ahead.
    const id = 'task._.abc';
    const futureTombstone = { timestamp: Date.now() + HOUR_MS, counter: 5, nodeId: 'device2' };
    store.setTombstone('task._', id, futureTombstone);

    // Re-adding the row (e.g. reconnecting an account) must win the next merge.
    repo.save({ id, name: 'Reconnect' } as Task & { id: string });

    const savedHlc = repo.get(id)!.hlc;
    expect(compareHlc(savedHlc, futureTombstone)).toBeGreaterThan(0);
    // The device clock is advanced too, so subsequent ops stay monotonic.
    expect(compareHlc(hlc.current, futureTombstone)).toBeGreaterThan(0);
  });

  it('re-save over an entity whose HLC is ahead of the device clock still advances', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const hlc = { current: createHlc('device1') };
    const eventBus = new EventBus<EntityEvent>();
    const repo = new Repository(taskDef, store, hlc, eventBus);

    const id = 'task._.abc';
    const futureHlc = { timestamp: Date.now() + HOUR_MS, counter: 2, nodeId: 'device2' };
    store.setEntity('task._', id, {
      id, name: 'Old', createdAt: new Date(), updatedAt: new Date(),
      version: 1, device: 'device2', hlc: futureHlc,
    });

    repo.save({ id, name: 'New' } as Task & { id: string });

    const savedHlc = repo.get(id)!.hlc;
    expect(compareHlc(savedHlc, futureHlc)).toBeGreaterThan(0);
  });

  it('delete of an entity whose HLC is ahead mints a tombstone newer than the entity', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const hlc = { current: createHlc('device1') };
    const eventBus = new EventBus<EntityEvent>();
    const repo = new Repository(taskDef, store, hlc, eventBus);

    const id = 'task._.abc';
    const futureHlc = { timestamp: Date.now() + HOUR_MS, counter: 2, nodeId: 'device2' };
    store.setEntity('task._', id, {
      id, name: 'Old', createdAt: new Date(), updatedAt: new Date(),
      version: 1, device: 'device2', hlc: futureHlc,
    });

    repo.delete(id);

    const tombstoneHlc = store.getTombstones('task._').get(id)!;
    expect(compareHlc(tombstoneHlc, futureHlc)).toBeGreaterThan(0);
  });
});
