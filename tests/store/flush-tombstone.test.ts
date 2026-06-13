import { describe, it, expect } from 'vitest';
import { createDataAdapter } from '../helpers';
import { Store } from '@/store';
import { DEFAULT_OPTIONS } from '../helpers';
import { loadPartitionFromAdapter } from '@/store/flush';
import type { Hlc } from '@/hlc';

describe('loadPartitionFromAdapter', () => {
  it('loads entities from blob into map', async () => {
    const adapter = createDataAdapter();
    const store = new Store(DEFAULT_OPTIONS);

    const entity = { id: 'task._.a1', name: 'Test' };
    const blob = {
      task: { 'task._.a1': entity },
      deleted: { task: {} },
    };
    await adapter.write(undefined, 'task._', blob);

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(1);
    expect(result.get('task._.a1')).toEqual(entity);
  });

  it('restores tombstones from blob deleted section', async () => {
    const adapter = createDataAdapter();
    const store = new Store(DEFAULT_OPTIONS);

    const tombstoneHlc: Hlc = { timestamp: 999, counter: 0, nodeId: 'n1' };
    const blob = {
      task: {},
      deleted: { task: { 'task._.del1': tombstoneHlc } },
    };
    await adapter.write(undefined, 'task._', blob);

    await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    const tombstones = store.getTombstones('task._');
    expect(tombstones.get('task._.del1')).toEqual(tombstoneHlc);
  });

  it('returns empty map when blob does not exist', async () => {
    const adapter = createDataAdapter();
    const store = new Store(DEFAULT_OPTIONS);

    const result = await loadPartitionFromAdapter(adapter, undefined, store, 'task', '_');

    expect(result.size).toBe(0);
  });
});

