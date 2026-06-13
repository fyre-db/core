import type { Hlc } from '@/hlc';

export type BaseEntity = {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
  readonly device: string;
  readonly hlc: Hlc;
};

export type KeyStrategy<T> = {
  readonly kind: 'global' | 'singleton' | 'partitioned';
  readonly partitionFn: (entity: T) => string;
};

export type EntityDefinitionOptions<T> = {
  readonly keyStrategy?: 'global' | 'singleton' | KeyStrategy<T>;
  readonly deriveId?: (entity: T) => string;
};

export type EntityDefinition<T, K extends KeyStrategy<T>['kind'] = KeyStrategy<T>['kind']> = {
  readonly name: string;
  readonly keyStrategy: KeyStrategy<T> & { readonly kind: K };
  readonly deriveId?: (entity: T) => string;
};
