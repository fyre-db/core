import { describe, it, expect } from 'vitest';
import { Store } from '@/store';
import { DEFAULT_OPTIONS } from '../helpers';
import type { Hlc } from '@/hlc';

describe('EntityStore tombstones', () => {
  const hlc1: Hlc = { timestamp: 1000, counter: 0, nodeId: 'node1' };
  const hlc2: Hlc = { timestamp: 2000, counter: 1, nodeId: 'node2' };

  it('getTombstones returns empty map when no tombstones', () => {
    const store = new Store(DEFAULT_OPTIONS);
    const tombstones = store.getTombstones('transaction._');
    expect(tombstones.size).toBe(0);
  });

  it('setTombstone stores HLC for deleted entity', () => {
    const store = new Store(DEFAULT_OPTIONS);
    store.setTombstone('transaction._', 'entity1', hlc1);
    const tombstones = store.getTombstones('transaction._');
    expect(tombstones.size).toBe(1);
    expect(tombstones.get('entity1')).toEqual(hlc1);
  });

  it('setTombstone stores multiple tombstones per partition', () => {
    const store = new Store(DEFAULT_OPTIONS);
    store.setTombstone('transaction._', 'entity1', hlc1);
    store.setTombstone('transaction._', 'entity2', hlc2);
    const tombstones = store.getTombstones('transaction._');
    expect(tombstones.size).toBe(2);
  });

  it('setTombstone overwrites existing tombstone for same entity', () => {
    const store = new Store(DEFAULT_OPTIONS);
    store.setTombstone('transaction._', 'entity1', hlc1);
    store.setTombstone('transaction._', 'entity1', hlc2);
    const tombstones = store.getTombstones('transaction._');
    expect(tombstones.size).toBe(1);
    expect(tombstones.get('entity1')).toEqual(hlc2);
  });

  it('setTombstone marks partition dirty', () => {
    const store = new Store(DEFAULT_OPTIONS);
    store.setTombstone('transaction._', 'entity1', hlc1);
    expect(store.getDirtyKeys().has('transaction._')).toBe(true);
  });

  it('tombstones are isolated per partition', () => {
    const store = new Store(DEFAULT_OPTIONS);
    store.setTombstone('transaction.a', 'entity1', hlc1);
    store.setTombstone('transaction.b', 'entity2', hlc2);
    expect(store.getTombstones('transaction.a').size).toBe(1);
    expect(store.getTombstones('transaction.b').size).toBe(1);
  });
});
