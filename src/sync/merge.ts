import type { Hlc } from '@/hlc';
import { compareHlc } from '@/hlc';
import type { PartitionBlob } from '@/persistence';
import type { EntityDiffResult, MergeResult, SyncEntity } from './types';
import { resolveConflict, resolveEntityTombstone } from './conflict';

export function diffEntityMaps(
  localEntities: Readonly<Record<string, unknown>>,
  localTombstones: Readonly<Record<string, unknown>>,
  cloudEntities: Readonly<Record<string, unknown>>,
  cloudTombstones: Readonly<Record<string, unknown>>,
): EntityDiffResult {
  const localOnly: string[] = [];
  const cloudOnly: string[] = [];
  const both: string[] = [];

  const allIds = new Set([
    ...Object.keys(localEntities),
    ...Object.keys(localTombstones),
    ...Object.keys(cloudEntities),
    ...Object.keys(cloudTombstones),
  ]);

  for (const id of allIds) {
    const inLocal = id in localEntities || id in localTombstones;
    const inCloud = id in cloudEntities || id in cloudTombstones;

    if (inLocal && inCloud) {
      both.push(id);
    } else if (inLocal) {
      localOnly.push(id);
    } else {
      cloudOnly.push(id);
    }
  }

  return { localOnly, cloudOnly, both };
}

function resolveBothEntry(
  localEntity: SyncEntity | undefined,
  cloudEntity: SyncEntity | undefined,
  localTombstone: Hlc | undefined,
  cloudTombstone: Hlc | undefined,
): { entity?: unknown; tombstone?: Hlc } {
  if (localEntity && cloudEntity) {
    return { entity: resolveConflict(localEntity, cloudEntity) };
  }
  if (localEntity && cloudTombstone) {
    const winner = resolveEntityTombstone(localEntity.hlc, cloudTombstone);
    return winner === 'entity'
      ? { entity: localEntity }
      : { tombstone: cloudTombstone };
  }
  if (cloudEntity && localTombstone) {
    const winner = resolveEntityTombstone(cloudEntity.hlc, localTombstone);
    return winner === 'entity'
      ? { entity: cloudEntity }
      : { tombstone: localTombstone };
  }
  if (localTombstone && cloudTombstone) {
    const cmp = compareHlc(localTombstone, cloudTombstone);
    return { tombstone: cmp >= 0 ? localTombstone : cloudTombstone };
  }
  return {};
}

export function mergePartition(
  localBlob: PartitionBlob,
  cloudBlob: PartitionBlob,
  entityName: string,
): MergeResult {
  const localEntities =
    (localBlob[entityName] as Record<string, unknown> | undefined) ?? {};
  const cloudEntities =
    (cloudBlob[entityName] as Record<string, unknown> | undefined) ?? {};

  const localTombstones = localBlob.deleted[entityName] ?? {};
  const cloudTombstones = cloudBlob.deleted[entityName] ?? {};

  const diff = diffEntityMaps(
    localEntities, localTombstones, cloudEntities, cloudTombstones,
  );

  const mergedEntities: Record<string, unknown> = {};
  const mergedTombstones: Record<string, Hlc> = {};

  for (const id of diff.localOnly) {
    if (id in localEntities) mergedEntities[id] = localEntities[id];
    if (id in localTombstones) mergedTombstones[id] = localTombstones[id];
  }

  for (const id of diff.cloudOnly) {
    if (id in cloudEntities) mergedEntities[id] = cloudEntities[id];
    if (id in cloudTombstones) mergedTombstones[id] = cloudTombstones[id];
  }

  for (const id of diff.both) {
    // Type assertions needed: entities from deserialized blobs have hlc fields
    const result = resolveBothEntry(
      localEntities[id] as SyncEntity | undefined,
      cloudEntities[id] as SyncEntity | undefined,
      localTombstones[id],
      cloudTombstones[id],
    );
    if (result.entity) mergedEntities[id] = result.entity;
    if (result.tombstone) mergedTombstones[id] = result.tombstone;
  }

  return { entities: mergedEntities, tombstones: mergedTombstones };
}
