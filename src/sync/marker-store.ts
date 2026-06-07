import type { Tenant } from '@/adapter';
import type { AllIndexes, DataAdapter } from '@/persistence';
import { loadAllIndexes } from '@/persistence';
import type { ResolvedStrataOptions } from '../options';
import { log } from '@/log';

/**
 * Persistent tiers that own a marker (index) blob. The in-memory store
 * computes its marker from live state and is therefore not cached here.
 */
export type MarkerTier = 'local' | 'cloud';

/**
 * Caches the per-tier marker (partition index) read by lazy hydration and
 * sync-filter derivation so a burst of partition loads reads the shared
 * marker blob once instead of once per partition.
 *
 * Ownership boundary: the unified sync path reads and writes the marker
 * directly within its own critical section (so it never serves a stale
 * self-read). Everything else — `cascadeLoad`, `deriveFilter` — goes through
 * this store. The `SyncEngine` invalidates the involved tiers when a sync
 * completes; the memory store self-invalidates its own cached marker.
 *
 * Concurrency:
 * - In-flight reads are coalesced per tier+tenant, collapsing a burst of
 *   concurrent loads into a single adapter read.
 * - An epoch counter guards against a stale write: if the tier is
 *   invalidated while a read is in flight, that read's result is discarded
 *   instead of populating the cache.
 */
export class MarkerStore {
  private readonly cache = new Map<string, AllIndexes>();
  private readonly inflight = new Map<string, Promise<AllIndexes>>();
  private readonly epoch = new Map<string, number>();

  constructor(private readonly options: ResolvedStrataOptions) {}

  /**
   * Return the cached indexes for a tier, loading them through the adapter on
   * a miss. Concurrent callers for the same tier+tenant share one read.
   */
  async getIndexes(
    tier: MarkerTier,
    adapter: DataAdapter,
    tenant: Tenant | undefined,
  ): Promise<AllIndexes> {
    const key = this.cacheKey(tier, tenant);

    const cached = this.cache.get(key);
    if (cached) return cached;

    const existing = this.inflight.get(key);
    if (existing) return existing;

    const startEpoch = this.epoch.get(key) ?? 0;
    const work = (async () => {
      try {
        const indexes = await loadAllIndexes(adapter, tenant, this.options);
        // Only populate the cache if no invalidation happened meanwhile.
        if ((this.epoch.get(key) ?? 0) === startEpoch) {
          this.cache.set(key, indexes);
        }
        return indexes;
      } finally {
        if (this.inflight.get(key) === work) this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, work);
    return work;
  }

  /**
   * Drop the cached indexes for a tier so the next read recomputes them.
   * Bumps the epoch so any in-flight read started before this call discards
   * its result instead of repopulating the cache.
   */
  invalidate(tier: MarkerTier, tenant: Tenant | undefined): void {
    const key = this.cacheKey(tier, tenant);
    this.cache.delete(key);
    this.epoch.set(key, (this.epoch.get(key) ?? 0) + 1);
    log.sync('marker cache invalidated: %s', key);
  }

  /** Clear all cached markers (e.g. on engine dispose). */
  clear(): void {
    this.cache.clear();
    this.inflight.clear();
    this.epoch.clear();
  }

  private cacheKey(tier: MarkerTier, tenant: Tenant | undefined): string {
    return `${tier}:${tenant?.id ?? ''}`;
  }
}
