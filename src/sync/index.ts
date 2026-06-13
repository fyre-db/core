export type {
  PartitionDiffResult,
  EntityDiffResult,
  MergeResult,
  MergedPartitionResult,
  SyncEntity,
  SyncEntityChange,
  SyncBetweenResult,
  SyncLocation,
  SyncQueueItem,
  SyncResult,
  SyncEvent,
  SyncEnqueueResult,
  SyncEngine as SyncEngineType,
} from './types';
export { diffPartitions } from './diff';
export { resolveConflict, resolveEntityTombstone } from './conflict';
export { mergePartition } from './merge';
export { SyncEngine } from './sync-engine';
export { syncBetween } from './unified';
export type { PartitionFilter } from './unified';
export { SyncError } from './errors';
export type { SyncErrorKind } from './errors';
