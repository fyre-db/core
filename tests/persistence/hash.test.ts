import { describe, it, expect } from 'vitest';
import { fnv1a, fnv1aAppend, FNV_OFFSET } from '@/utils';
import { partitionHash } from '@/persistence';

describe('FNV-1a Hashing', () => {
  describe('fnv1a', () => {
    it('returns FNV_OFFSET for empty string', () => {
      expect(fnv1a('')).toBe(2166136261);
    });

    it('matches known test vector for "a"', () => {
      expect(fnv1a('a')).toBe(0xe40c292c);
    });

    it('matches known test vector for "foobar"', () => {
      expect(fnv1a('foobar')).toBe(0xbf9cf968);
    });

    it('produces deterministic output', () => {
      expect(fnv1a('hello')).toBe(fnv1a('hello'));
    });

    it('produces different output for different input', () => {
      expect(fnv1a('hello')).not.toBe(fnv1a('world'));
    });
  });

  describe('fnv1aAppend', () => {
    it('produces same result as fnv1a for single input from offset', () => {
      expect(fnv1aAppend(FNV_OFFSET, 'test')).toBe(fnv1a('test'));
    });

    it('allows incremental hashing', () => {
      const hash1 = fnv1aAppend(FNV_OFFSET, 'foo');
      const hash2 = fnv1aAppend(hash1, 'bar');
      expect(hash2).toBe(fnv1a('foobar'));
    });
  });

  describe('partitionHash', () => {
    it('returns FNV_OFFSET for empty map', () => {
      const map = new Map();
      expect(partitionHash(map)).toBe(FNV_OFFSET);
    });

    it('produces deterministic output for same input', () => {
      const map = new Map([
        ['id1', { timestamp: 1000, counter: 0, nodeId: 'n1' }],
      ]);
      expect(partitionHash(map)).toBe(partitionHash(new Map(map)));
    });

    it('changes when HLC differs', () => {
      const map1 = new Map([
        ['id1', { timestamp: 1000, counter: 0, nodeId: 'n1' }],
      ]);
      const map2 = new Map([
        ['id1', { timestamp: 1001, counter: 0, nodeId: 'n1' }],
      ]);
      expect(partitionHash(map1)).not.toBe(partitionHash(map2));
    });

    it('produces same hash regardless of insertion order', () => {
      const map1 = new Map([
        ['id1', { timestamp: 1000, counter: 0, nodeId: 'n1' }],
        ['id2', { timestamp: 2000, counter: 1, nodeId: 'n2' }],
      ]);
      const map2 = new Map([
        ['id2', { timestamp: 2000, counter: 1, nodeId: 'n2' }],
        ['id1', { timestamp: 1000, counter: 0, nodeId: 'n1' }],
      ]);
      expect(partitionHash(map1)).toBe(partitionHash(map2));
    });
  });
});
