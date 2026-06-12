import type { Tenant } from '@/adapter';
import type { AllIndexes, PartitionBlob, DataAdapter } from '@/persistence';
import type { ResolvedFyreDbOptions } from '../options';
import { log } from '@/log';

export type MarkerData = {
  readonly version: number;
  readonly createdAt: Date;
  readonly entityTypes: readonly string[];
  readonly indexes?: AllIndexes;
  readonly keyData?: Record<string, unknown>;
};

export async function writeMarkerBlob(
  adapter: DataAdapter,
  tenant: Tenant | undefined,
  entityTypes: readonly string[],
  options: ResolvedFyreDbOptions,
  keyData?: Record<string, unknown>,
): Promise<void> {
  const marker: MarkerData = {
    version: 1,
    createdAt: new Date(),
    entityTypes,
    indexes: {},
    ...(keyData ? { keyData } : {}),
  };
  const blob: PartitionBlob = {
    [options.systemEntityKey]: { marker },
    deleted: {},
  };
  await adapter.write(tenant, options.markerKey, blob);
  log.tenant('wrote marker blob');
}

export async function readMarkerBlob(
  adapter: DataAdapter,
  tenant: Tenant | undefined,
  options: ResolvedFyreDbOptions,
): Promise<MarkerData | undefined> {
  const blob = await adapter.read(tenant, options.markerKey);
  if (!blob) return undefined;
  const systemEntities = blob[options.systemEntityKey] as Record<string, unknown> | undefined;
  if (!systemEntities) return undefined;
  return systemEntities['marker'] as MarkerData | undefined;
}

export function validateMarkerBlob(data: MarkerData): boolean {
  return data.version === 1;
}
