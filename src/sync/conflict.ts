import type { Hlc } from '@/hlc';
import { compareHlc } from '@/hlc';
import type { SyncEntity } from './types';

export function resolveConflict<T extends SyncEntity>(
  localEntity: T,
  cloudEntity: T,
): T {
  const cmp = compareHlc(localEntity.hlc, cloudEntity.hlc);
  return cmp >= 0 ? localEntity : cloudEntity;
}

export function resolveEntityTombstone(
  entityHlc: Hlc,
  tombstoneHlc: Hlc,
): 'entity' | 'tombstone' {
  const cmp = compareHlc(entityHlc, tombstoneHlc);
  return cmp > 0 ? 'entity' : 'tombstone';
}
