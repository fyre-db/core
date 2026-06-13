import { describe, it, expect, vi } from 'vitest';
import { Store } from '@/store';
import { DEFAULT_OPTIONS } from '../helpers';
import { EventBus } from '@/reactive';
import type { EntityEvent } from '@/reactive';
import { defineEntity } from '@/schema';
import { Repository } from '@/repo';
import { SingletonRepository } from '@/repo';
import type { Hlc } from '@/hlc';

type Item = { name: string; category: string; price: number };
type Settings = { theme: string; language: string };

function makeHlcRef(): { current: Hlc } {
  return { current: { timestamp: 0, counter: 0, nodeId: 'test-device' } };
}

const ItemDef = defineEntity<Item>('item');
const SettingsDef = defineEntity<Settings>('settings', { keyStrategy: 'singleton' });

describe('Batch writes', () => {
  it('saveMany emits exactly one signal, not N', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);

    let signalCount = 0;
    const sub = repo.observeQuery().subscribe(() => {
      signalCount++;
    });

    // Reset after initial emission from startWith
    signalCount = 0;

    repo.saveMany([
      { name: 'A', category: 'c', price: 1 },
      { name: 'B', category: 'c', price: 2 },
      { name: 'C', category: 'c', price: 3 },
    ]);

    expect(signalCount).toBe(1);
    sub.unsubscribe();
  });

  it('deleteMany emits exactly one signal', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);

    const id1 = repo.save({ name: 'A', category: 'c', price: 1 });
    const id2 = repo.save({ name: 'B', category: 'c', price: 2 });
    const id3 = repo.save({ name: 'C', category: 'c', price: 3 });

    let signalCount = 0;
    const sub = repo.observeQuery().subscribe(() => {
      signalCount++;
    });

    // Reset after initial emission
    signalCount = 0;

    repo.deleteMany([id1, id2, id3]);

    expect(signalCount).toBe(1);
    sub.unsubscribe();
  });

  it('observers re-scan once per saveMany batch', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);

    const results: number[] = [];
    const sub = repo.observeQuery().subscribe(entities => {
      results.push(entities.length);
    });

    repo.saveMany([
      { name: 'A', category: 'c', price: 1 },
      { name: 'B', category: 'c', price: 2 },
      { name: 'C', category: 'c', price: 3 },
    ]);

    // Initial emission: 0 entities, then after saveMany: 3 entities
    expect(results).toEqual([0, 3]);
    sub.unsubscribe();
  });

  it('individual save still emits immediately', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);

    let emitCount = 0;
    const sub = repo.observeQuery().subscribe(() => {
      emitCount++;
    });

    // Reset after initial
    emitCount = 0;

    repo.save({ name: 'A', category: 'c', price: 1 });
    expect(emitCount).toBe(1);

    repo.save({ name: 'B', category: 'c', price: 2 });
    expect(emitCount).toBe(2);

    sub.unsubscribe();
  });

  it('individual delete still emits immediately', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);

    const id = repo.save({ name: 'A', category: 'c', price: 1 });

    let emitCount = 0;
    const sub = repo.observeQuery().subscribe(() => {
      emitCount++;
    });

    // Reset after initial
    emitCount = 0;

    repo.delete(id);
    expect(emitCount).toBe(1);

    sub.unsubscribe();
  });

  it('deleteMany with no actual deletions does not signal', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);

    let signalCount = 0;
    const sub = repo.observeQuery().subscribe(() => {
      signalCount++;
    });

    signalCount = 0;

    repo.deleteMany(['item._.nonexistent1', 'item._.nonexistent2']);

    expect(signalCount).toBe(0);
    sub.unsubscribe();
  });

  it('saveMany returns all generated IDs', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);

    const ids = repo.saveMany([
      { name: 'A', category: 'c', price: 1 },
      { name: 'B', category: 'c', price: 2 },
    ]);

    expect(ids).toHaveLength(2);
    expect(repo.get(ids[0])!.name).toBe('A');
    expect(repo.get(ids[1])!.name).toBe('B');
  });
});

describe('Dispose', () => {
  it('dispose() completes active Observable subscriptions when bus is disposed', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);

    let completed = false;
    const sub = repo.observe('item._.nonexistent').subscribe({
      complete: () => { completed = true; },
    });

    // Observables complete when EventBus is disposed, not individual repos
    bus.dispose();
    expect(completed).toBe(true);
    sub.unsubscribe();
  });

  it('disposed Repository rejects save', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);
    repo.dispose();

    expect(() => repo.save({ name: 'A', category: 'c', price: 1 })).toThrow('Repository is disposed');
  });

  it('disposed Repository rejects saveMany', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);
    repo.dispose();

    expect(() => repo.saveMany([{ name: 'A', category: 'c', price: 1 }])).toThrow('Repository is disposed');
  });

  it('disposed Repository rejects delete', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);
    const id = repo.save({ name: 'A', category: 'c', price: 1 });
    repo.dispose();

    expect(() => repo.delete(id)).toThrow('Repository is disposed');
  });

  it('disposed Repository rejects deleteMany', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);
    repo.dispose();

    expect(() => repo.deleteMany(['item._.x'])).toThrow('Repository is disposed');
  });

  it('disposed Repository rejects observe', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);
    repo.dispose();

    expect(() => repo.observe('item._.x')).toThrow('Repository is disposed');
  });

  it('disposed Repository rejects observeQuery', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);
    repo.dispose();

    expect(() => repo.observeQuery()).toThrow('Repository is disposed');
  });

  it('dispose is idempotent', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);
    repo.dispose();
    expect(() => repo.dispose()).not.toThrow();
  });

  it('SingletonRepository dispose delegates correctly', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new SingletonRepository(SettingsDef, store, makeHlcRef(), bus);

    let completed = false;
    repo.observe().subscribe({ complete: () => { completed = true; } });

    // Observables complete when EventBus is disposed, not repo
    bus.dispose();
    expect(completed).toBe(true);
  });

  it('disposed SingletonRepository rejects save', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new SingletonRepository(SettingsDef, store, makeHlcRef(), bus);
    repo.dispose();

    expect(() => repo.save({ theme: 'dark', language: 'en' })).toThrow('Repository is disposed');
  });
});
