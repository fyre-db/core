# Reactive Observations

## Overview

fyre-db uses RxJS Observables to push data changes to your UI. When any entity of a given type changes, observers re-evaluate and emit only if their specific data changed.

## Observing a Single Entity

```typescript
const repo = strata.repo(taskDef);

const task$ = repo.observe(taskId);
task$.subscribe((task) => {
  // fires when this specific task changes (or is deleted → undefined)
  console.log(task?.title);
});
```

- Returns `Observable<(T & BaseEntity) | undefined>`
- Emits immediately with current value
- Re-emits only when the entity's `version` changes
- Emits `undefined` if the entity is deleted

## Observing a Query

```typescript
const openTasks$ = repo.observeQuery({ where: { done: false } });
openTasks$.subscribe((tasks) => {
  // fires when the result set changes
  console.log(`${tasks.length} open tasks`);
});
```

- Returns `Observable<ReadonlyArray<T & BaseEntity>>`
- Emits immediately with current results
- Re-evaluates the query on every change to the entity type
- Only emits if the result set actually changed (same IDs + same versions = skip)

## How It Works

```
save(entity)
  → Map.set()                           [sync, instant]
  → EventBus.emit(EntityEvent)           [sync, with payload]
  → all observers for this entity type:
      filter by entityName
      re-read from Map
      distinctUntilChanged → emit only if changed
```

The `EventBus<EntityEvent>` emits typed events with `{ entityName, source, updates, deletes }`. Observers filter by entity name and re-read from the in-memory Map. The `source` field distinguishes user mutations (`'user'`) from sync-imported changes (`'sync'`).

## Strata-Level Observables

```typescript
// Observe all entity events
strata.observe('entity').subscribe((event) => {
  console.log(`${event.entityName}: ${event.updates.length} updated, ${event.deletes.length} deleted`);
});

// Observe events for a specific entity type
strata.observe('entity', 'task').subscribe((event) => { /* ... */ });

// Observe sync lifecycle
strata.observe('sync').subscribe((event) => {
  // event.type: 'sync-started' | 'sync-completed' | 'sync-failed'
  console.log(`${event.type}: ${event.source} → ${event.target}`);
});

// Observe dirty state
strata.observe('dirty').subscribe((isDirty) => {
  showUnsavedIndicator(isDirty);
});

// Observe active tenant
strata.observe('tenant').subscribe((tenant) => {
  console.log(tenant ? `Active: ${tenant.name}` : 'No tenant');
});
```

## React Integration

```tsx
import { useEffect, useState } from 'react';
import type { Observable } from 'rxjs';

function useObservable<T>(observable$: Observable<T>, initial: T): T {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const sub = observable$.subscribe(setValue);
    return () => sub.unsubscribe();
  }, [observable$]);
  return value;
}

function TaskList() {
  const repo = strata.repo(taskDef);
  const tasks = useObservable(
    repo.observeQuery({ where: { done: false } }),
    [],
  );

  return (
    <ul>
      {tasks.map(t => <li key={t.id}>{t.title}</li>)}
    </ul>
  );
}
```

For a batteries-included React integration, see `fyre-db/plugins/react` which provides `useRepo`, `useQuery`, `useEntity`, `useSyncStatus`, and more.

**React Strict Mode** is safe — each mount gets a fresh subscription. Unmounting tears down the subscription, not the EventBus.

## Singleton Observation

```typescript
const settings = strata.repo(settingsDef);
const settings$ = settings.observe(); // no ID needed
settings$.subscribe((s) => {
  console.log(s?.theme);
});
```

## Cleanup

Call `subscription.unsubscribe()` when done (standard RxJS). When `strata.dispose()` is called, all EventBus subjects complete and active subscriptions end.

## Performance

- `observe(id)` does an O(1) Map lookup on each event — negligible even if unrelated entities changed
- `observeQuery(opts)` re-scans the Map with your filter — O(n) where n = entities of that type
- `distinctUntilChanged` compares by `id` + `version` — no deep equality, no serialization
- 100 saves via `saveMany()` → 1 event → 1 re-scan → 1 render
