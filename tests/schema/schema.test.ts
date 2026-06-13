import { describe, it, expect } from 'vitest';
import { defineEntity, formatEntityId, partitioned } from '@/schema';
import { generateId } from '@/utils';

describe('Schema', () => {
  describe('generateId', () => {
    it('returns an 8-character string', () => {
      expect(generateId()).toHaveLength(8);
    });

    it('returns URL-safe characters only', () => {
      expect(generateId()).toMatch(/^[A-Za-z0-9_-]{8}$/);
    });

    it('returns unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('formatEntityId', () => {
    it('formats as entityName.partitionKey.uniqueId', () => {
      expect(formatEntityId('transaction', '2026-03', 'Xk9mB2qR'))
        .toBe('transaction.2026-03.Xk9mB2qR');
    });
  });

  describe('defineEntity', () => {
    it('returns definition with name', () => {
      const def = defineEntity<{ amount: number }>('transaction');
      expect(def.name).toBe('transaction');
    });

    it('defaults to global key strategy', () => {
      const def = defineEntity<{ amount: number }>('transaction');
      expect(def.keyStrategy.kind).toBe('global');
      expect(def.keyStrategy.partitionFn({ amount: 0 })).toBe('_');
    });

    it('supports singleton key strategy', () => {
      const def = defineEntity<{ theme: string }>('settings', { keyStrategy: 'singleton' });
      expect(def.keyStrategy.kind).toBe('singleton');
      expect(def.keyStrategy.partitionFn({ theme: 'dark' })).toBe('_');
    });

    it('supports partitioned key strategy', () => {
      const def = defineEntity<{ date: string }>('transaction', {
        keyStrategy: partitioned((e) => e.date.slice(0, 7)),
      });
      expect(def.keyStrategy.kind).toBe('partitioned');
      expect(def.keyStrategy.partitionFn({ date: '2026-03-23' })).toBe('2026-03');
    });

    it('deriveId validates no dots in output', () => {
      const def = defineEntity<{ provider: string; userId: string }>('auth', {
        deriveId: (e) => `${e.provider}.${e.userId}`,
      });
      expect(() => def.deriveId!({ provider: 'google', userId: '123' }))
        .toThrow('dots');
    });

    it('deriveId passes through valid output', () => {
      const def = defineEntity<{ provider: string; userId: string }>('auth', {
        deriveId: (e) => `${e.provider}-${e.userId}`,
      });
      expect(def.deriveId!({ provider: 'google', userId: '123' })).toBe('google-123');
    });

    it('rejects entity names containing dots', () => {
      expect(() => defineEntity<{ x: string }>('auth.users'))
        .toThrow('must not contain dots');
    });
  });
});
