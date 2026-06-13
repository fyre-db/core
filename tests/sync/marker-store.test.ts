import { describe, it, expect } from 'vitest';
import { MarkerStore } from '@/sync/marker-store';
import type { DataAdapter } from '@/persistence';
import { createDataAdapter, DEFAULT_OPTIONS } from '../helpers';

function countingAdapter(): { adapter: DataAdapter; reads: () => number } {
  const adapter = createDataAdapter();
  let reads = 0;
  const origRead = adapter.read.bind(adapter);
  adapter.read = async (tenant, key) => {
    reads++;
    return origRead(tenant, key);
  };
  return { adapter, reads: () => reads };
}

describe('MarkerStore', () => {
  it('caches indexes so a second read for the same tier hits the cache', async () => {
    const { adapter, reads } = countingAdapter();
    const store = new MarkerStore(DEFAULT_OPTIONS);

    const first = await store.getIndexes('local', adapter, undefined);
    const second = await store.getIndexes('local', adapter, undefined);

    // Second call is served from the cache: same object, no extra read.
    expect(second).toBe(first);
    expect(reads()).toBe(1);
  });

  it('coalesces concurrent reads for the same tier into one adapter read', async () => {
    const { adapter, reads } = countingAdapter();
    const store = new MarkerStore(DEFAULT_OPTIONS);

    // Both calls are issued before the first read resolves, so the second
    // call returns the already in-flight promise instead of starting a read.
    const [first, second] = await Promise.all([
      store.getIndexes('local', adapter, undefined),
      store.getIndexes('local', adapter, undefined),
    ]);

    expect(second).toBe(first);
    expect(reads()).toBe(1);
  });

  it('discards an in-flight read when the tier is invalidated mid-read', async () => {
    const { adapter, reads } = countingAdapter();
    const store = new MarkerStore(DEFAULT_OPTIONS);

    const inflight = store.getIndexes('local', adapter, undefined);
    // Invalidating before the read resolves bumps the epoch so the result is
    // discarded instead of populating the cache.
    store.invalidate('local', undefined);
    await inflight;

    // Cache was never populated, so the next read loads again.
    await store.getIndexes('local', adapter, undefined);
    expect(reads()).toBe(2);
  });

  it('does not repopulate the in-flight map when cleared mid-read', async () => {
    const { adapter } = countingAdapter();
    const store = new MarkerStore(DEFAULT_OPTIONS);

    const inflight = store.getIndexes('local', adapter, undefined);
    // clear() empties the in-flight map, so when the read settles its finalizer
    // sees that the stored entry is no longer its own work.
    store.clear();

    await expect(inflight).resolves.toEqual({});
  });
});
