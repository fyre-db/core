import { describe, it, expect } from 'vitest';
import { serialize, deserialize } from '@/utils';

describe('Serialization', () => {
  it('round-trips plain data without Dates', () => {
    const data = { name: 'test', count: 42, active: true };
    const bytes = serialize(data);
    const result = deserialize<typeof data>(bytes);
    expect(result).toEqual(data);
  });

  it('round-trips Date values', () => {
    const date = new Date('2026-03-22T10:30:00.000Z');
    const data = { createdAt: date };
    const bytes = serialize(data);
    const result = deserialize<typeof data>(bytes);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe('2026-03-22T10:30:00.000Z');
  });

  it('round-trips nested Date fields', () => {
    const data = {
      outer: {
        inner: {
          date: new Date('2026-01-15T08:00:00.000Z'),
        },
      },
    };
    const bytes = serialize(data);
    const result = deserialize<typeof data>(bytes);
    expect(result.outer.inner.date).toBeInstanceOf(Date);
    expect(result.outer.inner.date.toISOString()).toBe('2026-01-15T08:00:00.000Z');
  });

  it('produces correct type marker format', () => {
    const data = { date: new Date('2026-03-22T10:30:00.000Z') };
    const bytes = serialize(data);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    expect(parsed.date).toEqual({ __t: 'D', v: '2026-03-22T10:30:00.000Z' });
  });

  it('produces valid Uint8Array encoding', () => {
    const data = { key: 'value' };
    const bytes = serialize(data);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('handles arrays with Date elements', () => {
    const data = { dates: [new Date('2026-01-01T00:00:00.000Z'), new Date('2026-06-15T00:00:00.000Z')] };
    const bytes = serialize(data);
    const result = deserialize<typeof data>(bytes);
    expect(result.dates[0]).toBeInstanceOf(Date);
    expect(result.dates[1]).toBeInstanceOf(Date);
  });

  it('reviver passes through object with unknown __t marker', () => {
    // An object with __t that is not 'D' should be returned as-is
    const json = JSON.stringify({ marker: { __t: 'X', v: 'hello' } });
    const bytes = new TextEncoder().encode(json);
    const result = deserialize<{ marker: { __t: string; v: string } }>(bytes);
    expect(result.marker).toEqual({ __t: 'X', v: 'hello' });
  });

  it('handles null values', () => {
    const data = { a: null, b: 'test' };
    const bytes = serialize(data);
    const result = deserialize<typeof data>(bytes);
    expect(result).toEqual({ a: null, b: 'test' });
  });
});
