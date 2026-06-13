import type { Tenant } from '@/adapter';
import { partitionBlobKey } from '@/adapter';
import type { DataAdapter, PartitionBlob } from '@/persistence';
import type { BlobMigration } from '@/schema/migration';
import { migrateBlob } from '@/schema/migration';
import type { Hlc } from '@/hlc';
import type { EntityStore } from './types';
import { log } from '@/log';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isValidHlc(v: unknown): v is Hlc {
  return (
    isPlainObject(v) &&
    typeof v.timestamp === 'number' &&
    typeof v.counter === 'number' &&
    typeof v.nodeId === 'string'
  );
}

function validateBlob(blob: PartitionBlob, entityName: string): boolean {
  if (!isPlainObject(blob.deleted)) return false;

  const entityData = blob[entityName];
  if (entityData !== undefined && !isPlainObject(entityData)) return false;

  const tombstoneData = blob.deleted[entityName];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (tombstoneData !== undefined) {
    if (!isPlainObject(tombstoneData)) return false;
    for (const hlc of Object.values(tombstoneData)) {
      if (!isValidHlc(hlc)) return false;
    }
  }

  return true;
}

export async function loadPartitionFromAdapter(
  adapter: DataAdapter,
  tenant: Tenant | undefined,
  store: EntityStore,
  entityName: string,
  partitionKey: string,
  migrations?: ReadonlyArray<BlobMigration>,
): Promise<Map<string, unknown>> {
  const key = partitionBlobKey(entityName, partitionKey);
  let blob = await adapter.read(tenant, key);
  if (!blob) return new Map();

  if (migrations && migrations.length > 0) {
    blob = migrateBlob(blob, migrations, entityName);
  }

  if (!validateBlob(blob, entityName)) {
    log.store.warn('malformed blob for partition %s — skipping', key);
    return new Map();
  }

  const entities =
    (blob[entityName] as Record<string, unknown> | undefined) ?? {};
  const tombstoneData = blob.deleted[entityName] ?? {};

  for (const [id, hlc] of Object.entries(tombstoneData)) {
    store.setTombstone(key, id, hlc);
  }

  return new Map(Object.entries(entities));
}
