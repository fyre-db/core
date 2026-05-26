import type { Tenant } from '@/adapter';
import { partitionBlobKey } from '@/adapter';
import type { Hlc } from '@/hlc';
import { compareHlc } from '@/hlc';
import type { AllIndexes, PartitionBlob, PartitionIndex, PartitionIndexEntry, DataAdapter } from '@/persistence';
import { loadAllIndexes, saveAllIndexes } from '@/persistence';
import { partitionHash, updatePartitionIndexEntry } from '@/persistence';
import type { BlobMigration } from '@/schema/migration';
import { migrateBlob } from '@/schema/migration';
import type { ResolvedStrataOptions } from '../options';
import { diffPartitions } from './diff';
import { mergePartition } from './merge';
import type { SyncEntity, SyncEntityChange, SyncBetweenResult } from './types';
import { log } from '@/log';

export type PartitionFilter = (entityName: string, partitionKey: string) => boolean;

type SyncChange = {
  readonly entityName: string;
  readonly partitionKey: string;
  readonly key: string;
  readonly blob: PartitionBlob;
};

type SyncPlan = {
  readonly indexSnapshotA: AllIndexes;
  readonly applyToA: ReadonlyArray<SyncChange>;
  readonly applyToB: ReadonlyArray<SyncChange>;
};

// ─── Phase 1: Build plan ─────────────────────────────────

function filterIndex(
  index: PartitionIndex,
  entityName: string,
  partitionFilter: PartitionFilter,
): PartitionIndex {
  const filtered: PartitionIndex = {};
  for (const key of Object.keys(index)) {
    if (partitionFilter(entityName, key)) {
      filtered[key] = index[key];
    }
  }
  return filtered;
}

async function buildPlan(
  adapterA: DataAdapter,
  adapterB: DataAdapter,
  entityNames: ReadonlyArray<string>,
  tenant: Tenant | undefined,
  options: ResolvedStrataOptions,
  migrations?: ReadonlyArray<BlobMigration>,
  partitionFilter?: PartitionFilter,
): Promise<SyncPlan> {
  const [indexesA, indexesB] = await Promise.all([
    loadAllIndexes(adapterA, tenant, options),
    loadAllIndexes(adapterB, tenant, options),
  ]);

  const applyToA: SyncChange[] = [];
  const applyToB: SyncChange[] = [];

  for (const entityName of entityNames) {
    let indexA = indexesA[entityName] ?? {};
    let indexB = indexesB[entityName] ?? {};
    if (partitionFilter) {
      indexA = filterIndex(indexA, entityName, partitionFilter);
      indexB = filterIndex(indexB, entityName, partitionFilter);
    }
    const diff = diffPartitions(indexA, indexB);

    await planCopies(
      adapterA, adapterB, tenant, entityName,
      diff.localOnly, diff.cloudOnly, applyToA, applyToB, migrations,
    );
    await planMerges(
      adapterA, adapterB, tenant, entityName,
      diff.diverged, applyToA, applyToB, migrations,
    );
  }

  return { indexSnapshotA: indexesA, applyToA, applyToB };
}

async function planCopies(
  adapterA: DataAdapter,
  adapterB: DataAdapter,
  tenant: Tenant | undefined,
  entityName: string,
  aOnly: ReadonlyArray<string>,
  bOnly: ReadonlyArray<string>,
  applyToA: SyncChange[],
  applyToB: SyncChange[],
  migrations?: ReadonlyArray<BlobMigration>,
): Promise<void> {
  const reads = [
    ...aOnly.map(async (partitionKey) => {
      const key = partitionBlobKey(entityName, partitionKey);
      let blob = await adapterA.read(tenant, key);
      if (blob) {
        if (migrations) blob = migrateBlob(blob, migrations, entityName);
        applyToB.push({ entityName, partitionKey, key, blob });
      }
    }),
    ...bOnly.map(async (partitionKey) => {
      const key = partitionBlobKey(entityName, partitionKey);
      let blob = await adapterB.read(tenant, key);
      if (blob) {
        if (migrations) blob = migrateBlob(blob, migrations, entityName);
        applyToA.push({ entityName, partitionKey, key, blob });
      }
    }),
  ];
  await Promise.all(reads);
}

async function planMerges(
  adapterA: DataAdapter,
  adapterB: DataAdapter,
  tenant: Tenant | undefined,
  entityName: string,
  diverged: ReadonlyArray<string>,
  applyToA: SyncChange[],
  applyToB: SyncChange[],
  migrations?: ReadonlyArray<BlobMigration>,
): Promise<void> {
  for (const partitionKey of diverged) {
    const key = partitionBlobKey(entityName, partitionKey);
    let [blobA, blobB] = await Promise.all([
      adapterA.read(tenant, key),
      adapterB.read(tenant, key),
    ]);
    if (!blobA || !blobB) {
      log.sync('skipping merge for %s: missing blob', key);
      continue;
    }
    if (migrations) {
      blobA = migrateBlob(blobA, migrations, entityName);
      blobB = migrateBlob(blobB, migrations, entityName);
    }
    const merged = mergePartition(blobA, blobB, entityName);
    const mergedBlob: PartitionBlob = {
      [entityName]: merged.entities,
      deleted: { [entityName]: merged.tombstones },
    };
    applyToB.push({ entityName, partitionKey, key, blob: mergedBlob });
    applyToA.push({ entityName, partitionKey, key, blob: mergedBlob });
  }
}

// ─── Phase 2 & 3: Apply changes ─────────────────────────

async function applyChanges(
  adapter: DataAdapter,
  tenant: Tenant | undefined,
  changes: ReadonlyArray<SyncChange>,
): Promise<void> {
  for (const change of changes) {
    await adapter.write(tenant, change.key, change.blob);
  }
}

async function checkStale(
  adapter: DataAdapter,
  tenant: Tenant | undefined,
  snapshot: AllIndexes,
  options: ResolvedStrataOptions,
): Promise<{ stale: boolean; currentIndexes: AllIndexes }> {
  const current = await loadAllIndexes(adapter, tenant, options);
  for (const entityName of Object.keys(snapshot)) {
    const snapIndex = snapshot[entityName] ?? {};
    const curIndex = current[entityName] ?? {};
    const allKeys = new Set([
      ...Object.keys(snapIndex), ...Object.keys(curIndex),
    ]);
    for (const key of allKeys) {
      const snapEntry = snapIndex[key] as PartitionIndexEntry | undefined;
      const curEntry = curIndex[key] as PartitionIndexEntry | undefined;
      if (snapEntry?.hash !== curEntry?.hash) {
        return { stale: true, currentIndexes: current };
      }
    }
  }
  return { stale: false, currentIndexes: current };
}

// ─── Index computation ───────────────────────────────────

function computeIndexUpdates(
  changes: ReadonlyArray<SyncChange>,
): AllIndexes {
  const updated: AllIndexes = {};
  for (const { entityName, partitionKey, blob } of changes) {
    const entities =
      (blob[entityName] as Record<string, unknown> | undefined) ?? {};
    const tombstones = blob.deleted[entityName] ?? {};
    const hlcMap = buildHlcMap(entities, tombstones);
    const hash = partitionHash(hlcMap);
    updated[entityName] = updatePartitionIndexEntry(
      updated[entityName] ?? {},
      partitionKey, hash, hlcMap.size, Object.keys(tombstones).length,
    );
  }
  return updated;
}

function mergeIndexes(existing: AllIndexes, updates: AllIndexes): AllIndexes {
  const result = { ...existing };
  for (const [entityName, partitions] of Object.entries(updates)) {
    result[entityName] = { ...(result[entityName] ?? {}), ...partitions };
  }
  return result;
}

function deduplicateChanges(
  changes: ReadonlyArray<SyncChange>,
): ReadonlyArray<SyncChange> {
  const seen = new Set<string>();
  const deduped: SyncChange[] = [];
  for (const change of changes) {
    if (!seen.has(change.key)) {
      seen.add(change.key);
      deduped.push(change);
    }
  }
  return deduped;
}

function buildHlcMap(
  entities: Readonly<Record<string, unknown>>,
  tombstones: Readonly<Record<string, Hlc>>,
): Map<string, Hlc> {
  const hlcMap = new Map<string, Hlc>();
  for (const [id, entity] of Object.entries(entities)) {
    hlcMap.set(id, (entity as SyncEntity).hlc);
  }
  for (const [id, hlc] of Object.entries(tombstones)) {
    hlcMap.set(`\0${id}`, hlc);
  }
  return hlcMap;
}

// ─── Result builders ─────────────────────────────────────

function toEntityChanges(
  changes: ReadonlyArray<SyncChange>,
): ReadonlyArray<SyncEntityChange> {
  return changes.map(({ key, entityName, blob }) => {
    const entities =
      (blob[entityName] as Record<string, unknown> | undefined) ?? {};
    const tombstones = blob.deleted[entityName] ?? {};
    return {
      key,
      updatedIds: Object.keys(entities),
      deletedIds: Object.keys(tombstones),
    };
  });
}

function findMaxHlc(
  changes: ReadonlyArray<SyncChange>,
): Hlc | undefined {
  let max: Hlc | undefined;
  for (const { entityName, blob } of changes) {
    const entities =
      (blob[entityName] as Record<string, unknown> | undefined) ?? {};
    const tombstones = blob.deleted[entityName] ?? {};
    for (const entity of Object.values(entities)) {
      const hlc = (entity as SyncEntity).hlc;
      if (!max || compareHlc(hlc, max) > 0) max = hlc;
    }
    for (const hlc of Object.values(tombstones)) {
      if (!max || compareHlc(hlc, max) > 0) max = hlc;
    }
  }
  return max;
}

// ─── Main ────────────────────────────────────────────────

export async function syncBetween(
  adapterA: DataAdapter,
  adapterB: DataAdapter,
  entityNames: ReadonlyArray<string>,
  tenant: Tenant | undefined,
  options: ResolvedStrataOptions,
  migrations?: ReadonlyArray<BlobMigration>,
  partitionFilter?: PartitionFilter,
): Promise<SyncBetweenResult> {
  const plan = await buildPlan(adapterA, adapterB, entityNames, tenant, options, migrations, partitionFilter);

  if (plan.applyToB.length === 0 && plan.applyToA.length === 0) {
    return { changesForA: [], changesForB: [], stale: false, maxHlc: undefined };
  }

  // Phase 2: write to B unconditionally
  await applyChanges(adapterB, tenant, plan.applyToB);

  // Phase 3: stale check, then write to A
  const { stale, currentIndexes: existingIdxA } = await checkStale(adapterA, tenant, plan.indexSnapshotA, options);
  if (!stale && plan.applyToA.length > 0) {
    await applyChanges(adapterA, tenant, plan.applyToA);
  }

  // Update indexes — each adapter only gets updates for changes actually written to it
  // Skip A index save when stale — another process may have updated A's indexes
  const indexUpdatesB = computeIndexUpdates(deduplicateChanges(plan.applyToB));
  const existingIdxB = await loadAllIndexes(adapterB, tenant, options);
  if (stale) {
    await saveAllIndexes(adapterB, tenant, mergeIndexes(existingIdxB, indexUpdatesB), options);
  } else {
    const indexUpdatesA = computeIndexUpdates(deduplicateChanges(plan.applyToA));
    await Promise.all([
      saveAllIndexes(adapterA, tenant, mergeIndexes(existingIdxA, indexUpdatesA), options),
      saveAllIndexes(adapterB, tenant, mergeIndexes(existingIdxB, indexUpdatesB), options),
    ]);
  }

  const appliedToA = stale ? [] : plan.applyToA;
  const allApplied = deduplicateChanges([...appliedToA, ...plan.applyToB]);
  const maxHlc = findMaxHlc(allApplied);

  log.sync(
    'syncBetween complete: %d→B, %d→A, stale=%s',
    plan.applyToB.length, stale ? 0 : plan.applyToA.length, stale,
  );

  return {
    changesForA: stale ? [] : toEntityChanges(plan.applyToA),
    changesForB: toEntityChanges(plan.applyToB),
    stale,
    maxHlc,
  };
}
