import { describe, it, expect } from 'vitest';
import { Store } from '@/store';
import { DEFAULT_OPTIONS } from '../helpers';
import { createDataAdapter } from '../helpers';
import { loadPartitionFromAdapter } from '@/store/flush';

describe('loadPartitionFromAdapter', () => {
  it('loads entities from blob without deleted section', async () => {
    const adapter = createDataAdapter();
    const store = new Store(DEFAULT_OPTIONS);

    const blob = { task: { 'task._.a1': { id: 'task._.a1', name: 'Test' } }, deleted: {} };
    await adapter.write(undefined, 'task._', blob);

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(1);
    expect(result.get('task._.a1')).toEqual({ id: 'task._.a1', name: 'Test' });
    expect(store.getTombstones('task._').size).toBe(0);
  });

  it('returns empty map when blob does not exist', async () => {
    const adapter = createDataAdapter();
    const store = new Store(DEFAULT_OPTIONS);

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(0);
  });

  it('loads entities and tombstones from blob with deleted section', async () => {
    const adapter = createDataAdapter();
    const store = new Store(DEFAULT_OPTIONS);

    const blob = {
      task: { 'task._.a1': { id: 'task._.a1', name: 'Test' } },
      deleted: {
        task: { 'task._.d1': { timestamp: 999, counter: 0, nodeId: 'n1' } },
      },
    };
    await adapter.write(undefined, 'task._', blob);

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(1);
    expect(store.getTombstones('task._').get('task._.d1')).toBeDefined();
  });

  it('handles blob with no tombstones for entity in deleted section', async () => {
    const adapter = createDataAdapter();
    const store = new Store(DEFAULT_OPTIONS);

    const blob = {
      task: { 'task._.a1': { id: 'task._.a1', name: 'Test' } },
      deleted: {},
    };
    await adapter.write(undefined, 'task._', blob);

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(1);
    expect(store.getTombstones('task._').size).toBe(0);
  });

  it('returns empty map and skips loading when blob is malformed', async () => {
    const adapter = createDataAdapter();
    const store = new Store(DEFAULT_OPTIONS);

    // deleted is not a plain object — validation fails
    const malformed = { task: { 'task._.a1': { id: 'task._.a1' } }, deleted: 'not-an-object' };
    await adapter.write(undefined, 'task._', malformed as any);

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(0);
  });

  it('returns empty map when entity data is not a plain object', async () => {
    const adapter = createDataAdapter();
    const store = new Store(DEFAULT_OPTIONS);

    const malformed = { task: 'not-an-object', deleted: {} };
    await adapter.write(undefined, 'task._', malformed as any);

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(0);
  });

  it('returns empty map when tombstone HLC is invalid', async () => {
    const adapter = createDataAdapter();
    const store = new Store(DEFAULT_OPTIONS);

    const malformed = { task: {}, deleted: { task: { 'task._.d1': 'not-hlc' } } };
    await adapter.write(undefined, 'task._', malformed as any);

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(0);
  });

  it('applies migrations before loading', async () => {
    const adapter = createDataAdapter();
    const store = new Store(DEFAULT_OPTIONS);

    const blob = { task: { 'task._.a1': { id: 'task._.a1', name: 'Test' } }, deleted: {} };
    await adapter.write(undefined, 'task._', blob);

    const migrations = [{
      version: 1,
      migrate: (b: any) => ({ ...b, task: { 'task._.a1': { ...b.task['task._.a1'], migrated: true } } }),
    }];
    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_', migrations);

    expect(result.size).toBe(1);
    expect((result.get('task._.a1') as any).migrated).toBe(true);
  });

  it('loads entities when deleted section has no entry for entity', async () => {
    const adapter = createDataAdapter();
    const store = new Store(DEFAULT_OPTIONS);

    // deleted section exists but has no 'task' key — triggers ?? {} and undefined tombstoneData branches
    const blob = { task: { 'task._.a1': { id: 'task._.a1', name: 'Test' } }, deleted: { other: {} } };
    await adapter.write(undefined, 'task._', blob);

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');
    expect(result.size).toBe(1);
    expect(store.getTombstones('task._').size).toBe(0);
  });

  it('returns empty map when the deleted section for the entity is not an object', async () => {
    const adapter = createDataAdapter();
    const store = new Store(DEFAULT_OPTIONS);

    // deleted is a plain object, but deleted[entityName] is a primitive — invalid
    const malformed = { task: {}, deleted: { task: 'not-an-object' } };
    await adapter.write(undefined, 'task._', malformed as any);

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(0);
    expect(store.getTombstones('task._').size).toBe(0);
  });

  it('returns empty map when blob has no entity section at all', async () => {
    const adapter = createDataAdapter();
    const store = new Store(DEFAULT_OPTIONS);

    // Valid blob, but missing the entity key entirely — entities falls back to {}
    const blob = { deleted: {} };
    await adapter.write(undefined, 'task._', blob as any);

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(0);
    expect(store.getTombstones('task._').size).toBe(0);
  });
});

