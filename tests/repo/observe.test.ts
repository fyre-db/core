import { describe, it, expect, vi } from 'vitest';
import { firstValueFrom, take, toArray } from 'rxjs';
import { Store } from '@/store';
import { DEFAULT_OPTIONS } from '../helpers';
import { EventBus } from '@/reactive';
import type { EntityEvent } from '@/reactive';
import { defineEntity } from '@/schema';
import { Repository } from '@/repo';
import type { Hlc } from '@/hlc';

type Item = { name: string; category: string; price: number };

function makeHlcRef(): { current: Hlc } {
  return { current: { timestamp: 0, counter: 0, nodeId: 'test-device' } };
}

const ItemDef = defineEntity<Item>('item');

describe('Repository.observe', () => {
  it('emits current value on subscribe', async () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);
    const id = repo.save({ name: 'Widget', category: 'tools', price: 10 });

    const value = await firstValueFrom(repo.observe(id));
    expect(value).toBeDefined();
    expect(value!.name).toBe('Widget');
  });

  it('emits undefined for non-existent entity', async () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);

    const value = await firstValueFrom(repo.observe('item._.nonexistent'));
    expect(value).toBeUndefined();
  });

  it('emits updated value when entity changes', async () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);
    const id = repo.save({ name: 'Widget', category: 'tools', price: 10 });

    const values: Array<(Item & { id: string; version: number }) | undefined> = [];
    const sub = repo.observe(id).subscribe(v => {
      values.push(v as typeof values[number]);
    });

    repo.save({ name: 'Widget Updated', category: 'tools', price: 20, id } as Item & { id: string });

    sub.unsubscribe();

    expect(values.length).toBeGreaterThanOrEqual(2);
    expect(values[0]!.name).toBe('Widget');
    expect(values[values.length - 1]!.name).toBe('Widget Updated');
  });

  it('suppresses emission when version unchanged', async () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);
    const id = repo.save({ name: 'Widget', category: 'tools', price: 10 });

    const values: unknown[] = [];
    const sub = repo.observe(id).subscribe(v => values.push(v));

    // Emit a signal for a different entity — observer re-checks, same version
    bus.emit({ entityName: 'item' });
    // Should not re-emit since version didn't change (distinctUntilChanged)
    // But the signal fires map, which returns the same entity — should be suppressed

    sub.unsubscribe();

    // Only the initial emission
    expect(values).toHaveLength(1);
  });

  it('emits undefined after entity is deleted', async () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);
    const id = repo.save({ name: 'Widget', category: 'tools', price: 10 });

    const values: unknown[] = [];
    const sub = repo.observe(id).subscribe(v => values.push(v));

    repo.delete(id);

    sub.unsubscribe();

    expect(values).toHaveLength(2);
    expect(values[0]).toBeDefined();
    expect(values[1]).toBeUndefined();
  });
});

describe('Repository.observeQuery', () => {
  it('emits current results on subscribe', async () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);
    repo.save({ name: 'A', category: 'cat1', price: 10 });
    repo.save({ name: 'B', category: 'cat2', price: 20 });

    const results = await firstValueFrom(repo.observeQuery());
    expect(results).toHaveLength(2);
  });

  it('emits updated results when entities change', async () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);

    const emissions: ReadonlyArray<unknown>[] = [];
    const sub = repo.observeQuery().subscribe(v => emissions.push(v));

    repo.save({ name: 'A', category: 'cat1', price: 10 });

    sub.unsubscribe();

    expect(emissions.length).toBeGreaterThanOrEqual(2);
    expect(emissions[0]).toHaveLength(0);
    expect(emissions[emissions.length - 1]).toHaveLength(1);
  });

  it('applies query filter options', async () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);
    repo.save({ name: 'A', category: 'cat1', price: 10 });
    repo.save({ name: 'B', category: 'cat2', price: 20 });

    const results = await firstValueFrom(
      repo.observeQuery({ where: { category: 'cat1' } }),
    );
    expect(results).toHaveLength(1);
    expect((results[0] as Item).name).toBe('A');
  });

  it('suppresses emission when results unchanged', async () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);
    repo.save({ name: 'A', category: 'cat1', price: 10 });

    const emissions: unknown[] = [];
    const sub = repo.observeQuery().subscribe(v => emissions.push(v));

    // Signal without actual data change
    bus.emit({ entityName: 'item' });

    sub.unsubscribe();

    // Only initial emission - duplicate suppressed by distinctUntilChanged
    expect(emissions).toHaveLength(1);
  });
});

describe('entityComparator', () => {
  it('treats two undefined values as equal', async () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);

    const values: unknown[] = [];
    const sub = repo.observe('item._.nonexistent').subscribe(v => values.push(v));

    // Extra signal — should not re-emit undefined
    bus.emit({ entityName: 'item' });

    sub.unsubscribe();

    expect(values).toHaveLength(1);
    expect(values[0]).toBeUndefined();
  });
});

describe('resultsChanged', () => {
  it('detects length changes', async () => {
    const store = new Store(DEFAULT_OPTIONS);
    const bus = new EventBus<EntityEvent>();
    const repo = new Repository(ItemDef, store, makeHlcRef(), bus);

    const emissions: unknown[] = [];
    const sub = repo.observeQuery().subscribe(v => emissions.push(v));

    repo.save({ name: 'First', category: 'c', price: 1 });
    repo.save({ name: 'Second', category: 'c', price: 2 });

    sub.unsubscribe();

    // Initial (0), after first save (1), after second save (2)
    expect(emissions).toHaveLength(3);
  });
});
