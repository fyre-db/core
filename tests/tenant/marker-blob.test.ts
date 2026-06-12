import { DEFAULT_OPTIONS } from '../helpers';
import { describe, it, expect } from 'vitest';
import { createDataAdapter } from '../helpers';
import type { Tenant } from '@/adapter';
import { writeMarkerBlob, readMarkerBlob, validateMarkerBlob } from '@/tenant';

function makeTenant(id: string, meta: Record<string, unknown>): Tenant {
  return { id, name: '', encrypted: false, meta, createdAt: new Date(), updatedAt: new Date() };
}

describe('writeMarkerBlob / readMarkerBlob', () => {
  it('round-trips marker blob', async () => {
    const adapter = createDataAdapter();
    const tenant = makeTenant('t1', { folder: 'test' });
    await writeMarkerBlob(adapter, tenant, ['transaction', 'account'], DEFAULT_OPTIONS);

    const marker = await readMarkerBlob(adapter, tenant, DEFAULT_OPTIONS);
    expect(marker).toBeDefined();
    expect(marker!.version).toBe(1);
    expect(marker!.createdAt).toBeInstanceOf(Date);
    expect(marker!.entityTypes).toEqual(['transaction', 'account']);
  });

  it('returns undefined for missing blob', async () => {
    const adapter = createDataAdapter();
    const tenant = makeTenant('missing', { folder: 'missing' });
    const result = await readMarkerBlob(adapter, tenant, DEFAULT_OPTIONS);
    expect(result).toBeUndefined();
  });

  it('persists entity types array correctly', async () => {
    const adapter = createDataAdapter();
    const tenant = makeTenant('t2', { bucket: 'x' });
    await writeMarkerBlob(adapter, tenant, ['user', 'post', 'comment'], DEFAULT_OPTIONS);

    const marker = await readMarkerBlob(adapter, tenant, DEFAULT_OPTIONS);
    expect(marker!.entityTypes).toEqual(['user', 'post', 'comment']);
  });

  it('writes to __fyredb key', async () => {
    const adapter = createDataAdapter();
    const tenant = makeTenant('t3', { f: '1' });
    await writeMarkerBlob(adapter, tenant, [], DEFAULT_OPTIONS);

    const data = await adapter.read(tenant, DEFAULT_OPTIONS.markerKey);
    expect(data).not.toBeNull();
  });

  it('persists empty entity types array', async () => {
    const adapter = createDataAdapter();
    const tenant = makeTenant('t4', {});
    await writeMarkerBlob(adapter, tenant, [], DEFAULT_OPTIONS);

    const marker = await readMarkerBlob(adapter, tenant, DEFAULT_OPTIONS);
    expect(marker!.entityTypes).toEqual([]);
  });
});

describe('validateMarkerBlob', () => {
  it('accepts version 1', () => {
    expect(validateMarkerBlob({ version: 1, createdAt: new Date(), entityTypes: [] })).toBe(true);
  });

  it('rejects version 0', () => {
    expect(validateMarkerBlob({ version: 0, createdAt: new Date(), entityTypes: [] })).toBe(false);
  });

  it('rejects version 2', () => {
    expect(validateMarkerBlob({ version: 2, createdAt: new Date(), entityTypes: [] })).toBe(false);
  });

  it('rejects negative version', () => {
    expect(validateMarkerBlob({ version: -1, createdAt: new Date(), entityTypes: [] })).toBe(false);
  });
});

describe('readMarkerBlob edge cases', () => {
  it('returns undefined when blob has no __system key', async () => {
    const adapter = createDataAdapter();
    const tenant = makeTenant('t5', {});
    await adapter.write(tenant, DEFAULT_OPTIONS.markerKey, { deleted: {} });
    const result = await readMarkerBlob(adapter, tenant, DEFAULT_OPTIONS);
    expect(result).toBeUndefined();
  });
});

