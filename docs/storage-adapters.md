# Storage Adapters

## Overview

A storage adapter is the bridge between fyre-db and your persistence layer. You implement the `StorageAdapter` interface — 3 methods, raw bytes in and out.

## `StorageAdapter` Interface

```typescript
type StorageAdapter = {
  read(tenant: Tenant | undefined, key: string): Promise<Uint8Array | null>;
  write(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<void>;
  delete(tenant: Tenant | undefined, key: string): Promise<boolean>;
  deriveTenantId?(meta: Record<string, unknown>): string;  // optional
};
```

The framework handles serialization and encryption. Your adapter just stores and retrieves bytes.

The optional `deriveTenantId` method generates deterministic tenant IDs from metadata — used for sharing (same cloud folder = same tenant ID across users).

## Tenant Scoping

Every method receives a `tenant` parameter:

- **`undefined`** — app-level data (tenant list). Store in a default location.
- **`Tenant`** — tenant-scoped data. Use `tenant.meta` to resolve the storage path.

The `meta` object is opaque — it's whatever your app puts in it at tenant creation. Common patterns:

```typescript
// Filesystem
const dir = tenant ? (tenant.meta.container as string) : 'default';
const fullPath = path.join(rootDir, dir, key);

// IndexedDB
const storeName = tenant ? `tenant-${tenant.id}` : 'app';

// S3
const prefix = tenant ? (tenant.meta.bucket as string) : 'app-data';
```

## Example: Filesystem Adapter

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { StorageAdapter, Tenant } from '@fyre-db/core';

class FsStorageAdapter implements StorageAdapter {
  constructor(private readonly rootDir: string) {}

  private resolvePath(tenant: Tenant | undefined, key: string): string {
    const container = tenant?.meta?.container as string | undefined;
    if (container) return path.join(this.rootDir, container, key);
    return path.join(this.rootDir, key);
  }

  async read(tenant: Tenant | undefined, key: string): Promise<Uint8Array | null> {
    try {
      const buf = await fs.readFile(this.resolvePath(tenant, key));
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch {
      return null;
    }
  }

  async write(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<void> {
    const filePath = this.resolvePath(tenant, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
  }

  async delete(tenant: Tenant | undefined, key: string): Promise<boolean> {
    try {
      await fs.unlink(this.resolvePath(tenant, key));
      return true;
    } catch {
      return false;
    }
  }
}
```

## Usage

```typescript
const fyredb = new FyreDb({
  appId: 'my-app',
  entities: [taskDef],
  localAdapter: new FsStorageAdapter('/data/fyredb'),
  deviceId: 'device-1',
});
```

The framework wraps your `StorageAdapter` in an `EncryptedDataAdapter` which handles JSON serialization (`PartitionBlob` ↔ `Uint8Array`) and encryption (if an `EncryptionService` is configured).

## Built-in Adapters

| Adapter | Package | Storage | Use Case |
|---------|---------|---------|----------|
| `MemoryStorageAdapter` | `fyre-db/core` | In-memory `Map` | Testing, development |
| `LocalStorageAdapter` | `fyre-db/plugins` | Browser `localStorage` | Browser local persistence |
| `GoogleDriveAdapter` | `fyre-db/plugins` | Google Drive API v3 | Cloud sync |

## Key Naming

Keys the framework reads and writes:

| Key | Scope | Contents |
|---|---|---|
| `__tenants` | `tenant: undefined` | Tenant list blob |
| `__fyredb` | `tenant: Tenant` | Marker blob (indexes, metadata, encrypted DEK) |
| `task._` | `tenant: Tenant` | Partition blob: entity `task`, partition `_` (global) |
| `transaction.2026-03` | `tenant: Tenant` | Partition blob: entity `transaction`, partition `2026-03` |

## Tips

- **Return `null` from `read()` if the key doesn't exist** — don't throw
- **`delete()` returns `true` if something was deleted** — `false` if key didn't exist
- **Thread safety** — multiple reads/writes may happen concurrently. Ensure your adapter handles this if needed (file locks, atomic writes, etc.)
- **No `list()` method needed** — the framework discovers partitions via indexes stored in the marker blob, not by listing keys
