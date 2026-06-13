import { describe, it, expect } from 'vitest';
import type { Hlc } from '@/hlc';
import type { PartitionBlob } from '@/persistence';
import { mergePartition } from '@/sync';

function makeBlob(
  entityName: string,
  entities: Record<string, unknown>,
  tombstones: Record<string, Hlc> = {},
): PartitionBlob {
  return {
    [entityName]: entities,
    deleted: { [entityName]: tombstones },
  };
}

const entityName = 'task';

describe('mergePartition', () => {
  it('includes local-only entities in merged result', () => {
    const local = makeBlob(entityName, {
      'task._.a': { id: 'task._.a', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } },
    });
    const cloud = makeBlob(entityName, {});

    const result = mergePartition(local, cloud, entityName);

    expect(result.entities['task._.a']).toBeDefined();
    expect(Object.keys(result.tombstones)).toHaveLength(0);
  });

  it('includes cloud-only entities in merged result', () => {
    const local = makeBlob(entityName, {});
    const cloud = makeBlob(entityName, {
      'task._.b': { id: 'task._.b', hlc: { timestamp: 2000, counter: 0, nodeId: 'n2' } },
    });

    const result = mergePartition(local, cloud, entityName);

    expect(result.entities['task._.b']).toBeDefined();
  });

  it('resolves conflicting entities by HLC — higher timestamp wins', () => {
    const local = makeBlob(entityName, {
      'task._.a': { id: 'task._.a', value: 'local', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } },
    });
    const cloud = makeBlob(entityName, {
      'task._.a': { id: 'task._.a', value: 'cloud', hlc: { timestamp: 2000, counter: 0, nodeId: 'n2' } },
    });

    const result = mergePartition(local, cloud, entityName);
    const merged = result.entities['task._.a'] as Record<string, unknown>;

    expect(merged['value']).toBe('cloud');
  });

  it('resolves entity vs tombstone — tombstone wins when more recent', () => {
    const local = makeBlob(entityName, {
      'task._.a': { id: 'task._.a', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } },
    });
    const cloud = makeBlob(entityName, {}, {
      'task._.a': { timestamp: 2000, counter: 0, nodeId: 'n2' },
    });

    const result = mergePartition(local, cloud, entityName);

    expect(result.entities['task._.a']).toBeUndefined();
    expect(result.tombstones['task._.a']).toBeDefined();
  });

  it('resolves entity vs tombstone — entity wins when more recent', () => {
    const local = makeBlob(entityName, {
      'task._.a': { id: 'task._.a', hlc: { timestamp: 3000, counter: 0, nodeId: 'n1' } },
    });
    const cloud = makeBlob(entityName, {}, {
      'task._.a': { timestamp: 2000, counter: 0, nodeId: 'n2' },
    });

    const result = mergePartition(local, cloud, entityName);

    expect(result.entities['task._.a']).toBeDefined();
    expect(result.tombstones['task._.a']).toBeUndefined();
  });

  it('resolves cloud entity vs local tombstone — tombstone wins', () => {
    const local = makeBlob(entityName, {}, {
      'task._.a': { timestamp: 3000, counter: 0, nodeId: 'n1' },
    });
    const cloud = makeBlob(entityName, {
      'task._.a': { id: 'task._.a', hlc: { timestamp: 1000, counter: 0, nodeId: 'n2' } },
    });

    const result = mergePartition(local, cloud, entityName);

    expect(result.entities['task._.a']).toBeUndefined();
    expect(result.tombstones['task._.a']).toBeDefined();
  });

  it('resolves two tombstones — keeps higher HLC', () => {
    const local = makeBlob(entityName, {}, {
      'task._.a': { timestamp: 1000, counter: 0, nodeId: 'n1' },
    });
    const cloud = makeBlob(entityName, {}, {
      'task._.a': { timestamp: 2000, counter: 0, nodeId: 'n2' },
    });

    const result = mergePartition(local, cloud, entityName);

    expect(result.tombstones['task._.a'].timestamp).toBe(2000);
  });

  it('produces identical merged result regardless of local/cloud order', () => {
    const sideA = makeBlob(entityName, {
      'task._.a': { id: 'task._.a', value: 'A', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } },
      'task._.b': { id: 'task._.b', value: 'B-A', hlc: { timestamp: 2000, counter: 0, nodeId: 'n1' } },
    });
    const sideB = makeBlob(entityName, {
      'task._.b': { id: 'task._.b', value: 'B-B', hlc: { timestamp: 3000, counter: 0, nodeId: 'n2' } },
      'task._.c': { id: 'task._.c', value: 'C', hlc: { timestamp: 1000, counter: 0, nodeId: 'n2' } },
    });

    const resultAB = mergePartition(sideA, sideB, entityName);
    const resultBA = mergePartition(sideB, sideA, entityName);

    expect(Object.keys(resultAB.entities).sort()).toEqual(
      Object.keys(resultBA.entities).sort(),
    );

    const entityB_AB = resultAB.entities['task._.b'] as Record<string, unknown>;
    const entityB_BA = resultBA.entities['task._.b'] as Record<string, unknown>;
    expect(entityB_AB['value']).toBe('B-B');
    expect(entityB_BA['value']).toBe('B-B');
  });

  it('handles entries present on both sides with null values', () => {
    // Construct blobs where an ID exists with null value on both sides
    const local = makeBlob(entityName, {
      'task._.x': null,
    });
    const cloud = makeBlob(entityName, {
      'task._.x': null,
    });

    const result = mergePartition(local, cloud, entityName);

    // The null-null case reaches the fallback return {} — no entity or tombstone
    expect(result.entities['task._.x']).toBeUndefined();
    expect(result.tombstones['task._.x']).toBeUndefined();
  });

  it('handles cloud-only tombstones', () => {
    const local = makeBlob(entityName, {});
    const cloud = makeBlob(entityName, {}, {
      'task._.deleted': { timestamp: 1000, counter: 0, nodeId: 'n2' },
    });

    const result = mergePartition(local, cloud, entityName);

    expect(result.tombstones['task._.deleted']).toBeDefined();
    expect(Object.keys(result.entities)).toHaveLength(0);
  });

  it('handles local-only tombstones', () => {
    const local = makeBlob(entityName, {}, {
      'task._.deleted': { timestamp: 1000, counter: 0, nodeId: 'n1' },
    });
    const cloud = makeBlob(entityName, {});

    const result = mergePartition(local, cloud, entityName);

    expect(result.tombstones['task._.deleted']).toBeDefined();
    expect(Object.keys(result.entities)).toHaveLength(0);
  });

  it('resolves cloud entity vs local tombstone — entity wins when more recent', () => {
    const local = makeBlob(entityName, {}, {
      'task._.a': { timestamp: 1000, counter: 0, nodeId: 'n1' },
    });
    const cloud = makeBlob(entityName, {
      'task._.a': { id: 'task._.a', hlc: { timestamp: 3000, counter: 0, nodeId: 'n2' } },
    });

    const result = mergePartition(local, cloud, entityName);

    expect(result.entities['task._.a']).toBeDefined();
    expect(result.tombstones['task._.a']).toBeUndefined();
  });

  it('resolves two tombstones — keeps local when equal', () => {
    const hlc = { timestamp: 1000, counter: 0, nodeId: 'n1' };
    const local = makeBlob(entityName, {}, { 'task._.a': hlc });
    const cloud = makeBlob(entityName, {}, { 'task._.a': hlc });

    const result = mergePartition(local, cloud, entityName);
    expect(result.tombstones['task._.a']).toBeDefined();
  });

  it('resolves cloud entity vs local tombstone — cloud entity wins when newer', () => {
    const local = makeBlob(entityName, {}, {
      'task._.a': { timestamp: 1000, counter: 0, nodeId: 'n1' },
    });
    const cloud = makeBlob(entityName, {
      'task._.a': { id: 'task._.a', value: 'cloud-wins', hlc: { timestamp: 5000, counter: 0, nodeId: 'n2' } },
    });

    const result = mergePartition(local, cloud, entityName);

    expect(result.entities['task._.a']).toBeDefined();
    expect((result.entities['task._.a'] as Record<string, unknown>)['value']).toBe('cloud-wins');
    expect(result.tombstones['task._.a']).toBeUndefined();
  });

  it('resolves cloud entity vs local tombstone — local tombstone wins when newer', () => {
    const local = makeBlob(entityName, {}, {
      'task._.a': { timestamp: 5000, counter: 0, nodeId: 'n1' },
    });
    const cloud = makeBlob(entityName, {
      'task._.a': { id: 'task._.a', value: 'cloud-loses', hlc: { timestamp: 1000, counter: 0, nodeId: 'n2' } },
    });

    const result = mergePartition(local, cloud, entityName);

    expect(result.entities['task._.a']).toBeUndefined();
    expect(result.tombstones['task._.a']).toBeDefined();
    expect(result.tombstones['task._.a'].timestamp).toBe(5000);
  });

  it('includes cloud-only tombstones in merged result', () => {
    const local = makeBlob(entityName, {});
    const cloud = makeBlob(entityName, {}, {
      'task._.d1': { timestamp: 4000, counter: 0, nodeId: 'n2' },
    });

    const result = mergePartition(local, cloud, entityName);
    expect(result.tombstones['task._.d1']).toBeDefined();
    expect(result.tombstones['task._.d1'].timestamp).toBe(4000);
  });

  it('includes local-only tombstones in merged result', () => {
    const local = makeBlob(entityName, {}, {
      'task._.d2': { timestamp: 3000, counter: 0, nodeId: 'n1' },
    });
    const cloud = makeBlob(entityName, {});

    const result = mergePartition(local, cloud, entityName);
    expect(result.tombstones['task._.d2']).toBeDefined();
  });

  it('handles blobs where entity key is missing (undefined fallback)', () => {
    // Local blob has no 'task' key at all — triggers ?? {} fallback
    const local: PartitionBlob = { deleted: { [entityName]: {} } };
    const cloud = makeBlob(entityName, {
      'task._.c1': { id: 'task._.c1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n' } },
    });

    const result = mergePartition(local, cloud, entityName);
    expect(result.entities['task._.c1']).toBeDefined();
  });

  it('handles blobs where deleted section has no entity key', () => {
    const local = makeBlob(entityName, {
      'task._.a1': { id: 'task._.a1', hlc: { timestamp: 1000, counter: 0, nodeId: 'n' } },
    });
    // Cloud blob's deleted section has no 'task' key
    const cloud: PartitionBlob = { [entityName]: {}, deleted: {} };

    const result = mergePartition(local, cloud, entityName);
    expect(result.entities['task._.a1']).toBeDefined();
  });

  it('falls back to empty maps when cloud entities and local tombstones are absent', () => {
    // Cloud blob omits the 'task' entity key → cloudEntities ?? {} fallback.
    // Local blob's deleted section omits 'task' → localTombstones ?? {} fallback.
    const local: PartitionBlob = {
      [entityName]: {
        'task._.a': { id: 'task._.a', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } },
      },
      deleted: {},
    };
    const cloud: PartitionBlob = { deleted: { [entityName]: {} } };

    const result = mergePartition(local, cloud, entityName);

    expect(result.entities['task._.a']).toBeDefined();
    expect(Object.keys(result.tombstones)).toHaveLength(0);
  });
});
