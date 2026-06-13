# fyre-db

[![CI](https://github.com/fyre-db/core/actions/workflows/ci.yml/badge.svg)](https://github.com/fyre-db/core/actions/workflows/ci.yml)
[![Publish](https://github.com/fyre-db/core/actions/workflows/publish.yml/badge.svg)](https://github.com/fyre-db/core/actions/workflows/publish.yml)
[![codecov](https://codecov.io/gh/fyre-db/core/branch/main/graph/badge.svg)](https://codecov.io/gh/fyre-db/core)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![License](https://img.shields.io/badge/license-MIT-blue)

An offline-first, reactive data framework for TypeScript/JavaScript. fyre-db handles entity storage, multi-device sync via cloud blob storage, HLC-based conflict resolution, multi-tenancy, encryption, and reactive UI bindings.

## Install

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
const tenant = await fyredb.tenants.create({ name: 'My Workspace', meta: {} });
await fyredb.tenants.open(tenant.id);

// 4. Use the repository
const tasks = fyredb.repo(taskDef);
const id = tasks.save({ title: 'Hello FyreDb', done: false });
console.log(tasks.get(id));        // { title: 'Hello FyreDb', done: false, id: '...', ... }
console.log(tasks.query().length); // 1

// 5. Clean up
await fyredb.dispose();
```

## Features

| Feature | Description |
|---|---|
| **Offline-first** | In-memory Map is the source of truth. All reads are synchronous. |
| **Multi-device sync** | Three-tier sync: memory ↔ local ↔ cloud. Periodic flush + cloud sync via any blob storage. |
| **Conflict resolution** | HLC-based (Hybrid Logical Clock) last-writer-wins with tombstone support. |
| **Reactive** | RxJS Observables for entity changes, queries, sync events, and dirty state. |
| **Multi-tenancy** | Isolated workspaces with metadata-based storage routing and tenant sharing. |
| **Encryption** | Per-tenant credential-based encryption (KEK/DEK model) with automatic detection. |
| **Migrations** | Lazy blob migrations that transform stored data to new formats on read. |
| **Pluggable storage** | One `StorageAdapter` interface (3 methods) — implement for IndexedDB, filesystem, S3, or any backend. |

## Configuration

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
    localFlushIntervalMs: 2000,       // memory → local flush interval (default: 2s)
    cloudSyncIntervalMs: 300000,      // local → cloud sync interval (default: 5m)
    tombstoneRetentionMs: 604800000,  // tombstone TTL (default: 7 days)
  },
});
```

## Lifecycle

```
new FyreDb(config) → tenants.open(id) → use repos → dispose()
```

1. **`new FyreDb(config)`** — creates instance, validates entity definitions, initializes HLC and EventBus
2. **`fyredb.tenants.open(tenantId)`** — loads tenant, hydrates data from local/cloud, starts sync scheduler
3. **Use repos** — `fyredb.repo(entityDef)` for CRUD, queries, and reactive observations
4. **`fyredb.dispose()`** — closes tenant, flushes to local, stops sync, cleans up

## Guides

| Guide | Description |
|---|---|
| [Getting Started](docs/getting-started.md) | Installation, first entity, lifecycle diagram |
| [Entities & Repositories](docs/entities-repositories.md) | Key strategies, queries, CRUD, batch operations |
| [Reactive Observations](docs/reactive.md) | Observe entity changes and sync events with RxJS |
| [Storage Adapters](docs/storage-adapters.md) | Implement custom persistence backends |
| [Sync & Offline](docs/sync.md) | Cloud sync, conflict resolution, tombstones |
| [Encryption](docs/encryption.md) | Per-tenant encryption with PBKDF2 + AES-GCM |
| [Multi-Tenancy](docs/multi-tenancy.md) | Tenant management, sharing, and probing |
| [Migrations](docs/migrations.md) | Data schema evolution with lazy blob migrations |

## License

MIT
