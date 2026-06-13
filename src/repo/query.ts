import { compareValues, valuesEqual } from '@/utils';

export function applyWhere<T>(
  entities: ReadonlyArray<T>,
  where: Partial<T>,
): ReadonlyArray<T> {
  const keys = Object.keys(where) as Array<keyof T>;
  return entities.filter(entity =>
    keys.every(key => valuesEqual(entity[key], where[key])),
  );
}

export function applyRange<T>(
  entities: ReadonlyArray<T>,
  range: {
    readonly field: keyof T;
    readonly gt?: unknown;
    readonly gte?: unknown;
    readonly lt?: unknown;
    readonly lte?: unknown;
  },
): ReadonlyArray<T> {
  return entities.filter(entity => {
    const value: unknown = entity[range.field];
    if (range.gt !== undefined && compareValues(value, range.gt) <= 0) return false;
    if (range.gte !== undefined && compareValues(value, range.gte) < 0) return false;
    if (range.lt !== undefined && compareValues(value, range.lt) >= 0) return false;
    if (range.lte !== undefined && compareValues(value, range.lte) > 0) return false;
    return true;
  });
}

export function applyOrderBy<T>(
  entities: ReadonlyArray<T>,
  orderBy: ReadonlyArray<{ readonly field: keyof T; readonly direction: 'asc' | 'desc' }>,
): ReadonlyArray<T> {
  return [...entities].sort((a, b) => {
    for (const { field, direction } of orderBy) {
      const cmp = compareValues(a[field], b[field]);
      if (cmp !== 0) return direction === 'asc' ? cmp : -cmp;
    }
    return 0;
  });
}

export function applyPagination<T>(
  entities: ReadonlyArray<T>,
  offset?: number,
  limit?: number,
): ReadonlyArray<T> {
  let result: ReadonlyArray<T> = entities;
  if (offset !== undefined) {
    result = result.slice(Math.max(0, offset));
  }
  if (limit !== undefined) {
    result = result.slice(0, Math.max(0, limit));
  }
  return result;
}
