import type { Observable } from 'rxjs';
import type { BaseEntity } from '@/schema';

export type QueryOptions<T> = {
  readonly keys?: readonly string[];
  readonly where?: Partial<T>;
  readonly range?: {
    readonly field: keyof T;
    readonly gt?: unknown;
    readonly gte?: unknown;
    readonly lt?: unknown;
    readonly lte?: unknown;
  };
  readonly orderBy?: ReadonlyArray<{
    readonly field: keyof T;
    readonly direction: 'asc' | 'desc';
  }>;
  readonly limit?: number;
  readonly offset?: number;
};

export type Repository<T> = {
  get(id: string): (T & BaseEntity) | undefined;
  query(opts?: QueryOptions<T>): ReadonlyArray<T & BaseEntity>;
  save(entity: T & Partial<BaseEntity>): string;
  saveMany(entities: ReadonlyArray<T & Partial<BaseEntity>>): ReadonlyArray<string>;
  delete(id: string): boolean;
  deleteMany(ids: ReadonlyArray<string>): void;
  observe(id: string): Observable<(T & BaseEntity) | undefined>;
  observeQuery(opts?: QueryOptions<T>): Observable<ReadonlyArray<T & BaseEntity>>;
  dispose(): void;
};

export type SingletonRepository<T> = {
  get(): (T & BaseEntity) | undefined;
  save(entity: T & Partial<BaseEntity>): void;
  delete(): boolean;
  observe(): Observable<(T & BaseEntity) | undefined>;
  dispose(): void;
};
