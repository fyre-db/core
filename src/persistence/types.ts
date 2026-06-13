import type { Hlc } from '@/hlc';

export type PartitionIndexEntry = {
  readonly hash: number;
  readonly count: number;
  readonly deletedCount: number;
  readonly updatedAt: number;
};

export type PartitionIndex = Record<string, PartitionIndexEntry>;

export type AllIndexes = Record<string, PartitionIndex>;

export type PartitionBlob = {
  readonly __v?: number;
  readonly deleted: Record<string, Record<string, Hlc>>;
  readonly [entityName: string]: Record<string, unknown> | Record<string, Record<string, Hlc>> | number | undefined;
};
