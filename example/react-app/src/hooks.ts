import { useState, useEffect, useRef, useMemo } from 'react';
import type { Observable } from 'rxjs';
import type { RepositoryType, SingletonRepositoryType, QueryOptions, BaseEntity } from '@fyre-db/core';

/**
 * Subscribe to an RxJS Observable and return its latest value.
 */
export function useObservable<T>(observable: Observable<T>): T | undefined;
export function useObservable<T>(observable: Observable<T>, initialValue: T): T;
export function useObservable<T>(observable: Observable<T>, initialValue?: T): T | undefined {
  const [value, setValue] = useState<T | undefined>(initialValue);

  useEffect(() => {
    const sub = observable.subscribe(setValue);
    return () => { sub.unsubscribe(); };
  }, [observable]);

  return value;
}

/**
 * Observe a single entity by ID. Returns the entity or undefined.
 */
export function useEntity<T>(
  repo: RepositoryType<T>,
  id: string,
): (T & BaseEntity) | undefined {
  const obs = useMemo(() => repo.observe(id), [repo, id]);
  return useObservable(obs);
}

/**
 * Observe a query. Returns the current result array.
 */
export function useQuery<T>(
  repo: RepositoryType<T>,
  opts?: QueryOptions<T>,
): ReadonlyArray<T & BaseEntity> {
  // Memoize the observable so it doesn't re-create on every render
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const obs = useMemo(() => repo.observeQuery(opts), [repo]);
  return useObservable(obs, []);
}

/**
 * Observe a singleton entity. Returns the entity or undefined.
 */
export function useSingleton<T>(
  repo: SingletonRepositoryType<T>,
): (T & BaseEntity) | undefined {
  const obs = useMemo(() => repo.observe(), [repo]);
  return useObservable(obs);
}
