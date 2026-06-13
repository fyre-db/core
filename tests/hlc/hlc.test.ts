import { describe, it, expect, vi } from 'vitest';
import { createHlc, tick, compareHlc } from '@/hlc';

describe('HLC', () => {
  describe('createHlc', () => {
    it('creates an HLC with the given nodeId', () => {
      const hlc = createHlc('node1');
      expect(hlc.nodeId).toBe('node1');
      expect(hlc.timestamp).toBe(0);
      expect(hlc.counter).toBe(0);
    });
  });

  describe('tick (local)', () => {
    it('advances timestamp to wall clock when clock is ahead', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const hlc = { timestamp: 500, counter: 3, nodeId: 'n1' };
      const result = tick(hlc);
      expect(result.timestamp).toBe(1000);
      expect(result.counter).toBe(0);
      expect(result.nodeId).toBe('n1');
      vi.restoreAllMocks();
    });

    it('increments counter when wall clock is behind', () => {
      vi.spyOn(Date, 'now').mockReturnValue(500);
      const hlc = { timestamp: 1000, counter: 3, nodeId: 'n1' };
      const result = tick(hlc);
      expect(result.timestamp).toBe(1000);
      expect(result.counter).toBe(4);
      vi.restoreAllMocks();
    });
  });

  describe('tick (remote)', () => {
    it('uses wall clock when ahead of both', () => {
      vi.spyOn(Date, 'now').mockReturnValue(2000);
      const local = { timestamp: 1000, counter: 5, nodeId: 'n1' };
      const remote = { timestamp: 1500, counter: 3, nodeId: 'n2' };
      const result = tick(local, remote);
      expect(result.timestamp).toBe(2000);
      expect(result.counter).toBe(0);
      expect(result.nodeId).toBe('n1');
      vi.restoreAllMocks();
    });

    it('merges when local and remote have same timestamp', () => {
      vi.spyOn(Date, 'now').mockReturnValue(500);
      const local = { timestamp: 1000, counter: 3, nodeId: 'n1' };
      const remote = { timestamp: 1000, counter: 7, nodeId: 'n2' };
      const result = tick(local, remote);
      expect(result.timestamp).toBe(1000);
      expect(result.counter).toBe(8);
      expect(result.nodeId).toBe('n1');
      vi.restoreAllMocks();
    });

    it('uses local timestamp when local is ahead', () => {
      vi.spyOn(Date, 'now').mockReturnValue(500);
      const local = { timestamp: 1500, counter: 3, nodeId: 'n1' };
      const remote = { timestamp: 1000, counter: 7, nodeId: 'n2' };
      const result = tick(local, remote);
      expect(result.timestamp).toBe(1500);
      expect(result.counter).toBe(4);
      expect(result.nodeId).toBe('n1');
      vi.restoreAllMocks();
    });

    it('uses remote timestamp when remote is ahead', () => {
      vi.spyOn(Date, 'now').mockReturnValue(500);
      const local = { timestamp: 1000, counter: 3, nodeId: 'n1' };
      const remote = { timestamp: 1500, counter: 7, nodeId: 'n2' };
      const result = tick(local, remote);
      expect(result.timestamp).toBe(1500);
      expect(result.counter).toBe(8);
      expect(result.nodeId).toBe('n1');
      vi.restoreAllMocks();
    });
  });

  describe('compareHlc', () => {
    it('returns -1 when a.timestamp < b.timestamp', () => {
      expect(compareHlc(
        { timestamp: 100, counter: 0, nodeId: 'n1' },
        { timestamp: 200, counter: 0, nodeId: 'n1' },
      )).toBe(-1);
    });

    it('returns 1 when a.timestamp > b.timestamp', () => {
      expect(compareHlc(
        { timestamp: 200, counter: 0, nodeId: 'n1' },
        { timestamp: 100, counter: 0, nodeId: 'n1' },
      )).toBe(1);
    });

    it('compares counter when timestamps equal', () => {
      expect(compareHlc(
        { timestamp: 100, counter: 1, nodeId: 'n1' },
        { timestamp: 100, counter: 5, nodeId: 'n1' },
      )).toBe(-1);
    });

    it('compares nodeId as final tiebreaker', () => {
      expect(compareHlc(
        { timestamp: 100, counter: 1, nodeId: 'a1' },
        { timestamp: 100, counter: 1, nodeId: 'b1' },
      )).toBe(-1);
    });

    it('returns 0 when all fields are equal', () => {
      const hlc = { timestamp: 100, counter: 1, nodeId: 'n1' };
      expect(compareHlc(hlc, hlc)).toBe(0);
    });
  });
});
