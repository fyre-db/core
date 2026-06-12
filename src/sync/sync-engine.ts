import type { Tenant } from '@/adapter';
import { partitionBlobKey } from '@/adapter';
import type { Hlc } from '@/hlc';
import { tick } from '@/hlc';
import type { EventBus } from '@/reactive';
import type { EntityEvent } from '@/reactive';
import type { EntityStore } from '@/store';
import type { BlobMigration } from '@/schema/migration';
import type { DataAdapter } from '@/persistence';
import { parseCompositeKey } from '@/utils';
import type { ReactiveFlag } from '@/utils';
import type { ResolvedFyreDbOptions } from '../options';
import { SyncError } from './errors';
import { FyreDbError } from '@/errors';
import type {
  SyncLocation, SyncQueueItem, SyncEvent,
  SyncEnqueueResult, SyncBetweenResult,
  SyncEntityChange,
} from './types';
import { syncBetween } from './unified';
import type { PartitionFilter } from './unified';
import { MarkerStore } from './marker-store';
import { log } from '@/log';

export class SyncEngine {
  private readonly queue: SyncQueueItem[] = [];
  private running = false;
  private disposed = false;
  private inFlight: Promise<void> | null = null;
  private readonly inFlightPartitions = new Map<string, Promise<void>>();
  private readonly markerStore: MarkerStore;

  constructor(
    private readonly store: EntityStore,
    private readonly localAdapter: DataAdapter,
    private readonly cloudAdapter: DataAdapter | undefined,
    private readonly entityNames: ReadonlyArray<string>,
    private readonly hlcRef: { current: Hlc },
    private readonly entityEventBus: EventBus<EntityEvent>,
    private readonly syncEventBus: EventBus<SyncEvent>,
    private readonly options: ResolvedFyreDbOptions,
    private readonly migrations?: ReadonlyArray<BlobMigration>,
  ) {
    this.markerStore = new MarkerStore(this.options);
  }

  private resolveAdapter(loc: SyncLocation): DataAdapter {
    switch (loc) {
      case 'memory': return this.store;
      case 'local': return this.localAdapter;
      case 'cloud':
        if (!this.cloudAdapter) throw new SyncError('No cloud adapter configured', { kind: 'cloud-not-configured' });
        return this.cloudAdapter;
    }
  }

  async sync(
    source: SyncLocation,
    target: SyncLocation,
    tenant: Tenant | undefined,
  ): Promise<SyncEnqueueResult> {
    if (this.disposed) {
      throw new SyncError('SyncEngine is disposed', { kind: 'sync-failed' });
    }

    const existing = this.queue.find(
      item => item.source === source && item.target === target,
    );
    if (existing) {
      log.sync('dedup: %s→%s already queued', source, target);
      await existing.promise;
      return { result: EMPTY_RESULT, deduplicated: true };
    }

    let syncResult: SyncBetweenResult = EMPTY_RESULT;

    let resolve!: () => void;
    let reject!: (err: Error) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const fn = async () => {
      const sourceAdapter = this.resolveAdapter(source);
      const targetAdapter = this.resolveAdapter(target);
      const partitionFilter = await this.deriveFilter(source, target, tenant);
      this.syncEventBus.emit({ type: 'sync-started', source, target });
      try {
        syncResult = await syncBetween(
          sourceAdapter, targetAdapter, this.entityNames, tenant,
          this.options, this.migrations, partitionFilter,
        );

        // unified just rewrote the marker for any persistent tier it touched;
        // drop the cached indexes so the next read recomputes them.
        this.invalidateMarkers(source, target, tenant);

        if (syncResult.maxHlc) {
          this.hlcRef.current = tick(this.hlcRef.current, syncResult.maxHlc);
        }

        const storeChanges = source === 'memory'
          ? syncResult.changesForA
          : target === 'memory' ? syncResult.changesForB : [];
        this.emitEntityChanges(storeChanges);

        this.syncEventBus.emit({
          type: 'sync-completed', source, target,
          result: {
            entitiesUpdated: syncResult.changesForB.length,
            conflictsResolved: syncResult.changesForA.length,
            partitionsSynced: syncResult.changesForA.length + syncResult.changesForB.length,
          },
        });
        log.sync('%s→%s sync complete', source, target);
      } catch (err) {
        const error = err instanceof Error ? err : new FyreDbError(String(err), { kind: 'unknown' });
        this.syncEventBus.emit({ type: 'sync-failed', source, target, error });
        throw err;
      }
    };

    this.queue.push({ source, target, fn, promise, resolve, reject });
    void this.processQueue();

    await promise;
    return { result: syncResult, deduplicated: false };
  }

  private async processQueue(): Promise<void> {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      if (this.disposed) break;
      const item = this.queue[0];
      const p = item.fn().then(
        () => { item.resolve(); },
        (err: unknown) => { item.reject(err instanceof Error ? err : new FyreDbError(String(err), { kind: 'unknown' })); },
      );
      this.inFlight = p;
      await p;
      this.inFlight = null;
      this.queue.shift();
    }

    this.running = false;
  }

  async drain(): Promise<void> {
    while (this.queue.length > 0 || this.running) {
      await this.queue[this.queue.length - 1]?.promise.catch(() => {});
      if (this.running && this.queue.length === 0) {
        await new Promise<void>(r => setTimeout(r, 0));
      }
    }
  }

  // ── Pipeline ───────────────────────────────────────────

  async run(
    tenant: Tenant | undefined,
    steps: ReadonlyArray<[SyncLocation, SyncLocation]>,
  ): Promise<SyncBetweenResult[]> {
    const results: SyncBetweenResult[] = [];
    for (const [source, target] of steps) {
      const { result } = await this.sync(source, target, tenant);
      results.push(result);
    }
    return results;
  }

  // ── Scheduler ──────────────────────────────────────────

  private localTimer: ReturnType<typeof setInterval> | null = null;
  private cloudTimer: ReturnType<typeof setInterval> | null = null;

  startScheduler(
    tenant: Tenant | undefined,
    hasCloud: boolean,
    dirtyTracker?: ReactiveFlag,
  ): void {
    if (this.disposed) {
      throw new SyncError('SyncEngine is disposed', { kind: 'sync-failed' });
    }
    this.stopScheduler();

    this.localTimer = setInterval(() => {
      this.sync('memory', 'local', tenant).catch((err: unknown) => {
        log.sync.error('local flush failed: %O', err);
      });
    }, this.options.localFlushIntervalMs);

    if (hasCloud) {
      this.cloudTimer = setInterval(() => {
        void (async () => {
          try {
            await this.sync('local', 'cloud', tenant);
            await this.sync('local', 'memory', tenant);
            dirtyTracker?.clear();
          } catch (err) {
            log.sync.error('cloud sync failed: %O', err);
          }
        })();
      }, this.options.cloudSyncIntervalMs);
    }

    log.sync('scheduler started (local=%dms, cloud=%dms)',
      this.options.localFlushIntervalMs,
      this.options.cloudSyncIntervalMs,
    );
  }

  stopScheduler(): void {
    if (this.localTimer !== null) {
      clearInterval(this.localTimer);
      this.localTimer = null;
    }
    if (this.cloudTimer !== null) {
      clearInterval(this.cloudTimer);
      this.cloudTimer = null;
    }
  }

  // ── Lazy hydration ─────────────────────────────────────

  async ensurePartition(
    tenant: Tenant | undefined,
    entityName: string,
    partitionKey: string,
  ): Promise<void> {
    const entityKey = partitionBlobKey(entityName, partitionKey);
    if (this.store.hasPartition(entityKey)) return;

    const existing = this.inFlightPartitions.get(entityKey);
    if (existing) { await existing; return; }

    const work = this.cascadeLoad(tenant, entityName, partitionKey, entityKey);
    this.inFlightPartitions.set(entityKey, work);
    try { await work; } finally { this.inFlightPartitions.delete(entityKey); }
  }

  private async cascadeLoad(
    tenant: Tenant | undefined,
    entityName: string,
    partitionKey: string,
    entityKey: string,
  ): Promise<void> {
    // Try local first
    const localIndexes = await this.markerStore.getIndexes('local', this.localAdapter, tenant);
    if (localIndexes[entityName]?.[partitionKey]) {
      const blob = await this.localAdapter.read(tenant, entityKey);
      if (blob) {
        await this.store.write(tenant, entityKey, blob);
        this.emitEntityChangesFromBlob(entityName, blob);
        log.sync('lazy-loaded %s from local', entityKey);
        return;
      }
    }

    // Try cloud
    if (this.cloudAdapter) {
      try {
        const cloudIndexes = await this.markerStore.getIndexes('cloud', this.cloudAdapter, tenant);
        if (cloudIndexes[entityName]?.[partitionKey]) {
          const blob = await this.cloudAdapter.read(tenant, entityKey);
          if (blob) {
            await this.localAdapter.write(tenant, entityKey, blob);
            await this.store.write(tenant, entityKey, blob);
            this.emitEntityChangesFromBlob(entityName, blob);
            log.sync('lazy-loaded %s from cloud', entityKey);
            return;
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err : new FyreDbError(String(err), { kind: 'unknown' });
        this.syncEventBus.emit({ type: 'sync-failed', source: 'local', target: 'cloud', error });
        log.sync.error('lazy-load %s from cloud failed: %O', entityKey, err);
      }
    }

    log.sync('lazy-load %s: not found in any tier', entityKey);
  }

  private emitEntityChangesFromBlob(
    entityName: string,
    blob: Record<string, unknown>,
  ): void {
    const entities = (blob[entityName] as Record<string, unknown> | undefined) ?? {};
    const deletedSection = blob['deleted'] as Record<string, Record<string, unknown>> | undefined;
    const tombstones = deletedSection?.[entityName] ?? {};
    this.entityEventBus.emit({
      entityName,
      source: 'sync',
      updates: Object.keys(entities),
      deletes: Object.keys(tombstones),
    });
  }

  private async deriveFilter(
    source: SyncLocation,
    target: SyncLocation,
    tenant: Tenant | undefined,
  ): Promise<PartitionFilter | undefined> {
    const memoryInvolved = source === 'memory' || target === 'memory';
    const cloudInvolved = source === 'cloud' || target === 'cloud';

    if (memoryInvolved) {
      return (entityName, partitionKey) =>
        this.store.hasPartition(partitionBlobKey(entityName, partitionKey));
    }
    if (cloudInvolved) {
      const localIndexes = await this.markerStore.getIndexes('local', this.localAdapter, tenant);
      return (entityName, partitionKey) =>
        !!(localIndexes[entityName]?.[partitionKey]);
    }
    return undefined;
  }

  /** Invalidate cached markers for the persistent tiers a sync just wrote. */
  private invalidateMarkers(
    source: SyncLocation,
    target: SyncLocation,
    tenant: Tenant | undefined,
  ): void {
    for (const loc of new Set<SyncLocation>([source, target])) {
      if (loc === 'local' || loc === 'cloud') {
        this.markerStore.invalidate(loc, tenant);
      }
    }
  }

  async dispose(): Promise<void> {
    this.stopScheduler();
    this.disposed = true;
    this.markerStore.clear();
    for (const item of this.queue) {
      item.reject(new SyncError('SyncEngine disposed', { kind: 'sync-failed' }));
    }
    this.queue.length = 0;
    if (this.inFlight) {
      await this.inFlight.catch(() => {});
    }
  }

  private emitEntityChanges(changes: ReadonlyArray<SyncEntityChange>): void {
    const byEntity = new Map<string, { updates: string[]; deletes: string[] }>();
    for (const c of changes) {
      const parsed = parseCompositeKey(c.key);
      if (!parsed) continue;
      let entry = byEntity.get(parsed.entityName);
      if (!entry) {
        entry = { updates: [], deletes: [] };
        byEntity.set(parsed.entityName, entry);
      }
      entry.updates.push(...c.updatedIds);
      entry.deletes.push(...c.deletedIds);
    }
    for (const [entityName, { updates, deletes }] of byEntity) {
      this.entityEventBus.emit({ entityName, source: 'sync', updates, deletes });
    }
  }
}

const EMPTY_RESULT: SyncBetweenResult = {
  changesForA: [],
  changesForB: [],
  stale: false,
  maxHlc: undefined,
};
