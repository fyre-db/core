# Getting Started

## Installation

```bash
npm install @fyre-db/core
```

## Quick Start

```typescript
import { FyreDb, MemoryStorageAdapter, defineEntity } from '@fyre-db/core';

// 1. Define your entities
type Task = { title: string; done: boolean };
const taskDef = defineEntity<Task>('task');

// 2. Create a FyreDb instance
const fyredb = new FyreDb({
  appId: 'my-app',
  entities: [taskDef],
  localAdapter: new MemoryStorageAdapter(),
  deviceId: 'device-1',
});

// 3. Create and open a tenant
const tenant = await fyredb.tenants.create({
  name: 'My Workspace',
  meta: {},
});
await fyredb.tenants.open(tenant.id);

// 4. Use the repository
const tasks = fyredb.repo(taskDef);
const id = tasks.save({ title: 'Hello FyreDb', done: false });
console.log(tasks.get(id));        // { title: 'Hello FyreDb', done: false, id: '...', ... }
console.log(tasks.query().length); // 1

// 5. Clean up
await fyredb.dispose();
```

## Core Concepts

### Entities

Entities are typed data objects. You define them with `defineEntity<T>(name)`:

```typescript
type Note = { body: string; tags: string[] };
const noteDef = defineEntity<Note>('note');
```

The framework adds metadata fields automatically: `id`, `createdAt`, `updatedAt`, `version`, `device`, and `hlc` (hybrid logical clock for sync).

### Tenants

All data is scoped to a tenant. A tenant represents a workspace, project, or user account. You must create and open a tenant before reading or writing data.

```typescript
const tenant = await fyredb.tenants.create({ name: 'Work', meta: {} });
await fyredb.tenants.open(tenant.id);
```

### Repositories

Repositories provide CRUD operations. Get one from `fyredb.repo(entityDef)`:

```typescript
const repo = fyredb.repo(taskDef);

// Create
const id = repo.save({ title: 'Buy milk', done: false });

// Read
const task = repo.get(id);

// Update (pass the id to update)
repo.save({ ...task!, done: true });

// Delete
repo.delete(id);

// Query
const open = repo.query({ where: { done: false } });
```

### Adapters

Adapters determine where data is stored. The framework ships `MemoryStorageAdapter` for development and testing — it stores raw `Uint8Array` bytes in an in-memory `Map`.

For production, use an adapter from `fyre-db/plugins` (e.g., `LocalStorageAdapter`, `GoogleDriveAdapter`) or implement the `StorageAdapter` interface for your own backend. See [Storage Adapters](storage-adapters.md).

## FyreDbConfig

```typescript
const fyredb = new FyreDb({
  appId: 'my-app',                    // unique app identifier
  entities: [taskDef, noteDef],       // entity definitions
  localAdapter: myStorageAdapter,     // StorageAdapter implementation
  cloudAdapter: myCloudAdapter,       // optional — enables cloud sync
  deviceId: 'device-1',              // unique per device
  encryptionService: myEncryption,    // optional — enables per-tenant encryption
  migrations: [...],                  // optional — blob migrations
  options: {
    localFlushDebounceMs: 500,        // memory → local, after edits settle (default: 500ms)
    localFlushMaxWaitMs: 3000,        // local flush ceiling during sustained edits (default: 3s)
    cloudSyncDebounceMs: 10000,       // cloud sync, after edits settle (default: 10s)
    cloudSyncMaxWaitMs: 60000,        // cloud sync ceiling (default: 60s)
    cloudPullIntervalMs: 300000,      // periodic pull backstop (default: 5m)
    tombstoneRetentionMs: 604800000,  // tombstone TTL (default: 7 days)
  },
});
```

## Lifecycle

```mermaid
sequenceDiagram
    participant App
    participant FyreDb
    participant Tenant as TenantManager
    participant Repo as Repository
    participant Store as In-Memory Store
    participant Local as Local Adapter
    participant Cloud as Cloud Adapter
    participant Sync as SyncEngine

    Note over App,Sync: Phase 1: Initialization
    App->>FyreDb: new FyreDb(config)
    FyreDb->>FyreDb: validate entities, init HLC, create EventBus
    FyreDb-->>App: fyredb instance

    Note over App,Sync: Phase 2: Tenant Open
    App->>Tenant: fyredb.tenants.open(tenantId)
    Tenant->>Tenant: set active tenant + encryption keys

    alt Cloud adapter configured
        Sync->>Cloud: sync cloud → local
        Cloud-->>Sync: partition blobs
    end

    Sync->>Local: sync local → memory
    Local-->>Store: hydrate entities into Map
    Sync->>Sync: start scheduler (2s local, 5m cloud)

    Note over App,Sync: Phase 3: CRUD & Observe
    App->>Repo: repo.save(entity)
    Repo->>Store: Map.set() [sync, instant]
    Repo->>FyreDb: EventBus.emit(EntityEvent)

    App->>Repo: repo.observe(id)
    Repo-->>App: Observable (re-emits on change)

    Note over App,Sync: Phase 4: Background Sync
    Sync->>Store: read dirty partitions (every 2s)
    Sync->>Local: flush to local adapter
    Sync->>Cloud: sync to cloud (every 5m)
    Sync->>Store: merge remote changes into Map

    Note over App,Sync: Phase 5: Dispose
    App->>FyreDb: fyredb.dispose()
    FyreDb->>Tenant: close (flush memory → local)
    FyreDb->>Sync: stop scheduler, drain queue
    FyreDb->>FyreDb: complete EventBus, dispose repos
```

## Next Steps

- [Entities & Repositories](entities-repositories.md) — key strategies, queries, batch ops
- [Reactive Observations](reactive.md) — observe changes with RxJS
- [Multi-Tenancy](multi-tenancy.md) — tenant management and sharing
- [Encryption](encryption.md) — per-tenant encryption
- [Sync & Offline](sync.md) — cloud sync and conflict resolution
- [Storage Adapters](storage-adapters.md) — custom adapter implementation
- [Migrations](migrations.md) — data schema migrations
