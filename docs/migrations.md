# Migrations

## Overview

When your entity schema changes (add a field, rename a field, restructure data), blob migrations transform stored data to the new format. Migrations run lazily — blobs are migrated when read during sync, not eagerly in bulk.

## Defining Migrations

```typescript
import { FyreDb, defineEntity } from '@fyre-db/core';
import type { BlobMigration } from '@fyre-db/core';

type Task = { title: string; done: boolean; priority: string };
const taskDef = defineEntity<Task>('task');

const migrations: BlobMigration[] = [
  {
    version: 1,
    entities: [taskDef],  // only applies to task blobs
    migrate: (blob) => {
      // v0 → v1: add "priority" field with default
      const tasks = (blob.task ?? {}) as Record<string, Record<string, unknown>>;
      const migrated: Record<string, unknown> = {};
      for (const [id, entity] of Object.entries(tasks)) {
        migrated[id] = { ...entity, priority: entity.priority ?? 'medium' };
      }
      return { ...blob, task: migrated };
    },
  },
];

const fyredb = new FyreDb({
  appId: 'my-app',
  entities: [taskDef],
  localAdapter: storage,
  deviceId: 'device-1',
  migrations,
});
```

## `BlobMigration` Type

```typescript
type BlobMigration = {
  readonly version: number;
  readonly entities?: ReadonlyArray<EntityDefinition<any>>;  // scope filter
  readonly migrate: (blob: PartitionBlob) => PartitionBlob;
};
```

- **`version`** — contiguous integer starting at 1 (1, 2, 3, …). No gaps, no duplicates — validated at startup.
- **`entities`** — optional. If provided, only blobs matching these entity types are migrated. If omitted, the migration applies to all blobs.
- **`migrate`** — receives the raw `PartitionBlob`, returns the transformed blob.

## How It Works

Each partition blob has an optional `__v` field (defaults to 0):

```json
{
  "__v": 1,
  "task": { ... },
  "deleted": { "task": {} }
}
```

When a blob is read during sync:
1. Check `blob.__v` (default 0)
2. Filter migrations where `version > __v` and entity scope matches
3. Sort by version ascending
4. Apply each migration in order
5. Set `__v` to the highest applied version

## Entity Scoping

Scope migrations to specific entity types:

```typescript
const migrations: BlobMigration[] = [
  {
    version: 1,
    entities: [taskDef],  // only task blobs
    migrate: (blob) => { /* transform task data */ return blob; },
  },
  {
    version: 2,
    entities: [noteDef],  // only note blobs
    migrate: (blob) => { /* transform note data */ return blob; },
  },
  {
    version: 3,
    // no entities filter — applies to ALL blobs
    migrate: (blob) => { /* global transform */ return blob; },
  },
];
```

Without `entities`, the migration applies to every blob regardless of type.

## Validation

Migration versions **must** be contiguous integers starting at 1. fyre-db validates this at startup and throws if the sequence is broken:

```typescript
// ✅ valid
const migrations = [
  { version: 1, migrate: (b) => b },
  { version: 2, migrate: (b) => b },
  { version: 3, migrate: (b) => b },
];

// ❌ throws — gap between 2 and 5
const bad = [
  { version: 1, migrate: (b) => b },
  { version: 2, migrate: (b) => b },
  { version: 5, migrate: (b) => b },  // Error: expected 3, got 5
];

// ❌ throws — duplicate version
const dup = [
  { version: 1, migrate: (b) => b },
  { version: 1, migrate: (b) => b },  // Error: Duplicate version 1
];
```

## Lazy Execution

Migrations do **not** run eagerly on all blobs at startup. They're applied when a blob is read during sync:

- Only touched blobs get migrated
- Untouched blobs on cloud remain at their old version until accessed
- Cost is amortized — each blob migrated once on first access
- No full-scan migration pass needed

## Testing

The `migrateBlob` function is exported for unit testing:

```typescript
import { migrateBlob } from '@fyre-db/core';

const oldBlob = { task: { 'task._.abc': { title: 'Old' } }, deleted: {} };
const migrated = migrateBlob(oldBlob, migrations, 'task');
// migrated.task['task._.abc'].priority === 'medium'
```

## Tips

- **Always add new migrations, never modify old ones** — existing blobs may have already been migrated
- **Keep migrations simple** — add defaults for new fields, reshape data structures
- **Test migrations** — use `migrateBlob()` in unit tests with sample blobs
