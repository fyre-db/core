import { describe, it, expect } from 'vitest';
import type { Hlc } from '@/hlc';
import { resolveConflict, resolveEntityTombstone } from '@/sync';

describe('resolveConflict', () => {
  it('picks entity with higher timestamp', () => {
    const local = { hlc: { timestamp: 1000, counter: 0, nodeId: 'A' } };
    const cloud = { hlc: { timestamp: 2000, counter: 0, nodeId: 'B' } };

    expect(resolveConflict(local, cloud)).toBe(cloud);
  });

  it('picks entity with higher counter when timestamps equal', () => {
    const local = { hlc: { timestamp: 1000, counter: 5, nodeId: 'A' } };
    const cloud = { hlc: { timestamp: 1000, counter: 3, nodeId: 'B' } };

    expect(resolveConflict(local, cloud)).toBe(local);
  });

  it('uses nodeId string comparison as final tiebreaker', () => {
    const local = { hlc: { timestamp: 1000, counter: 0, nodeId: 'B' } };
    const cloud = { hlc: { timestamp: 1000, counter: 0, nodeId: 'A' } };

    // 'B' > 'A', so local wins
    expect(resolveConflict(local, cloud)).toBe(local);
  });

  it('picks local when HLCs are identical', () => {
    const local = { hlc: { timestamp: 1000, counter: 0, nodeId: 'A' } };
    const cloud = { hlc: { timestamp: 1000, counter: 0, nodeId: 'A' } };

    expect(resolveConflict(local, cloud)).toBe(local);
  });

  it('picks cloud when cloud has higher counter and same timestamp', () => {
    const local = { hlc: { timestamp: 1000, counter: 1, nodeId: 'A' } };
    const cloud = { hlc: { timestamp: 1000, counter: 3, nodeId: 'B' } };

    expect(resolveConflict(local, cloud)).toBe(cloud);
  });

  it('preserves full entity data on winner', () => {
    const local = { id: 'x', value: 'old', hlc: { timestamp: 1000, counter: 0, nodeId: 'A' } };
    const cloud = { id: 'x', value: 'new', hlc: { timestamp: 2000, counter: 0, nodeId: 'B' } };

    const winner = resolveConflict(local, cloud);
    expect((winner as Record<string, unknown>)['value']).toBe('new');
  });
});

describe('resolveEntityTombstone', () => {
  it('returns entity when entity HLC is higher', () => {
    const entityHlc: Hlc = { timestamp: 2000, counter: 0, nodeId: 'A' };
    const tombstoneHlc: Hlc = { timestamp: 1000, counter: 0, nodeId: 'A' };

    expect(resolveEntityTombstone(entityHlc, tombstoneHlc)).toBe('entity');
  });

  it('returns tombstone when tombstone HLC is higher', () => {
    const entityHlc: Hlc = { timestamp: 1000, counter: 0, nodeId: 'A' };
    const tombstoneHlc: Hlc = { timestamp: 2000, counter: 0, nodeId: 'A' };

    expect(resolveEntityTombstone(entityHlc, tombstoneHlc)).toBe('tombstone');
  });

  it('returns tombstone when HLCs are equal', () => {
    const entityHlc: Hlc = { timestamp: 1000, counter: 0, nodeId: 'A' };
    const tombstoneHlc: Hlc = { timestamp: 1000, counter: 0, nodeId: 'A' };

    expect(resolveEntityTombstone(entityHlc, tombstoneHlc)).toBe('tombstone');
  });

  it('uses counter to break timestamp tie — entity wins', () => {
    const entityHlc: Hlc = { timestamp: 1000, counter: 2, nodeId: 'A' };
    const tombstoneHlc: Hlc = { timestamp: 1000, counter: 1, nodeId: 'A' };

    expect(resolveEntityTombstone(entityHlc, tombstoneHlc)).toBe('entity');
  });

  it('uses counter to break timestamp tie — tombstone wins', () => {
    const entityHlc: Hlc = { timestamp: 1000, counter: 1, nodeId: 'A' };
    const tombstoneHlc: Hlc = { timestamp: 1000, counter: 2, nodeId: 'A' };

    expect(resolveEntityTombstone(entityHlc, tombstoneHlc)).toBe('tombstone');
  });

  it('uses nodeId to break full tie — entity wins when nodeId higher', () => {
    const entityHlc: Hlc = { timestamp: 1000, counter: 0, nodeId: 'B' };
    const tombstoneHlc: Hlc = { timestamp: 1000, counter: 0, nodeId: 'A' };

    expect(resolveEntityTombstone(entityHlc, tombstoneHlc)).toBe('entity');
  });
});
