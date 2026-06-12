# Entities & Repositories

## Defining Entities

```typescript
import { defineEntity, partitioned } from '@fyre-db/core';

type Task = { title: string; done: boolean; category: string };
const taskDef = defineEntity<Task>('task');
```

The framework adds `BaseEntity` fields to every entity: `id`, `createdAt`, `updatedAt`, `version`, `device`, `hlc`.

Entity names must not contain dots.

## Key Strategies

Key strategies control how entities are partitioned into blobs for storage and sync.

### Global (default)

All entities in one partition. Best for small collections.

```typescript
const taskDef = defineEntity<Task>('task');
// same as: defineEntity<Task>('task', { keyStrategy: 'global' })
```

### Partitioned

Entities split across partitions by a derived key. Best for large, time-series, or naturally grouped data.

```typescript
const txnDef = defineEntity<Transaction>('transaction', {
  keyStrategy: partitioned((t) => t.date.toISOString().slice(0, 7)), // by month
});
```

Only the relevant partition is loaded/synced — keeps memory and network usage low.

### Singleton

Exactly one instance. No ID needed. Best for settings or config.

```typescript
const settingsDef = defineEntity<Settings>('settings', {
  keyStrategy: 'singleton',
});
```

Returns a `SingletonRepository` instead of a `Repository`:

```typescript
const settings = strata.repo(settingsDef);
settings.save({ theme: 'dark', language: 'en' });
const current = settings.get(); // no ID parameter
settings.delete();
```

## Entity IDs

Format: `entityName.partitionKey.uniqueId`

IDs are auto-generated (8-char URL-safe alphanumeric). To derive deterministic IDs from entity data:

```typescript
const authDef = defineEntity<Auth>('auth', {
  keyStrategy: 'global',
  deriveId: (entity) => `${entity.provider}-${entity.userId}`,
});
```

With `deriveId`, calling `save()` with the same derived ID updates the existing entity (implicit upsert). The `deriveId` output must not contain dots. Entity IDs are capped at 256 characters.

## Repository API

### `Repository<T>` — for global and partitioned entities

```typescript
const repo = strata.repo(taskDef);

// Create / Update
const id = repo.save({ title: 'New task', done: false, category: 'work' });
repo.save({ ...repo.get(id)!, done: true }); // update by passing id

// Read
const task = repo.get(id);                    // by ID, or undefined

// Query
const all = repo.query();                     // all entities
const open = repo.query({ where: { done: false } });
const sorted = repo.query({
  orderBy: [{ field: 'title', direction: 'asc' }],
  limit: 10,
  offset: 0,
});

// Delete
repo.delete(id);

// Batch
const ids = repo.saveMany([
  { title: 'Task A', done: false, category: 'work' },
  { title: 'Task B', done: false, category: 'home' },
]);
repo.deleteMany(ids);
```

### `SingletonRepository<T>` — for singleton entities

```typescript
const settings = strata.repo(settingsDef);

settings.save({ theme: 'dark', language: 'en' });
const current = settings.get();
settings.delete();
```

## QueryOptions

```typescript
repo.query({
  where: { category: 'work' },         // exact field match
  range: {
    field: 'createdAt',
    gte: new Date('2026-01-01'),
    lt: new Date('2026-04-01'),
  },
  orderBy: [
    { field: 'createdAt', direction: 'desc' },
  ],
  limit: 20,
  offset: 0,
});
```

Execution order: `where` → `range` → `orderBy` → `offset`/`limit`. All in-memory, all synchronous.

## Batch Operations

`saveMany()` and `deleteMany()` perform all writes then emit a single change event — efficient for bulk operations:

```typescript
// 100 saves → 1 event → observers re-scan once
const ids = repo.saveMany(items.map(i => ({ title: i, done: false, category: 'bulk' })));

// deleteMany only emits if at least one entity was deleted
repo.deleteMany(ids);
```
