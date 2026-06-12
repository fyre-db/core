# Multi-Tenancy

## Overview

All data in fyre-db is scoped to a tenant. A tenant represents a workspace, project, or shared folder. You must create and open a tenant before reading or writing data.

## Creating Tenants

```typescript
const tenant = await strata.tenants.create({
  name: 'Work Project',
  meta: { folderId: 'abc123', space: 'drive' },
});
```

- `name` — display name
- `meta` — opaque object the adapter uses to locate storage (folder ID, bucket name, etc.)
- `id` — optional, auto-generated if not provided
- `encryption` — optional, see [Encryption](encryption.md)

The `meta` object is stored with the tenant and passed to every adapter call. Your `StorageAdapter` reads `tenant.meta` to resolve the storage path.

## Opening Tenants

```typescript
await strata.tenants.open(tenant.id);
```

Opening a tenant:
1. Sets it as the active tenant (with encryption keys if applicable)
2. Syncs data from cloud (if cloud adapter configured, gracefully handles unreachable)
3. Hydrates entities into memory from local
4. Starts background sync scheduler

Only one tenant can be active at a time. Opening a new tenant closes the previous one (flushing pending data first).

## Listing Tenants

```typescript
const tenants = await strata.tenants.list();
for (const t of tenants) {
  console.log(`${t.name} (${t.id})`);
}
```

The tenant list is cached in memory after the first call. Mutations (`create`, `remove`) update the cache automatically.

## Switching Tenants

```typescript
await strata.tenants.open(workTenant.id);
// ... work with work data ...

await strata.tenants.open(personalTenant.id);
// previous tenant's data flushed, new tenant loaded
```

**Important:** Always `await` lifecycle operations. Do not call `open()` concurrently — it is not reentrant.

## Sharing Tenants

When two users share a cloud folder, they can connect to the same tenant using `join()`:

```typescript
// User A creates a tenant pointing to a shared folder
const tenant = await strata.tenants.create({
  name: 'Shared Project',
  meta: { folderId: 'abc123', space: 'drive' },
});

// User B joins by pointing to the same folder
const sharedTenant = await strata.tenants.join({
  meta: { folderId: 'abc123', space: 'sharedWithMe' },
});
```

`join()` reads the `__strata` marker blob at the given location to detect an existing workspace. It probes for existence and whether encryption is enabled, then adds the tenant to the local list.

### Deterministic Tenant IDs

For sharing to work, both users need the same tenant ID. If your `StorageAdapter` implements `deriveTenantId(meta)`, the framework uses it to generate deterministic IDs from the storage location:

```typescript
// GoogleDriveAdapter.deriveTenantId returns meta.folderId
// Both users sharing folder 'abc123' → same tenant ID
```

Both users sharing the same folder → same derived ID → sync connects them.

## Probing a Location

Check if a workspace exists at a given location before joining:

```typescript
const result = await strata.tenants.probe({
  meta: { folderId: 'abc123', space: 'drive' },
});

if (!result.exists) {
  console.log('No workspace here');
} else if (result.encrypted) {
  console.log('Encrypted workspace — credential required to open');
} else {
  console.log('Unencrypted workspace — ready to join');
}
```

## Tenant Preferences

Workspace name is stored as a shareable preference at the tenant's location:

```typescript
import { saveTenantPrefs, loadTenantPrefs } from '@fyre-db/core';

const prefs = await loadTenantPrefs(adapter, tenant);
console.log(prefs?.name); // 'Shared Project'
```

When User B calls `join()`, the workspace name is imported from the shared location (for unencrypted workspaces).

## Removing Tenants

```typescript
// Remove from local list only (cloud data preserved)
await strata.tenants.remove(tenantId);

// Remove from list AND delete all data blobs
await strata.tenants.remove(tenantId, { purge: true });
```

## Manual Sync

Force an immediate sync cycle:

```typescript
const result = await strata.tenants.sync();
// result: { entitiesUpdated, conflictsResolved, partitionsSynced }
```

Runs `memory → local → cloud → local → memory`. Clears the dirty flag on success.

## Observing Tenant Changes

```typescript
// Observe active tenant
strata.observe('tenant').subscribe((tenant) => {
  if (tenant) {
    console.log(`Active: ${tenant.name} (encrypted: ${tenant.encrypted})`);
  } else {
    console.log('No tenant active');
  }
});
```

## Tenant Type

```typescript
type Tenant = {
  readonly id: string;
  readonly name: string;
  readonly encrypted: boolean;
  readonly meta: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
```
