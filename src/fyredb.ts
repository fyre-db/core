import type { Observable, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { createHlc } from '@/hlc';
import type { Hlc } from '@/hlc';
import type { StorageAdapter, EncryptionService } from '@/adapter';
import {
  NOOP_ENCRYPTION_SERVICE,
} from '@/adapter';
import type { Tenant } from '@/adapter';
import type { EntityDefinition } from '@/schema';
import type { BlobMigration } from '@/schema/migration';
import { validateMigrations } from '@/schema/migration';
import { EventBus } from '@/reactive';
import type { EntityEvent } from '@/reactive';
import { FyreDbError } from '@/errors';
import { FyreDbConfigError } from '@/errors';
import { EncryptedDataAdapter } from '@/persistence';
import { Store } from '@/store';
import { Repository, SingletonRepository } from '@/repo';
import type { RepositoryType, SingletonRepositoryType } from '@/repo';
import { TenantManager, TenantContext } from '@/tenant';
import type { TenantManagerType } from '@/tenant';
import {
  SyncEngine,
} from '@/sync';
import type {
  SyncEvent,
  SyncEngineType,
} from '@/sync';
import { assertNotDisposed, ReactiveFlag } from '@/utils';
import { log } from '@/log';

// ─── Types ───────────────────────────────────────────────

export type { FyreDbOptions, ResolvedFyreDbOptions } from './options';
export { resolveOptions } from './options';
import { resolveOptions } from './options';
import type { FyreDbOptions } from './options';

export type FyreDbConfig = {
  readonly appId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly entities: ReadonlyArray<EntityDefinition<any>>;
  readonly localAdapter: StorageAdapter;
  readonly cloudAdapter?: StorageAdapter;
  readonly deviceId: string;
  readonly migrations?: ReadonlyArray<BlobMigration>;
  readonly encryptionService?: EncryptionService;
  readonly options?: FyreDbOptions;
};

// ─── Validation ──────────────────────────────────────────

export function validateEntityDefinitions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities: ReadonlyArray<EntityDefinition<any>>,
): void {
  if (entities.length === 0) {
    throw new FyreDbConfigError('At least one entity definition is required');
  }
  const names = new Set<string>();
  for (const def of entities) {
    if (!def.name) {
      throw new FyreDbConfigError('Entity definition must have a name');
    }
    if (names.has(def.name)) {
      throw new FyreDbConfigError(`Duplicate entity name: ${def.name}`);
    }
    names.add(def.name);
  }
}

// ─── Class ───────────────────────────────────────────────

export class FyreDb {
  readonly tenants: TenantManagerType;

  private readonly hlcRef: { current: Hlc };
  private readonly eventBus: EventBus<EntityEvent>;
  private readonly syncEventBus: EventBus<SyncEvent>;
  private readonly errorBus: EventBus<FyreDbError>;
  private readonly syncEngine: SyncEngineType;
  private readonly dirtyTracker: ReactiveFlag;
  private readonly tenantContext: TenantContext;
   
  private readonly repoMap = new Map<string, RepositoryType<unknown> | SingletonRepositoryType<unknown>>();
  private readonly dirtySubscription: Subscription;
  private readonly errorSubscription: Subscription;

  private disposed = false;
  private disposePromise: Promise<void> | null = null;

  constructor(config: FyreDbConfig) {
    validateEntityDefinitions(config.entities);
    if (config.migrations) validateMigrations(config.migrations);
    const resolvedOptions = resolveOptions(config.options);
    const encryptionService = config.encryptionService ?? NOOP_ENCRYPTION_SERVICE;

    const store = new Store(resolvedOptions);
    this.tenantContext = new TenantContext();

    // Create encrypted DataAdapters — read keys from tenantContext
    const localAdapter = new EncryptedDataAdapter(config.localAdapter, encryptionService, this.tenantContext);
    const cloudAdapter = config.cloudAdapter
      ? new EncryptedDataAdapter(config.cloudAdapter, encryptionService, this.tenantContext)
      : undefined;

    this.hlcRef = { current: createHlc(config.deviceId) };
    this.eventBus = new EventBus<EntityEvent>();
    this.syncEventBus = new EventBus<SyncEvent>();
    this.errorBus = new EventBus<FyreDbError>();
    this.syncEngine = new SyncEngine(
      store, localAdapter, cloudAdapter,
      config.entities.map(d => d.name), this.hlcRef, this.eventBus, this.syncEventBus,
      resolvedOptions, config.migrations,
    );
    this.dirtyTracker = new ReactiveFlag();

    const ensurePartition = (entityName: string, partitionKey: string) =>
      this.syncEngine.ensurePartition(this.tenantContext.activeTenant, entityName, partitionKey);

    for (const def of config.entities) {
      if (def.keyStrategy.kind === 'singleton') {
        this.repoMap.set(def.name, new SingletonRepository(def, store, this.hlcRef, this.eventBus, ensurePartition));
      } else {
        this.repoMap.set(def.name, new Repository(def, store, this.hlcRef, this.eventBus, ensurePartition));
      }
    }

    this.tenants = new TenantManager({
      adapter: localAdapter,
      rawAdapter: config.localAdapter,
      cloudAdapter,
      syncEngine: this.syncEngine,
      syncEventBus: this.syncEventBus,
      store,
      dirtyTracker: this.dirtyTracker,
      encryptionService,
      tenantContext: this.tenantContext,
      options: resolvedOptions,
      appId: config.appId,
      entityTypes: config.entities.map(d => d.name),
      rawCloudAdapter: config.cloudAdapter,
    });

    // `isDirty` means "changes not yet in the cloud". Without a cloud adapter,
    // the periodic memory→local flush is the durable save, so there is nothing
    // to be pending against — never set the flag in local-only mode.
    const hasCloud = cloudAdapter !== undefined;
    this.dirtySubscription = this.eventBus.all$.pipe(
      filter(e => e.source !== 'sync'),
    ).subscribe(() => { if (hasCloud) this.dirtyTracker.set(); });

    // Re-emit sync errors that are FyreDbErrors onto the errorBus so consumers
    // get a single channel for all data-op errors regardless of source.
    this.errorSubscription = this.syncEventBus.all$.subscribe((evt: SyncEvent) => {
      if (evt.type === 'sync-failed' && evt.error instanceof FyreDbError) {
        this.errorBus.emit(evt.error);
      }
    });
  }

  repo<T>(def: EntityDefinition<T, 'singleton'>): SingletonRepositoryType<T>;
  repo<T>(def: EntityDefinition<T, 'global' | 'partitioned'>): RepositoryType<T>;
  repo<T>(def: EntityDefinition<T>): RepositoryType<T> | SingletonRepositoryType<T>;
  repo<T>(def: EntityDefinition<T>): RepositoryType<T> | SingletonRepositoryType<T> {
    assertNotDisposed(this.disposed, 'FyreDb instance');
    const r = this.repoMap.get(def.name);
    if (!r) throw new FyreDbConfigError(`Unknown entity definition: ${def.name}`);
    return r as RepositoryType<T> | SingletonRepositoryType<T>;
  }

  get isDirty(): boolean { return this.dirtyTracker.value; }

  observe(channel: 'entity', entityName?: string): Observable<EntityEvent>;
  observe(channel: 'sync'): Observable<SyncEvent>;
  observe(channel: 'dirty'): Observable<boolean>;
  observe(channel: 'tenant'): Observable<Tenant | undefined>;
  observe(channel: 'error'): Observable<FyreDbError>;
  observe(channel: 'entity' | 'sync' | 'dirty' | 'tenant' | 'error', entityName?: string): Observable<unknown> {
    assertNotDisposed(this.disposed, 'FyreDb instance');
    switch (channel) {
      case 'entity':
        return entityName
          ? this.eventBus.all$.pipe(filter((e: EntityEvent) => e.entityName === entityName))
          : this.eventBus.all$;
      case 'sync':
        return this.syncEventBus.all$;
      case 'dirty':
        return this.dirtyTracker.value$;
      case 'tenant':
        return this.tenantContext.activeTenant$;
      case 'error':
        return this.errorBus.all$;
    }
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    this.disposePromise = (async () => {
      await this.tenants.close();
      for (const r of this.repoMap.values()) r.dispose();
      this.dirtySubscription.unsubscribe();
      this.errorSubscription.unsubscribe();
      this.eventBus.dispose();
      this.syncEventBus.dispose();
      this.errorBus.dispose();
      await this.syncEngine.dispose();
      log.fyredb('disposed');
    })();
    return this.disposePromise;
  }
}

