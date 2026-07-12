# Sync & Offline

## Overview

fyre-db syncs data between three layers: **memory** (in-app), **local** (on-device persistent storage), and **cloud** (remote shared storage). Sync is bidirectional, conflict-free, and works offline.

## Enabling Cloud Sync

Pass a `cloudAdapter` to enable sync:

```typescript
const fyredb = new FyreDb({
  appId: 'my-app',
  entities: [taskDef],
  localAdapter: myLocalStorage,
  cloudAdapter: myCloudAdapter,   // enables cloud sync
  deviceId: 'device-1',
});
```

Without a `cloudAdapter`, data is persisted locally only.

## Sync Phases

### 1. Hydrate (on tenant open)

When you call `fyredb.tenants.open(id)`, the framework:
1. Syncs cloud → local (if cloud adapter configured)
2. Syncs local → memory (loads entities into Map)
3. If cloud is unreachable, loads from local only and emits a `sync-failed` event

### 2. Edit-driven (background)

| Direction | Trigger | Default window |
|-----------|---------|----------------|
| memory → local | debounced on user edits | 500ms settle / 3s ceiling |
| memory → local → cloud → memory | debounced on user edits | 10s settle / 60s ceiling |
| local → cloud → memory (pull backstop) | periodic timer `cloudPullIntervalMs` | 5 minutes |

User edits arm both debouncers; the cloud cycle also runs on a periodic pull
timer so an idle device still receives remote changes. After each cloud cycle,
local → memory merges remote changes back into the app.

```typescript
const fyredb = new FyreDb({
  // ...
  options: {
    localFlushDebounceMs: 500,     // default: 500ms
    localFlushMaxWaitMs: 3000,     // default: 3s
    cloudSyncDebounceMs: 10000,    // default: 10s
    cloudSyncMaxWaitMs: 60000,     // default: 60s
    cloudPullIntervalMs: 300000,   // default: 5m
  },
});
```

### 3. Manual

```typescript
const result = await fyredb.tenants.sync();
// result: { entitiesUpdated, conflictsResolved, partitionsSynced }
```

Forces immediate `memory → local → cloud → local → memory` sync. Clears the dirty flag on success.

## Conflict Resolution

When two devices edit the same entity, the framework resolves conflicts automatically using **last-writer-wins** via the Hybrid Logical Clock (HLC):

```
Device A saves entity X at HLC { timestamp: 1000, counter: 1, nodeId: 'phoneA' }
Device B saves entity X at HLC { timestamp: 1001, counter: 0, nodeId: 'phoneB' }

→ Device B wins (higher timestamp)
→ Both sides updated to Device B's version
```

Tie-breaking order: timestamp → counter → nodeId (string comparison). Always deterministic — every device reaches the same result.

### Entity vs Tombstone

When one device updates an entity and another deletes it, the HLC decides:
- Entity HLC > tombstone HLC → entity survives
- Entity HLC ≤ tombstone HLC → deletion wins

## Sync Events

```typescript
fyredb.observe('sync').subscribe((event) => {
  switch (event.type) {
    case 'sync-started':
      console.log(`Syncing ${event.source} → ${event.target}`);
      break;
    case 'sync-completed':
      console.log(`Synced: ${event.result.partitionsSynced} partitions`);
      break;
    case 'sync-failed':
      console.error('Sync failed:', event.error);
      break;
  }
});
```

## Dirty Tracking

Track whether data has unsaved changes:

```typescript
// Sync check
if (fyredb.isDirty) {
  showUnsavedIndicator();
}

// Reactive observable
fyredb.observe('dirty').subscribe((dirty) => {
  setUnsavedBadge(dirty);
});
```

The dirty flag is set by user mutations (not sync-imported changes) and cleared after a successful cloud sync cycle.

## Tombstones

When you delete an entity, a tombstone (deletion marker with HLC) is stored alongside the entity data. This ensures deletes propagate correctly across devices during sync.

Without tombstones: Device A deletes entity → syncs → cloud removes it. Device B syncs → doesn't see it in cloud → has it locally → re-uploads it. Delete is lost.

Tombstones expire after `tombstoneRetentionMs` (default: 7 days). After expiry, they're pruned from blobs on read.

## Offline

When the cloud adapter is unreachable:
- Data is persisted locally (memory → local flush continues)
- `sync-failed` event fires
- Background sync retries at the configured interval
- When connectivity returns, the next sync merges all changes

No data loss — local storage is the fallback.

## How Sync Works Internally

The `syncBetween(adapterA, adapterB)` function handles all sync directions:

1. **Load indexes** from both adapters (stored in marker blob under `__system.marker.indexes`)
2. **Diff partitions** by comparing hash + count + deletedCount per partition
3. **A-only partitions** → copy to B
4. **B-only partitions** → copy to A
5. **Diverged partitions** → load both blobs, merge per-entity using HLC resolution
6. **Write** merged results to both adapters (B always, A only if not stale)
7. **Update indexes** on both sides

Sync is serialized — one operation at a time via a dedup queue. If the same `(source, target)` pair is already queued, the caller gets the existing promise instead of enqueuing a duplicate.
