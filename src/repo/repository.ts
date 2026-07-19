import { startWith, map, distinctUntilChanged } from 'rxjs/operators';
import type { Hlc } from '@/hlc';
import { tick, compareHlc } from '@/hlc';
import type { EntityDefinition, BaseEntity } from '@/schema';
import { formatEntityId } from '@/schema';
import { generateId, parseEntityKey, parseCompositeKey } from '@/utils';
import type { EventBus } from '@/reactive';
import type { EntityEvent } from '@/reactive';
import { filter } from 'rxjs/operators';
import type { EntityStore } from '@/store';
import { FyreDbConfigError } from '@/errors';
import type { QueryOptions } from './types';
import { applyWhere, applyRange, applyOrderBy, applyPagination } from './query';
import { assertNotDisposed } from '@/utils';
import { log } from '@/log';

function entityComparator<T extends BaseEntity>(
  a: (T & BaseEntity) | undefined,
  b: (T & BaseEntity) | undefined,
): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return a.id === b.id && a.version === b.version;
}

function resultsChanged<T extends BaseEntity>(
  prev: ReadonlyArray<T>,
  next: ReadonlyArray<T>,
): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].id !== next[i].id || prev[i].version !== next[i].version) return true;
  }
  return false;
}

export class Repository<T> {
  private disposed = false;

  constructor(
    private readonly definition: EntityDefinition<T>,
    private readonly store: EntityStore,
    private readonly hlc: { current: Hlc },
    private readonly eventBus: EventBus<EntityEvent>,
    private readonly ensurePartition?: (entityName: string, partitionKey: string) => Promise<void>,
  ) {}

  get(id: string): (T & BaseEntity) | undefined {
    const entityKey = parseEntityKey(id);
    this.triggerEnsureById(entityKey);
    return this.store.getEntity(entityKey, id) as (T & BaseEntity) | undefined;
  }

  /**
   * Mint the next HLC for a mutation of `id`, causally after **every** clock
   * already recorded for that key: the device clock, the id's current entity
   * hlc, and any live tombstone hlc for the id. Ticking only against
   * `this.hlc.current` is unsafe — after a reload the device clock restarts at
   * `{timestamp:0}` and only catches up on the next sync, so a save/delete
   * could otherwise mint an hlc that is not strictly newer than a value or
   * tombstone already in the store and lose the subsequent merge (e.g. a
   * reconnect being re-deleted by its own stale tombstone). Advances
   * `this.hlc.current` to the minted value.
   */
  private nextHlc(
    entityKey: string,
    id: string,
    existing: (T & BaseEntity) | undefined,
  ): Hlc {
    let reference: Hlc | undefined = existing?.hlc;
    const tombstone = this.store.getTombstones(entityKey).get(id);
    if (tombstone && (!reference || compareHlc(tombstone, reference) > 0)) {
      reference = tombstone;
    }
    const next = tick(this.hlc.current, reference);
    this.hlc.current = next;
    return next;
  }

  private saveToStore(partial: T & Partial<BaseEntity>): string {
    let id: string;
    let entityKey: string;

    if (partial.id) {
      if (!partial.id.startsWith(this.definition.name + '.')) {
        throw new FyreDbConfigError(`Entity ID "${partial.id}" does not belong to repository "${this.definition.name}"`);
      }
      id = partial.id;
      entityKey = parseEntityKey(id);
    } else {
      const uniqueId = this.definition.deriveId
        ? this.definition.deriveId(partial)
        : generateId();
      const partitionKey = this.definition.keyStrategy.partitionFn(partial);
      id = formatEntityId(this.definition.name, partitionKey, uniqueId);
      entityKey = `${this.definition.name}.${partitionKey}`;
    }

    if (id.length > 256) {
      throw new FyreDbConfigError(`Entity ID exceeds maximum length of 256 characters (got ${id.length})`);
    }

    const existing = this.store.getEntity(entityKey, id) as (T & BaseEntity) | undefined;

    const nextHlc = this.nextHlc(entityKey, id, existing);
    const now = new Date();

    const entity = {
      ...partial,
      id,
      createdAt: existing?.createdAt ?? partial.createdAt ?? now,
      updatedAt: now,
      version: (existing?.version ?? 0) + 1,
      device: nextHlc.nodeId,
      hlc: nextHlc,
    };

    this.store.setEntity(entityKey, id, entity);
    this.hlc.current = nextHlc;
    log.repo('saved %s', id);

    return id;
  }

  save(partial: T & Partial<BaseEntity>): string {
    assertNotDisposed(this.disposed, 'Repository');
    const id = this.saveToStore(partial);
    this.eventBus.emit({ entityName: this.definition.name, source: 'user', updates: [id], deletes: [] });
    return id;
  }

  saveMany(
    entities: ReadonlyArray<T & Partial<BaseEntity>>,
  ): ReadonlyArray<string> {
    assertNotDisposed(this.disposed, 'Repository');
    const ids = entities.map(entity => this.saveToStore(entity));
    if (ids.length > 0) {
      this.eventBus.emit({ entityName: this.definition.name, source: 'user', updates: [...ids], deletes: [] });
    }
    return ids;
  }

  private deleteFromStore(id: string): boolean {
    const entityKey = parseEntityKey(id);
    const entity = this.store.getEntity(entityKey, id) as (T & BaseEntity) | undefined;
    if (entity) {
      // A delete is a new operation: stamp the tombstone with a freshly ticked
      // HLC (causally after the entity's own hlc and any prior tombstone, and
      // carrying a current timestamp). Reusing `entity.hlc` would make the
      // tombstone equal to — not newer than — the value, and its stale
      // timestamp could be pruned by tombstone-retention before the delete
      // propagates, resurrecting the row.
      const nextHlc = this.nextHlc(entityKey, id, entity);
      this.store.setTombstone(entityKey, id, nextHlc);
    }
    const deleted = this.store.deleteEntity(entityKey, id);
    if (deleted) {
      log.repo('deleted %s', id);
    }
    return deleted;
  }

  delete(id: string): boolean {
    assertNotDisposed(this.disposed, 'Repository');
    const deleted = this.deleteFromStore(id);
    if (deleted) {
      this.eventBus.emit({ entityName: this.definition.name, source: 'user', updates: [], deletes: [id] });
    }
    return deleted;
  }

  deleteMany(ids: ReadonlyArray<string>): void {
    assertNotDisposed(this.disposed, 'Repository');
    const deletedIds: string[] = [];
    for (const id of ids) {
      if (this.deleteFromStore(id)) {
        deletedIds.push(id);
      }
    }
    if (deletedIds.length > 0) {
      this.eventBus.emit({ entityName: this.definition.name, source: 'user', updates: [], deletes: deletedIds });
    }
  }

  query(opts?: QueryOptions<T>): ReadonlyArray<T & BaseEntity> {
    this.triggerEnsureForQuery(opts);

    const partitionKeys = opts?.keys
      ? opts.keys.map(k => `${this.definition.name}.${k}`)
      : this.store.getAllPartitionKeys(this.definition.name);

    const collected: (T & BaseEntity)[] = [];
    for (const key of partitionKeys) {
      const partition = this.store.getPartition(key);
      for (const entity of partition.values()) {
        collected.push(entity as T & BaseEntity);
      }
    }
    let entities: ReadonlyArray<T & BaseEntity> = collected;

    if (!opts) return entities;

    if (opts.where) {
      entities = applyWhere(entities, opts.where as Partial<T & BaseEntity>);
    }
    if (opts.range) {
      entities = applyRange(entities, opts.range as {
        readonly field: keyof (T & BaseEntity);
        readonly gt?: unknown;
        readonly gte?: unknown;
        readonly lt?: unknown;
        readonly lte?: unknown;
      });
    }
    if (opts.orderBy) {
      entities = applyOrderBy(entities, opts.orderBy as ReadonlyArray<{
        readonly field: keyof (T & BaseEntity);
        readonly direction: 'asc' | 'desc';
      }>);
    }
    entities = applyPagination(entities, opts.offset, opts.limit);

    return entities;
  }

  observe(id: string) {
    assertNotDisposed(this.disposed, 'Repository');
    const entityKey = parseEntityKey(id);
    this.triggerEnsureById(entityKey);
    return this.eventBus.all$.pipe(
      filter((e: EntityEvent) => e.entityName === this.definition.name),
      startWith(undefined),
      map(() => this.get(id)),
      distinctUntilChanged(entityComparator),
    );
  }

  observeQuery(opts?: QueryOptions<T>) {
    assertNotDisposed(this.disposed, 'Repository');
    this.triggerEnsureForQuery(opts);
    return this.eventBus.all$.pipe(
      filter((e: EntityEvent) => e.entityName === this.definition.name),
      startWith(undefined),
      map(() => this.query(opts)),
      distinctUntilChanged((prev, next) => !resultsChanged(prev, next)),
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    log.repo('disposed %s repository', this.definition.name);
  }

  private triggerEnsureById(entityKey: string): void {
    if (!this.ensurePartition) return;
    const parsed = parseCompositeKey(entityKey);
    if (!parsed) return;
    void this.ensurePartition(this.definition.name, parsed.rest);
  }

  private triggerEnsureForQuery(opts?: QueryOptions<T>): void {
    if (!this.ensurePartition) return;
    if (opts?.keys) {
      for (const key of opts.keys) {
        void this.ensurePartition(this.definition.name, key);
      }
      return;
    }
    if (this.definition.keyStrategy.kind !== 'partitioned') {
      void this.ensurePartition(this.definition.name, '_');
    }
  }
}
