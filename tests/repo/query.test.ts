import { describe, it, expect } from 'vitest';
import { applyOrderBy, applyRange, applyPagination } from '@/repo';

describe('applyOrderBy — Date, string, and equal values', () => {
  it('sorts by Date fields ascending', () => {
    const entities = [
      { name: 'B', date: new Date('2026-03-02') },
      { name: 'A', date: new Date('2026-03-01') },
      { name: 'C', date: new Date('2026-03-03') },
    ];
    const result = applyOrderBy(entities, [{ field: 'date', direction: 'asc' }]);
    expect(result.map(e => e.name)).toEqual(['A', 'B', 'C']);
  });

  it('sorts by Date fields descending', () => {
    const entities = [
      { name: 'A', date: new Date('2026-03-01') },
      { name: 'C', date: new Date('2026-03-03') },
    ];
    const result = applyOrderBy(entities, [{ field: 'date', direction: 'desc' }]);
    expect(result[0].name).toBe('C');
  });

  it('sorts by string fields', () => {
    const entities = [
      { name: 'Charlie', value: 1 },
      { name: 'Alpha', value: 2 },
      { name: 'Bravo', value: 3 },
    ];
    const result = applyOrderBy(entities, [{ field: 'name', direction: 'asc' }]);
    expect(result.map(e => e.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('returns 0 for equal string values', () => {
    const entities = [
      { name: 'A', tag: 'same' },
      { name: 'B', tag: 'same' },
    ];
    const result = applyOrderBy(entities, [{ field: 'tag', direction: 'asc' }]);
    expect(result).toHaveLength(2);
  });

  it('returns 0 for equal sort fields — all comparisons tie', () => {
    const entities = [
      { name: 'A', category: 'x', priority: 1 },
      { name: 'B', category: 'x', priority: 1 },
    ];
    const result = applyOrderBy(entities, [
      { field: 'category', direction: 'asc' },
      { field: 'priority', direction: 'asc' },
    ]);
    expect(result).toHaveLength(2);
  });

  it('falls through to return 0 for non-comparable types', () => {
    const entities = [
      { name: 'A', flag: true },
      { name: 'B', flag: false },
    ];
    const result = applyOrderBy(
      entities,
      [{ field: 'flag' as keyof (typeof entities)[0], direction: 'asc' }],
    );
    expect(result).toHaveLength(2);
  });
});

describe('applyRange — Date range', () => {
  it('filters by Date gt and lte', () => {
    const entities = [
      { name: 'A', created: new Date('2026-01-01') },
      { name: 'B', created: new Date('2026-06-15') },
      { name: 'C', created: new Date('2026-12-31') },
    ];
    const result = applyRange(entities, {
      field: 'created',
      gt: new Date('2026-03-01'),
      lte: new Date('2026-12-31'),
    });
    expect(result.map(e => e.name)).toEqual(['B', 'C']);
  });

  it('filters by Date gte and lt', () => {
    const entities = [
      { name: 'A', created: new Date('2026-01-01') },
      { name: 'B', created: new Date('2026-06-15') },
      { name: 'C', created: new Date('2026-12-31') },
    ];
    const result = applyRange(entities, {
      field: 'created',
      gte: new Date('2026-06-15'),
      lt: new Date('2026-12-31'),
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('B');
  });

  it('filters by gte only', () => {
    const entities = [
      { name: 'A', value: 1 },
      { name: 'B', value: 5 },
      { name: 'C', value: 10 },
    ];
    const result = applyRange(entities, { field: 'value', gte: 5 });
    expect(result.map(e => e.name)).toEqual(['B', 'C']);
  });

  it('filters by lte only', () => {
    const entities = [
      { name: 'A', value: 1 },
      { name: 'B', value: 5 },
      { name: 'C', value: 10 },
    ];
    const result = applyRange(entities, { field: 'value', lte: 5 });
    expect(result.map(e => e.name)).toEqual(['A', 'B']);
  });
});

describe('applyPagination', () => {
  it('clamps negative offset to zero', () => {
    const entities = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const result = applyPagination(entities, -5);
    expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  it('clamps negative limit to zero', () => {
    const entities = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const result = applyPagination(entities, undefined, -1);
    expect(result).toEqual([]);
  });
});
