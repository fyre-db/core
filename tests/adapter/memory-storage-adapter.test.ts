import { describe, it, expect } from 'vitest';
import { MemoryStorageAdapter } from '@/adapter';

describe('MemoryStorageAdapter', () => {
  it('read returns null for missing key', async () => {
    const adapter = new MemoryStorageAdapter();
    const result = await adapter.read(undefined, 'missing');
    expect(result).toBeNull();
  });

  it('read/write round-trip', async () => {
    const adapter = new MemoryStorageAdapter();
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    await adapter.write(undefined, 'test-key', data);
    const result = await adapter.read(undefined, 'test-key');
    expect(result).toEqual(data);
  });

  it('write stores defensive copy (mutation isolation)', async () => {
    const adapter = new MemoryStorageAdapter();
    const data = new Uint8Array([10, 20, 30]);
    await adapter.write(undefined, 'key', data);
    data[0] = 99;
    const result = await adapter.read(undefined, 'key');
    expect(result![0]).toBe(10);
  });

  it('read returns defensive copy', async () => {
    const adapter = new MemoryStorageAdapter();
    await adapter.write(undefined, 'key', new Uint8Array([1, 2, 3]));
    const r1 = await adapter.read(undefined, 'key');
    r1![0] = 99;
    const r2 = await adapter.read(undefined, 'key');
    expect(r2![0]).toBe(1);
  });

  it('delete returns true when key exists', async () => {
    const adapter = new MemoryStorageAdapter();
    await adapter.write(undefined, 'key', new Uint8Array([1]));
    expect(await adapter.delete(undefined, 'key')).toBe(true);
  });

  it('delete returns false when key missing', async () => {
    const adapter = new MemoryStorageAdapter();
    expect(await adapter.delete(undefined, 'missing')).toBe(false);
  });

  it('tenant isolation', async () => {
    const adapter = new MemoryStorageAdapter();
    const now = new Date();
    const t1 = { id: 't1', name: 'T1', encrypted: false, meta: {}, createdAt: now, updatedAt: now } as const;
    const t2 = { id: 't2', name: 'T2', encrypted: false, meta: {}, createdAt: now, updatedAt: now } as const;
    await adapter.write(t1, 'key', new Uint8Array([1]));
    await adapter.write(t2, 'key', new Uint8Array([2]));
    const r1 = await adapter.read(t1, 'key');
    const r2 = await adapter.read(t2, 'key');
    expect(r1![0]).toBe(1);
    expect(r2![0]).toBe(2);
  });
});



