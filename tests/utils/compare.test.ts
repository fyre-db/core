/**
 * Coverage-gap tests for utils/compare.ts
 * Covers: typeRank fallthrough (objects), boolean comparison, Date comparison,
 * undefined/null equality, and valuesEqual with non-Date types.
 */
import { describe, it, expect } from 'vitest';
import { compareValues, valuesEqual } from '@/utils/compare';

describe('compareValues — coverage gaps', () => {
  it('returns 0 for two undefined values', () => {
    expect(compareValues(undefined, undefined)).toBe(0);
  });

  it('returns 0 for two null values', () => {
    expect(compareValues(null, null)).toBe(0);
  });

  it('compares booleans: true > false', () => {
    expect(compareValues(true, false)).toBe(1);
  });

  it('compares booleans: false < true', () => {
    expect(compareValues(false, true)).toBe(-1);
  });

  it('compares booleans: same returns 0', () => {
    expect(compareValues(true, true)).toBe(0);
  });

  it('compares Dates', () => {
    const a = new Date('2026-01-01');
    const b = new Date('2026-06-01');
    expect(compareValues(a, b)).toBeLessThan(0);
    expect(compareValues(b, a)).toBeGreaterThan(0);
    expect(compareValues(a, a)).toBe(0);
  });

  it('orders across types: undefined < null < boolean < number < string < Date < object', () => {
    expect(compareValues(undefined, null)).toBeLessThan(0);
    expect(compareValues(null, true)).toBeLessThan(0);
    expect(compareValues(true, 1)).toBeLessThan(0);
    expect(compareValues(1, 'a')).toBeLessThan(0);
    expect(compareValues('a', new Date())).toBeLessThan(0);
  });

  it('returns 0 for two unknown-type objects', () => {
    expect(compareValues({}, {})).toBe(0);
    expect(compareValues([], [])).toBe(0);
  });
});

describe('valuesEqual — coverage gaps', () => {
  it('compares Date equality', () => {
    expect(valuesEqual(new Date('2026-01-01'), new Date('2026-01-01'))).toBe(true);
    expect(valuesEqual(new Date('2026-01-01'), new Date('2026-02-01'))).toBe(false);
  });

  it('uses strict equality for non-Date', () => {
    expect(valuesEqual(1, 1)).toBe(true);
    expect(valuesEqual(1, 2)).toBe(false);
    expect(valuesEqual('a', 'a')).toBe(true);
    expect(valuesEqual(null, null)).toBe(true);
    expect(valuesEqual(null, undefined)).toBe(false);
  });
});
