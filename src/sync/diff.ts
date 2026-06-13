import type { PartitionIndex, PartitionIndexEntry } from '@/persistence';
import type { PartitionDiffResult } from './types';

export function diffPartitions(
  localIndex: PartitionIndex,
  cloudIndex: PartitionIndex,
): PartitionDiffResult {
  const localOnly: string[] = [];
  const cloudOnly: string[] = [];
  const diverged: string[] = [];
  const unchanged: string[] = [];

  const allKeys = new Set([
    ...Object.keys(localIndex),
    ...Object.keys(cloudIndex),
  ]);

  for (const key of allKeys) {
    const local = localIndex[key] as PartitionIndexEntry | undefined;
    const cloud = cloudIndex[key] as PartitionIndexEntry | undefined;

    if (local && !cloud) {
      localOnly.push(key);
    } else if (!local && cloud) {
      cloudOnly.push(key);
    } else if (local && cloud) {
      if (local.hash === cloud.hash && local.count === cloud.count && local.deletedCount === cloud.deletedCount) {
        unchanged.push(key);
      } else {
        diverged.push(key);
      }
    }
  }

  return { localOnly, cloudOnly, diverged, unchanged };
}
