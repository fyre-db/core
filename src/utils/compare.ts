function typeRank(v: unknown): number {
  if (v === undefined) return 0;
  if (v === null) return 1;
  if (typeof v === 'boolean') return 2;
  if (typeof v === 'number') return 3;
  if (typeof v === 'string') return 4;
  if (v instanceof Date) return 5;
  return 6;
}

export function compareValues(a: unknown, b: unknown): number {
  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) return ra - rb;

  if (a === undefined || a === null) return 0;
  if (typeof a === 'boolean') return (a === b) ? 0 : a ? 1 : -1;
  if (typeof a === 'number') return (a) - (b as number);
  if (typeof a === 'string') return a < (b as string) ? -1 : a > (b as string) ? 1 : 0;
  if (a instanceof Date) return (a).getTime() - (b as Date).getTime();
  return 0;
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}
