/**
 * Coverage-gap tests for utils/fnv.ts
 * Covers: fnvHash (lines 20-25) — deterministic short hashing over the
 * base64url alphabet — plus the underlying fnv1a / fnv1aAppend behaviour.
 */
import { describe, it, expect } from 'vitest';
import { fnv1a, fnv1aAppend, fnvHash, FNV_OFFSET } from '@/utils/fnv';

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

describe('fnvHash', () => {
  it('is deterministic for the same input', () => {
    expect(fnvHash('hello')).toBe(fnvHash('hello'));
  });

  it('produces a 6-character base64url string', () => {
    const out = fnvHash('some-partition-key');
    expect(out).toHaveLength(6);
    expect(out).toMatch(BASE64URL_RE);
  });

  it('maps different inputs to different hashes', () => {
    expect(fnvHash('alpha')).not.toBe(fnvHash('beta'));
  });

  it('hashes the empty string deterministically into the alphabet', () => {
    const out = fnvHash('');
    expect(out).toHaveLength(6);
    expect(out).toMatch(BASE64URL_RE);
    expect(out).toBe(fnvHash(''));
  });

  it('handles unicode input without throwing', () => {
    const out = fnvHash('café—日本語');
    expect(out).toHaveLength(6);
    expect(out).toMatch(BASE64URL_RE);
    expect(out).toBe(fnvHash('café—日本語'));
  });

  it('only emits characters from the documented base64url alphabet', () => {
    const inputs = ['', 'a', 'ab', 'abc', 'partition/2024-01', '0', '~', '🙂'];
    for (const input of inputs) {
      expect(fnvHash(input)).toMatch(BASE64URL_RE);
    }
  });

  it('derives directly from fnv1a of the input', () => {
    // Re-derive the expected output independently from the public fnv1a hash
    // to prove fnvHash reads the low five-bit groups of the 32-bit hash.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const h = fnv1a('reference');
    let expected = '';
    for (let i = 0; i < 6; i++) {
      expected += alphabet[(h >>> (i * 5)) & 0x1f];
    }
    expect(fnvHash('reference')).toBe(expected);
  });
});

describe('fnv1a / fnv1aAppend', () => {
  it('fnv1a of empty string equals the FNV offset basis', () => {
    expect(fnv1a('')).toBe(FNV_OFFSET);
  });

  it('fnv1a composes via fnv1aAppend from the offset basis', () => {
    expect(fnv1a('chunk')).toBe(fnv1aAppend(FNV_OFFSET, 'chunk'));
  });

  it('appending incrementally matches hashing the concatenation', () => {
    const incremental = fnv1aAppend(fnv1a('foo'), 'bar');
    expect(incremental).toBe(fnv1a('foobar'));
  });

  it('returns an unsigned 32-bit integer', () => {
    const h = fnv1a('overflow-check-string');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(h)).toBe(true);
  });
});
