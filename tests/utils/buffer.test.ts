import { describe, it, expect } from 'vitest';
import {
  toArrayBuffer,
  toBase64,
  fromBase64,
  streamToUint8Array,
} from '@/utils';

describe('buffer utilities', () => {
  describe('toArrayBuffer', () => {
    it('converts Uint8Array to ArrayBuffer', () => {
      const data = new Uint8Array([1, 2, 3]);
      const buf = toArrayBuffer(data);
      expect(buf).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(buf)).toEqual(data);
    });

    it('handles byte offset correctly', () => {
      const full = new Uint8Array([0, 1, 2, 3, 4]);
      const slice = full.subarray(2, 5); // [2, 3, 4] with byteOffset=2
      const buf = toArrayBuffer(slice);
      expect(new Uint8Array(buf)).toEqual(new Uint8Array([2, 3, 4]));
    });

    it('handles empty array', () => {
      const data = new Uint8Array(0);
      const buf = toArrayBuffer(data);
      expect(buf.byteLength).toBe(0);
    });
  });

  describe('toBase64 / fromBase64', () => {
    it('round-trips data', () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]);
      const b64 = toBase64(data);
      const result = fromBase64(b64);
      expect(result).toEqual(data);
    });

    it('handles empty array', () => {
      const b64 = toBase64(new Uint8Array(0));
      expect(fromBase64(b64)).toEqual(new Uint8Array(0));
    });

    it('fromBase64 throws on invalid input', () => {
      expect(() => fromBase64('!!!invalid!!!')).toThrow('Invalid base64');
    });
  });

  describe('streamToUint8Array', () => {
    it('collects stream into Uint8Array', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(data.slice(0, 3));
          controller.enqueue(data.slice(3));
          controller.close();
        },
      });
      const result = await streamToUint8Array(stream);
      expect(result).toEqual(data);
    });

    it('handles empty stream', async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });
      const result = await streamToUint8Array(stream);
      expect(result).toEqual(new Uint8Array(0));
    });

    it('handles single-chunk stream', async () => {
      const data = new Uint8Array([10, 20, 30]);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });
      const result = await streamToUint8Array(stream);
      expect(result).toEqual(data);
    });
  });
});
