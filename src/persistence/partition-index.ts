import type { Tenant } from '@/adapter';
import type { AllIndexes, PartitionIndex, PartitionBlob } from './types';
import type { DataAdapter } from './blob-io';
import type { ResolvedFyreDbOptions } from '../options';

export async function loadAllIndexes(
  adapter: DataAdapter,
  tenant: Tenant | undefined,
  options: ResolvedFyreDbOptions,
): Promise<AllIndexes> {
  const blob = await adapter.read(tenant, options.markerKey);
  if (!blob) return {};
  const systemEntities = blob[options.systemEntityKey] as Record<string, unknown> | undefined;
  if (!systemEntities) return {};
  const marker = systemEntities['marker'] as { indexes?: AllIndexes } | undefined;
  return marker?.indexes ?? {};
}

export async function saveAllIndexes(
  adapter: DataAdapter,
  tenant: Tenant | undefined,
  indexes: AllIndexes,
  options: ResolvedFyreDbOptions,
): Promise<void> {
  const existing = await adapter.read(tenant, options.markerKey);
  let markerData: Record<string, unknown>;
  if (existing) {
    const systemEntities = existing[options.systemEntityKey] as Record<string, unknown> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    markerData = systemEntities?.['marker'] as Record<string, unknown> ?? { version: 1, createdAt: new Date(), entityTypes: [] };
  } else {
    markerData = { version: 1, createdAt: new Date(), entityTypes: [] };
  }
  markerData['indexes'] = indexes;
  const blob: PartitionBlob = {
    [options.systemEntityKey]: { marker: markerData },
    deleted: {},
  };
  await adapter.write(tenant, options.markerKey, blob);
}

export function updatePartitionIndexEntry(
  index: PartitionIndex,
  partitionKey: string,
  hash: number,
  count: number,
  deletedCount: number,
): PartitionIndex {
  return {
    ...index,
    [partitionKey]: { hash, count, deletedCount, updatedAt: Date.now() },
  };
}
