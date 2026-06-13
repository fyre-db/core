import type { Hlc } from '@/hlc';
import type { DataAdapter } from '@/persistence';

export type EntityStore = DataAdapter & {
  getEntity(entityKey: string, id: string): unknown;
  setEntity(entityKey: string, id: string, entity: unknown): void;
  deleteEntity(entityKey: string, id: string): boolean;
  hasPartition(entityKey: string): boolean;
  getPartition(entityKey: string): ReadonlyMap<string, unknown>;
  getAllPartitionKeys(entityName: string): ReadonlyArray<string>;
  getDirtyKeys(): ReadonlySet<string>;
  clearDirty(entityKey: string): void;
  loadPartition(
    entityKey: string,
    loader: () => Promise<Map<string, unknown>>,
  ): Promise<ReadonlyMap<string, unknown>>;
  setTombstone(entityKey: string, entityId: string, hlc: Hlc): void;
  getTombstones(entityKey: string): ReadonlyMap<string, Hlc>;
  clear(): void;
};
