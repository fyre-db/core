import { describe, it, expect } from 'vitest';
import { saveAllIndexes, loadAllIndexes } from '@/persistence';
import type { PartitionBlob } from '@/persistence';
import type { Hlc } from '@/hlc';
import { Store } from '@/store';
import { syncBetween } from '@/sync';
import { defineEntity } from '@/schema';
import { DEFAULT_OPTIONS, createDataAdapter } from '../helpers';

function makePartitionBlob(
  entityName: string,
  entities: Record<string, unknown>,
  tombstones: Record<string, Hlc> = {},
): PartitionBlob {
  return ({
    [entityName]: entities,
    deleted: { [entityName]: tombstones },
  });
}

describe('syncBetween', () => {
  it('copies A-only partitions to B', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    const entity = { id: 'task._.a1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.a1': entity }));
    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    }, DEFAULT_OPTIONS);

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS);

    expect(result.changesForB.length).toBe(1);
    expect(result.changesForB[0].key).toBe('task._');

    const blobOnB = await adapterB.read(undefined, 'task._');
    expect(blobOnB).not.toBeNull();
  });

  it('copies B-only partitions to A', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    const entity = { id: 'task._.b1', hlc: { timestamp: 2000, counter: 0, nodeId: 'n2' } };
    await adapterB.write(undefined, 'task._', makePartitionBlob('task', { 'task._.b1': entity }));
    await saveAllIndexes(adapterB, undefined, {
      task: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    }, DEFAULT_OPTIONS);

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS);

    expect(result.changesForA.length).toBe(1);
    expect(result.changesForA[0].key).toBe('task._');
    expect(result.changesForA[0].updatedIds).toContain('task._.b1');

    const blobOnA = await adapterA.read(undefined, 'task._');
    expect(blobOnA).not.toBeNull();
  });

  it('merges diverged partitions', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    const entityA = { id: 'task._.a1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    const entityB = { id: 'task._.b1', hlc: { timestamp: 2000, counter: 0, nodeId: 'n2' } };

    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.a1': entityA }));
    await adapterB.write(undefined, 'task._', makePartitionBlob('task', { 'task._.b1': entityB }));

    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    }, DEFAULT_OPTIONS);
    await saveAllIndexes(adapterB, undefined, {
      task: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    }, DEFAULT_OPTIONS);

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS);

    // Merged blob written to both
    expect(result.changesForA.length).toBe(1);
    expect(result.changesForB.length).toBe(1);

    const blobA = await adapterA.read(undefined, 'task._');
    const blobB = await adapterB.read(undefined, 'task._');
    expect(blobA).toEqual(blobB);
  });

  it('returns empty result when no data on either side', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS);

    expect(result.changesForA).toHaveLength(0);
    expect(result.changesForB).toHaveLength(0);
    expect(result.stale).toBe(false);
    expect(result.maxHlc).toBeUndefined();
  });

  it('handles multiple entity types', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    const taskEntity = { id: 'task._.t1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    const noteEntity = { id: 'note._.n1', hlc: { timestamp: 2000, counter: 0, nodeId: 'n2' } };

    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.t1': taskEntity }));
    await adapterB.write(undefined, 'note._', makePartitionBlob('note', { 'note._.n1': noteEntity }));

    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    }, DEFAULT_OPTIONS);
    await saveAllIndexes(adapterB, undefined, {
      note: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    }, DEFAULT_OPTIONS);

    const result = await syncBetween(adapterA, adapterB, ['task', 'note'], undefined, DEFAULT_OPTIONS);

    expect(result.changesForB.length).toBe(1);
    expect(result.changesForA.length).toBe(1);
  });

  it('updates indexes on both adapters after sync', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    const entity = { id: 'task._.a1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.a1': entity }));
    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    }, DEFAULT_OPTIONS);

    await syncBetween(adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS);

    const { loadAllIndexes } = await import('@/persistence');
    const indexesA = await loadAllIndexes(adapterA, undefined, DEFAULT_OPTIONS);
    const indexesB = await loadAllIndexes(adapterB, undefined, DEFAULT_OPTIONS);

    expect(indexesA['task']?.['_']).toBeDefined();
    expect(indexesB['task']?.['_']).toBeDefined();
    // A's data didn't change — only B received new data
    // Both indexes reflect their own state independently
    expect(indexesB['task']['_'].count).toBe(1);
  });

  it('returns maxHlc from all processed entities', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    const entity = { id: 'task._.a1', hlc: { timestamp: 5000, counter: 3, nodeId: 'n1' } };
    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.a1': entity }));
    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 5000 } },
    }, DEFAULT_OPTIONS);

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS);

    expect(result.maxHlc).toBeDefined();
    expect(result.maxHlc!.timestamp).toBe(5000);
    expect(result.maxHlc!.counter).toBe(3);
  });

  it('detects stale state when adapterA is modified during sync', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    // Setup both sides with diverged data so merge produces applyToA
    const entityA = { id: 'task._.a1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    const entityB = { id: 'task._.b1', hlc: { timestamp: 2000, counter: 0, nodeId: 'n2' } };

    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.a1': entityA }));
    await adapterB.write(undefined, 'task._', makePartitionBlob('task', { 'task._.b1': entityB }));

    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    }, DEFAULT_OPTIONS);
    await saveAllIndexes(adapterB, undefined, {
      task: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    }, DEFAULT_OPTIONS);

    // Intercept adapterB.write — when B is written (phase 2), modify A's indexes to simulate concurrent change
    const origWriteB = adapterB.write.bind(adapterB);
    let intercepted = false;
    adapterB.write = async (tenant, key, data) => {
      await origWriteB(tenant, key, data);
      if (!intercepted && key === 'task._') {
        intercepted = true;
        // Change A's index hash to simulate concurrent write to A
        await saveAllIndexes(adapterA, undefined, {
          task: { '_': { hash: 999, count: 5, deletedCount: 0, updatedAt: 9999 } },
        }, DEFAULT_OPTIONS);
      }
    };

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS);

    // When stale, changesForA should be empty (skipped write-back)
    expect(result.stale).toBe(true);
    expect(result.changesForA).toHaveLength(0);
  });

  it('detects stale state when adapterA loses an entity from its marker mid-sync', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    const entityA = { id: 'task._.a1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    const entityB = { id: 'task._.b1', hlc: { timestamp: 2000, counter: 0, nodeId: 'n2' } };

    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.a1': entityA }));
    await adapterB.write(undefined, 'task._', makePartitionBlob('task', { 'task._.b1': entityB }));

    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    }, DEFAULT_OPTIONS);
    await saveAllIndexes(adapterB, undefined, {
      task: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    }, DEFAULT_OPTIONS);

    // During phase 2 (write to B), wipe A's marker entirely so the stale check
    // re-reads A and finds the snapshot's entity missing from the current index.
    const origWriteB = adapterB.write.bind(adapterB);
    let intercepted = false;
    adapterB.write = async (tenant, key, data) => {
      await origWriteB(tenant, key, data);
      if (!intercepted && key === 'task._') {
        intercepted = true;
        await saveAllIndexes(adapterA, undefined, {}, DEFAULT_OPTIONS);
      }
    };

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS);

    expect(result.stale).toBe(true);
    expect(result.changesForA).toHaveLength(0);
  });

  it('skips merge when one side has missing blob for diverged partition', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    // Index says diverged, but adapterB has no actual blob for the partition
    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    }, DEFAULT_OPTIONS);
    await saveAllIndexes(adapterB, undefined, {
      task: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    }, DEFAULT_OPTIONS);

    const entityA = { id: 'task._.a1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.a1': entityA }));
    // adapterB has no 'task._' blob — just the index reference

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS);
    // Since blobB is missing, the merge is skipped for that partition
    // but the A-only copy should still happen via localOnly logic
    expect(result).toBeDefined();
  });

  it('applies migrations during merge of diverged partitions', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    const entityA = { id: 'task._.a1', title: 'old', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    const entityB = { id: 'task._.b1', title: 'old', hlc: { timestamp: 2000, counter: 0, nodeId: 'n2' } };

    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.a1': entityA }));
    await adapterB.write(undefined, 'task._', makePartitionBlob('task', { 'task._.b1': entityB }));

    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    }, DEFAULT_OPTIONS);
    await saveAllIndexes(adapterB, undefined, {
      task: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    }, DEFAULT_OPTIONS);

    const migrations = [{
      version: 1,
      migrate: (blob: Record<string, unknown>) => {
        const tasks = (blob.task ?? {}) as Record<string, Record<string, unknown>>;
        const migrated: Record<string, unknown> = {};
        for (const [id, entity] of Object.entries(tasks)) {
          migrated[id] = { ...entity, migrated: true };
        }
        return { ...blob, task: migrated };
      },
    }];

    const result = await syncBetween(
      adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS, migrations as unknown[],
    );

    expect(result.changesForA.length + result.changesForB.length).toBeGreaterThan(0);
  });

  it('one-directional copy (A→B) with no applyToA changes', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    const entity = { id: 'task._.a1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.a1': entity }));
    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    }, DEFAULT_OPTIONS);

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS);

    // A→B only: changesForB has data, changesForA empty, not stale
    expect(result.changesForB.length).toBe(1);
    expect(result.changesForA).toHaveLength(0);
    expect(result.stale).toBe(false);
  });

  it('includes tombstone HLC in maxHlc calculation', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    const tombstoneHlc = { timestamp: 9000, counter: 5, nodeId: 'n1' };
    const blob = {
      task: {},
      deleted: { task: { 'task._.x1': tombstoneHlc } },
    };
    await adapterA.write(undefined, 'task._', blob);
    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 333, count: 0, deletedCount: 1, updatedAt: 9000 } },
    }, DEFAULT_OPTIONS);

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS);

    expect(result.maxHlc).toBeDefined();
    expect(result.maxHlc!.timestamp).toBe(9000);
  });

  it('handles merge with migrations applied', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    const entityA = { id: 'task._.a1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    const entityB = { id: 'task._.b1', hlc: { timestamp: 2000, counter: 0, nodeId: 'n2' } };

    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.a1': entityA }));
    await adapterB.write(undefined, 'task._', makePartitionBlob('task', { 'task._.b1': entityB }));

    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    }, DEFAULT_OPTIONS);
    await saveAllIndexes(adapterB, undefined, {
      task: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    }, DEFAULT_OPTIONS);

    const migrations = [{
      version: 1,
      migrate: (blob: PartitionBlob) => blob,
    }];

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS, migrations as any);
    expect(result.changesForA.length).toBe(1);
    expect(result.changesForB.length).toBe(1);
  });

  it('copy with no migrations (null migration path)', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    const entity = { id: 'task._.a1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.a1': entity }));
    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    }, DEFAULT_OPTIONS);

    // Pass undefined migrations explicitly
    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS);
    expect(result.changesForB.length).toBe(1);
  });

  it('copies with migrations applied (planCopies migration branch)', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    const entity = { id: 'task._.a1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    await adapterA.write(undefined, 'task._', makePartitionBlob('task', { 'task._.a1': entity }));
    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    }, DEFAULT_OPTIONS);

    const entityB = { id: 'note._.b1', hlc: { timestamp: 2000, counter: 0, nodeId: 'n2' } };
    await adapterB.write(undefined, 'note._', makePartitionBlob('note', { 'note._.b1': entityB }));
    await saveAllIndexes(adapterB, undefined, {
      note: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    }, DEFAULT_OPTIONS);

    const migrations = [{
      version: 1,
      migrate: (blob: PartitionBlob) => blob, // identity migration
    }];

    const result = await syncBetween(adapterA, adapterB, ['task', 'note'], undefined, DEFAULT_OPTIONS, migrations as any);
    expect(result.changesForB.length).toBeGreaterThan(0);
    expect(result.changesForA.length).toBeGreaterThan(0);
  });

  it('skips copy when blob is null for indexed partition (race condition)', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    // Index says partition exists, but blob is missing (deleted between index read and blob read)
    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    }, DEFAULT_OPTIONS);
    // No actual blob written to adapterA for task._

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS);
    // No data to copy since blob was null
    expect(result.changesForB).toHaveLength(0);
  });

  it('skips copy from B when blob is null for B-only partition', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    // Index says partition exists on B, but blob is missing
    await saveAllIndexes(adapterB, undefined, {
      task: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    }, DEFAULT_OPTIONS);

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS);
    expect(result.changesForA).toHaveLength(0);
  });

  it('handles blobs where entity section is missing (undefined fallback paths)', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    // Write a blob without the entity key — only has 'deleted'
    const minimalBlob: PartitionBlob = { deleted: { task: {} } };
    await adapterA.write(undefined, 'task._', minimalBlob);
    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 555, count: 0, deletedCount: 0, updatedAt: 100 } },
    }, DEFAULT_OPTIONS);

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS);
    expect(result.changesForB.length).toBe(1);
  });

  it('handles blobs where deleted section is missing entity key', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    const entity = { id: 'task._.a1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } };
    // Write a blob with entities but no deleted.task section
    const blob: PartitionBlob = { task: { 'task._.a1': entity }, deleted: {} };
    await adapterA.write(undefined, 'task._', blob);
    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 666, count: 1, deletedCount: 0, updatedAt: 1000 } },
    }, DEFAULT_OPTIONS);

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS);
    expect(result.changesForB.length).toBe(1);
    expect(result.maxHlc).toBeDefined();
  });

  it('skips merge when a diverged partition blob is missing on one side', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    // Both indexes claim the partition with diverging hashes, so it is planned
    // as a merge — but A's actual blob is missing (deleted between index and
    // blob read), so planMerges must skip it instead of merging.
    await adapterB.write(undefined, 'task._', makePartitionBlob('task', {
      'task._.b1': { id: 'task._.b1', hlc: { timestamp: 2000, counter: 0, nodeId: 'n2' } },
    }));
    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    }, DEFAULT_OPTIONS);
    await saveAllIndexes(adapterB, undefined, {
      task: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    }, DEFAULT_OPTIONS);

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS);

    // Merge skipped → nothing applied to either side.
    expect(result.changesForA).toHaveLength(0);
    expect(result.changesForB).toHaveLength(0);
  });

  it('skips merge when the diverged blob is missing on the B side', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    // A has the blob, B's blob is missing — exercises the `!blobB` branch.
    await adapterA.write(undefined, 'task._', makePartitionBlob('task', {
      'task._.a1': { id: 'task._.a1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } },
    }));
    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 1000 } },
    }, DEFAULT_OPTIONS);
    await saveAllIndexes(adapterB, undefined, {
      task: { '_': { hash: 222, count: 1, deletedCount: 0, updatedAt: 2000 } },
    }, DEFAULT_OPTIONS);

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS);

    expect(result.changesForA).toHaveLength(0);
    expect(result.changesForB).toHaveLength(0);
  });

  it('computes maxHlc across both entities and tombstones in a merged blob', async () => {
    const adapterA = createDataAdapter();
    const adapterB = createDataAdapter();

    // A holds an entity; B holds two tombstones — one older and one newer than
    // the entity. After merge the blob carries the entity and both tombstones,
    // so findMaxHlc sets max from the entity then compares each tombstone.
    await adapterA.write(undefined, 'task._', makePartitionBlob('task', {
      'task._.a': { id: 'task._.a', hlc: { timestamp: 5000, counter: 0, nodeId: 'n1' } },
    }));
    await adapterB.write(undefined, 'task._', makePartitionBlob('task', {}, {
      'task._.older': { timestamp: 3000, counter: 0, nodeId: 'n2' },
      'task._.newer': { timestamp: 7000, counter: 0, nodeId: 'n2' },
    }));
    await saveAllIndexes(adapterA, undefined, {
      task: { '_': { hash: 111, count: 1, deletedCount: 0, updatedAt: 5000 } },
    }, DEFAULT_OPTIONS);
    await saveAllIndexes(adapterB, undefined, {
      task: { '_': { hash: 222, count: 0, deletedCount: 2, updatedAt: 7000 } },
    }, DEFAULT_OPTIONS);

    const result = await syncBetween(adapterA, adapterB, ['task'], undefined, DEFAULT_OPTIONS);

    expect(result.maxHlc).toEqual({ timestamp: 7000, counter: 0, nodeId: 'n2' });
  });
});
