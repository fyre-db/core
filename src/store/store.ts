import type { Hlc } from '@/hlc';
import type { Tenant } from '@/adapter';
import type { PartitionBlob } from '@/persistence';
import { partitionHash } from '@/persistence';
import { parseCompositeKey } from '@/utils';
import type { ResolvedStrataOptions } from '../options';
import type { EntityStore } from './types';

export class Store implements EntityStore {
  private readonly partitions = new Map<string, Map<string, unknown>>();
  private readonly tombstones = new Map<string, Map<string, Hlc>>();
  private readonly dirtyKeys = new Set<string>();
  private readonly markerKey: string;
  private readonly tombstoneRetentionMs: number;
  private readonly systemEntityKey: string;
  private cachedMarkerBlob: PartitionBlob | null = null;

  constructor(options: ResolvedStrataOptions) {
    this.markerKey = options.markerKey;
    this.tombstoneRetentionMs = options.tombstoneRetentionMs;
    this.systemEntityKey = options.systemEntityKey;
  }

  getEntity(entityKey: string, id: string): unknown {
    return this.partitions.get(entityKey)?.get(id);
  }

  setEntity(entityKey: string, id: string, entity: unknown): void {
    let partition = this.partitions.get(entityKey);
    if (!partition) {
      partition = new Map();
      this.partitions.set(entityKey, partition);
    }
    partition.set(id, entity);
    this.tombstones.get(entityKey)?.delete(id);
    this.dirtyKeys.add(entityKey);
    this.cachedMarkerBlob = null;
  }

  deleteEntity(entityKey: string, id: string): boolean {
    const partition = this.partitions.get(entityKey);
    if (!partition) return false;
    const deleted = partition.delete(id);
    if (deleted) {
      this.dirtyKeys.add(entityKey);
      this.cachedMarkerBlob = null;
    }
    return deleted;
  }

  hasPartition(entityKey: string): boolean {
    return this.partitions.has(entityKey);
  }

  getPartition(entityKey: string): ReadonlyMap<string, unknown> {
    return this.partitions.get(entityKey) ?? new Map<string, unknown>();
  }

  getAllPartitionKeys(entityName: string): ReadonlyArray<string> {
    const prefix = `${entityName}.`;
    const keys = new Set<string>();
    for (const key of this.partitions.keys()) {
      if (key.startsWith(prefix)) keys.add(key);
    }
    for (const key of this.tombstones.keys()) {
      if (key.startsWith(prefix)) keys.add(key);
    }
    return [...keys];
  }

  getDirtyKeys(): ReadonlySet<string> {
    return this.dirtyKeys;
  }

  clearDirty(entityKey: string): void {
    this.dirtyKeys.delete(entityKey);
  }

  async loadPartition(
    entityKey: string,
    loader: () => Promise<Map<string, unknown>>,
  ): Promise<ReadonlyMap<string, unknown>> {
    let partition = this.partitions.get(entityKey);
    if (!partition) {
      partition = await loader();
      this.partitions.set(entityKey, partition);
    }
    return partition;
  }

  setTombstone(entityKey: string, entityId: string, hlc: Hlc): void {
    let partition = this.tombstones.get(entityKey);
    if (!partition) {
      partition = new Map();
      this.tombstones.set(entityKey, partition);
    }
    partition.set(entityId, hlc);
    this.dirtyKeys.add(entityKey);
    this.cachedMarkerBlob = null;
  }

  getTombstones(entityKey: string): ReadonlyMap<string, Hlc> {
    return this.tombstones.get(entityKey) ?? new Map<string, Hlc>();
  }

  clear(): void {
    this.partitions.clear();
    this.tombstones.clear();
    this.dirtyKeys.clear();
    this.cachedMarkerBlob = null;
  }

  // ─── StorageAdapter interface ─────────────────────────────

  read(_tenant: Tenant | undefined, key: string): Promise<PartitionBlob | null> {
    if (key === this.markerKey) {
      if (!this.cachedMarkerBlob) {
        this.cachedMarkerBlob = this.buildMarkerBlob();
      }
      return Promise.resolve(this.cachedMarkerBlob);
    }
    const parsed = parseCompositeKey(key);
    if (!parsed) return Promise.resolve(null);
    const entityName = parsed.entityName;
    const partition = this.getPartition(key);
    if (partition.size === 0 && this.getTombstones(key).size === 0) {
      return Promise.resolve(null);
    }
    const entities: Record<string, unknown> = {};
    for (const [id, entity] of partition) {
      entities[id] = entity;
    }
    const tombstoneEntries: Record<string, Hlc> = {};
    const cutoff = Date.now() - this.tombstoneRetentionMs;
    for (const [id, hlc] of this.getTombstones(key)) {
      if (hlc.timestamp >= cutoff) {
        tombstoneEntries[id] = hlc;
      }
    }
    return Promise.resolve({
      [entityName]: entities,
      deleted: { [entityName]: tombstoneEntries },
    });
  }

  // write() intentionally does not mark dirty — it's used by sync to import
  // remote data into memory. Only user mutations via setEntity/deleteEntity
  // should trigger dirty tracking and subsequent sync cycles.
  write(_tenant: Tenant | undefined, key: string, data: PartitionBlob): Promise<void> {
    if (key === this.markerKey) {
      return Promise.resolve(); // marker is always computed from live state
    }
    this.cachedMarkerBlob = null;
    const parsed = parseCompositeKey(key);
    if (!parsed) return Promise.resolve();
    const entityName = parsed.entityName;
    const entities =
      (data[entityName] as Record<string, unknown> | undefined) ?? {};
    const deletedSection = data['deleted'] as Record<string, Record<string, Hlc>> | undefined;
    const tombstoneData = deletedSection?.[entityName] ?? {};

    const partition = new Map<string, unknown>();
    for (const [id, entity] of Object.entries(entities)) {
      partition.set(id, entity);
    }
    this.partitions.set(key, partition);

    const tombstoneMap = new Map<string, Hlc>();
    for (const [id, hlc] of Object.entries(tombstoneData)) {
      tombstoneMap.set(id, hlc);
    }
    this.tombstones.set(key, tombstoneMap);
    return Promise.resolve();
  }

  delete(_tenant: Tenant | undefined, key: string): Promise<boolean> {
    const had = this.partitions.has(key) || this.tombstones.has(key);
    this.partitions.delete(key);
    this.tombstones.delete(key);
    return Promise.resolve(had);
  }

  private buildMarkerBlob(): PartitionBlob {
    const indexes: Record<string, Record<string, { hash: number; count: number; deletedCount: number; updatedAt: number }>> = {};
    for (const entityKey of this.partitions.keys()) {
      const parsed = parseCompositeKey(entityKey);
      if (!parsed) continue;
      const entityName = parsed.entityName;
      const partitionKey = parsed.rest;

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!indexes[entityName]) indexes[entityName] = {};

      const partition = this.getPartition(entityKey);
      const tombstoneMap = this.getTombstones(entityKey);
      const hlcMap = new Map<string, Hlc>();
      for (const [id, entity] of partition) {
        const hlc = (entity as { hlc?: Hlc }).hlc;
        if (hlc) hlcMap.set(id, hlc);
      }
      for (const [id, hlc] of tombstoneMap) {
        hlcMap.set(`\0${id}`, hlc);
      }

      indexes[entityName][partitionKey] = {
        hash: partitionHash(hlcMap),
        count: partition.size,
        deletedCount: tombstoneMap.size,
        updatedAt: Date.now(),
      };
    }

    return {
      [this.systemEntityKey]: {
        marker: {
          version: 1,
          createdAt: new Date(),
          entityTypes: [],
          indexes,
        },
      },
      deleted: {},
    };
  }
}

