# FyreDb Sprint Newsletter

Append-only log of sprint outcomes. Most recent entry at the bottom.

---

## Sprint 1 — Foundation Layer (HLC, Adapter, Schema, Reactive) — 2026-03-23T20:30:00Z

### What's New
- **HLC module** (`src/hlc/`): `Hlc` type, `createHlc()`, `tickLocal()`, `tickRemote()`, `compareHlc()` — full Hybrid Logical Clock implementation with total ordering
- **Adapter module** (`src/adapter/`): `BlobAdapter` interface with `read`/`write`/`delete`/`list` async methods, `meta` parameter support, blob key constants/helpers, and `createMemoryBlobAdapter()` with defensive-copy semantics
- **Schema module** (`src/schema/`): `BaseEntity` type, `EntityDefinition<T>`, `generateId()` (8-char alphanumeric), `formatEntityId()`, key strategies (`partitioned`, `global`, `singleton`), `defineEntity<T>()` with `deriveId` validation
- **Reactive module** (`src/reactive/`): `EntityEvent` type, `EntityEventListener` callback, `EntityEventBus` (on/off/emit), `createEventBus()` with synchronous listener dispatch

### What We Support
- HLC creation, local/remote tick, and deterministic comparison
- Pluggable blob storage via `BlobAdapter` interface
- In-memory blob adapter for testing and offline use
- Entity definition with flexible key strategies and ID generation
- Reactive event bus for entity change notifications

### Quality
- Unit tests: 39 passing
- Integration tests: 0 (not yet applicable)
- Known issues: 0

### Coverage Improvements
- HLC: createHlc, tickLocal (timestamp advance + counter increment), tickRemote (merge scenarios), compareHlc (all tiebreaker levels)
- MemoryBlobAdapter: read/write round-trip, missing key, defensive copy isolation, delete true/false, list prefix filtering
- Schema: defineEntity definition shape, generateId format/uniqueness, all key strategies, deriveId dot rejection
- Event bus: on/emit delivery, off removal, multiple listeners, no-listener safety, duplicate registration

---

## Sprint 2 — Transforms, Persistence & Store — 2026-03-23T21:00:00Z

### What's New
- **Transform pipeline** (`src/adapter/`): `BlobTransform` type with `encode`/`decode`, `applyTransforms()` for forward-order writes, `reverseTransforms()` for reverse-order reads
- **JSON serialization** (`src/persistence/`): `serialize`/`deserialize` with type marker support — `Date` values round-trip via `{ __t: 'D', v: isoString }` markers, `TextEncoder`/`TextDecoder` byte conversion
- **FNV-1a hashing** (`src/persistence/`): `fnv1a()` 32-bit hash, `fnv1aAppend()` for incremental hashing, `partitionHash()` for deterministic partition content hashing with sorted IDs and tombstone support
- **In-memory store** (`src/store/`): `createStore()` with nested `Map<string, Map<string, unknown>>`, CRUD operations (`get`/`set`/`delete`), dirty tracking (`getDirtyKeys`/`clearDirty`), lazy loading via `loadPartition()`, partition discovery with `getAllPartitionKeys()`
- **Partition index** (`src/persistence/`): `PartitionIndexEntry` and `PartitionIndex` types, `loadPartitionIndex()`/`savePartitionIndex()` for adapter-backed persistence, `updatePartitionIndexEntry()` for hash/count/timestamp updates

### What We Support
- HLC creation, local/remote tick, and deterministic comparison
- Pluggable blob storage via `BlobAdapter` interface
- In-memory blob adapter for testing and offline use
- Entity definition with flexible key strategies and ID generation
- Reactive event bus for entity change notifications
- Transform pipeline for composable blob encoding/decoding
- JSON serialization with Date type preservation
- FNV-1a content hashing for partition change detection
- In-memory entity store with dirty tracking and lazy loading
- Partition index for tracking partition metadata

### Quality
- Unit tests: 85 passing (45 new)
- Integration tests: 0 (not yet applicable)
- Known issues: 0

### Coverage Improvements
- Transforms: identity passthrough, chained forward/reverse order, empty transform array
- Serialization: Date round-trip, nested Date fields, no-Date passthrough, Uint8Array fidelity, type marker format
- Hashing: known FNV-1a test vectors, deterministic output, HLC sensitivity, sort-order independence, empty input
- Store: CRUD get/set/delete, auto-creating partitions, dirty tracking lifecycle, partition key prefix filtering, lazy load caching
- Partition index: missing blob returns empty, save/load round-trip, create/update entries, key format validation

---

## Sprint 3 — Store Flush, Repository CRUD & Tenant Manager — 2026-03-23T21:30:00Z

### What's New
- **Debounced flush** (`src/store/`): `flushPartition()` serializes dirty partition data (entities + tombstone placeholders) to blob format and writes via adapter; `flushAll()` iterates all dirty keys and clears dirty flags after successful write; `createFlushScheduler()` with configurable idle debounce (`schedule`/`flush`/`dispose` lifecycle)
- **Repository\<T\> CRUD & query** (`src/repo/`): `createRepository<T>()` factory bound to entity definition; full CRUD — `get(id)`, `save(entity)`, `saveMany(entities)`, `delete(id)`, `deleteMany(ids)` with HLC stamping, ID generation, and event emission; query pipeline — `where` (shallow partial match), `range` (gt/gte/lt/lte), `orderBy` (multi-field asc/desc), `offset`/`limit` pagination
- **TenantManager** (`src/tenant/`): `createTenantManager()` with full tenant lifecycle — `create` (generates ID, writes `__fyredb` marker blob), `load` (sets active tenant on `activeTenant$`), `setup` (detects existing workspace via marker blob, derives deterministic ID), `delink` (local-only removal), `delete` (removes local + cloud data), `list` (cached `__tenants` blob persistence)

### Design Decisions
- **Subscribable\<T\>** used instead of rxjs `Observable` for `activeTenant$` — keeps the framework dependency-light
- **Flush includes tombstone placeholder** — partition blob format reserves `deleted` key for future tombstone sync support

### What We Support
- HLC creation, local/remote tick, and deterministic comparison
- Pluggable blob storage via `BlobAdapter` interface
- In-memory blob adapter for testing and offline use
- Entity definition with flexible key strategies and ID generation
- Reactive event bus for entity change notifications
- Transform pipeline for composable blob encoding/decoding
- JSON serialization with Date type preservation
- FNV-1a content hashing for partition change detection
- In-memory entity store with dirty tracking and lazy loading
- Partition index for tracking partition metadata
- Debounced flush scheduler with manual flush and graceful dispose
- Repository CRUD with HLC-stamped writes and query pipeline
- Multi-tenant management with create/load/setup/delink/delete lifecycle

### Quality
- Unit tests: 139 passing (54 new)
- Integration tests: 0 (not yet applicable)
- Known issues: 0

### Coverage Improvements
- Flush: flushPartition serialization, flushAll dirty iteration and clearing, scheduler debounce timing, manual flush, dispose lifecycle
- Repository: get by ID, save with HLC stamping and ID generation, saveMany batch, delete/deleteMany, query where filtering, range comparisons, orderBy multi-field sorting, offset/limit pagination
- TenantManager: create with marker blob, load and activeTenant$ update, setup workspace detection, delink local-only removal, delete with cloud cleanup, list caching from __tenants blob

---

## Sprint 4 — Reactive Observe, SingletonRepository & Tenant Sync — 2026-03-23T22:00:00Z

### What's New
- **Reactive observe** (`src/reactive/`): `observe(id)` returns `Observable<T | undefined>` with per-entity-type `Subject<void>` change signal; `observeQuery(opts?)` returns `Observable<ReadonlyArray<T>>` for live query results; `distinctUntilChanged` with version-based comparators for both single-entity and query-result streams
- **SingletonRepository\<T\>** (`src/repo/`): `createSingletonRepository<T>()` with deterministic ID (`entityName._.entityName`), delegates to internal `Repository<T>`; exposes `get()`, `save()`, `delete()`, `observe()` — all routed through the singleton's fixed ID
- **Tenant list sync** (`src/tenant/`): `mergeTenantLists(local, remote)` produces union by tenant ID with latest-`updatedAt` wins; `pushTenantList()` and `pullTenantList()` for bidirectional sync between local and cloud adapters; `saveTenantPrefs()`/`loadTenantPrefs()` for cross-device tenant preference sharing
- Added `rxjs` dependency for Observable-based reactive streams

### What We Support
- HLC creation, local/remote tick, and deterministic comparison
- Pluggable blob storage via `BlobAdapter` interface
- In-memory blob adapter for testing and offline use
- Entity definition with flexible key strategies and ID generation
- Reactive event bus for entity change notifications
- Transform pipeline for composable blob encoding/decoding
- JSON serialization with Date type preservation
- FNV-1a content hashing for partition change detection
- In-memory entity store with dirty tracking and lazy loading
- Partition index for tracking partition metadata
- Debounced flush scheduler with manual flush and graceful dispose
- Repository CRUD with HLC-stamped writes and query pipeline
- Multi-tenant management with create/load/setup/delink/delete lifecycle
- Reactive observe streams for single entities and query results with change detection
- SingletonRepository for single-instance entities with deterministic IDs
- Tenant list merge and bidirectional push/pull sync with preference sharing

### Quality
- Unit tests: 173 passing (34 new)
- Integration tests: 0 (not yet applicable)
- Known issues: 0

### Coverage Improvements
- Reactive observe: per-entity-type Subject wiring, observe(id) emits on change, observeQuery live results, distinctUntilChanged entity comparator (id + version), query results comparator (length + element-wise)
- SingletonRepository: deterministic ID generation, get/save/delete delegation, observe via change signal, singleton key strategy enforcement
- Tenant sync: mergeTenantLists union by ID with latest-updatedAt wins, pushTenantList local-to-cloud, pullTenantList cloud-to-local merge, saveTenantPrefs/loadTenantPrefs round-trip

---

## Sprint 5 — Reactive Batch/Dispose & Tenant Sharing — 2026-03-23T22:30:00Z

### What's New
- **Batch writes** (`src/reactive/`): `saveMany()` and `deleteMany()` now batch all Map writes and emit a single change signal per batch instead of per-entity — 100 saves produce 1 signal and 1 observer re-scan
- **Repository dispose** (`src/reactive/`): `dispose()` on Repository completes the `Subject`, removes the event bus listener via `off()`, and guards against post-dispose save/delete/observe operations; SingletonRepository dispose delegates correctly
- **MarkerBlob** (`src/tenant/`): `MarkerBlob` type with version, createdAt, and entityTypes; `writeMarkerBlob()` creates and persists marker; `readMarkerBlob()` reads and deserializes; `validateMarkerBlob()` checks version compatibility
- **Tenant sharing flow** (`src/tenant/`): `TenantManager.create()` now writes a typed marker blob with entity type names; `TenantManager.setup()` reads and validates the marker blob, loads tenant prefs from the shared location, and derives a deterministic tenant ID

### What We Support
- HLC creation, local/remote tick, and deterministic comparison
- Pluggable blob storage via `BlobAdapter` interface
- In-memory blob adapter for testing and offline use
- Entity definition with flexible key strategies and ID generation
- Reactive event bus for entity change notifications
- Transform pipeline for composable blob encoding/decoding
- JSON serialization with Date type preservation
- FNV-1a content hashing for partition change detection
- In-memory entity store with dirty tracking and lazy loading
- Partition index for tracking partition metadata
- Debounced flush scheduler with manual flush and graceful dispose
- Repository CRUD with HLC-stamped writes and query pipeline
- Multi-tenant management with create/load/setup/delink/delete lifecycle
- Reactive observe streams for single entities and query results with change detection
- SingletonRepository for single-instance entities with deterministic IDs
- Tenant list merge and bidirectional push/pull sync with preference sharing
- Batch writes with single-signal emission for saveMany/deleteMany
- Repository and SingletonRepository dispose with observer completion and listener cleanup
- MarkerBlob creation, reading, and version validation for workspace detection
- Tenant sharing flow with marker blob validation and deterministic ID derivation

### Quality
- Unit tests: 207 passing (34 new)
- Integration tests: 0 (not yet applicable)
- Known issues: 0

### Coverage Improvements
- Batch writes: saveMany emits exactly one signal (not N), deleteMany emits exactly one signal, observers re-scan once per batch, individual save/delete still emit immediately
- Dispose: dispose() completes active Observable subscriptions, disposed Repository rejects further operations, event bus listener removed after dispose, SingletonRepository dispose delegates correctly
- MarkerBlob: writeMarkerBlob/readMarkerBlob round-trip, readMarkerBlob returns undefined for missing blob, validateMarkerBlob accepts version 1 and rejects unsupported versions, entity types array persisted correctly
- Sharing flow: setup() reads marker blob and detects existing workspace, derives same tenant ID via deriveTenantId, merges tenant prefs into local list, rejects location without valid marker blob

---

## Sprint 6 — Sync Engine: Diff, Copy & Merge — 2026-03-23T23:00:00Z

### What's New
- **Partition diff** (`src/sync/`): `loadIndexPair()` fetches local and cloud partition indexes in parallel; `diffPartitions()` categorizes partition keys into `localOnly`, `cloudOnly`, `diverged`, and `unchanged` buckets by comparing FNV-1a hashes
- **Copy optimization** (`src/sync/`): `copyPartitionToCloud()` and `copyPartitionToLocal()` transfer partition blobs directly without deserialization; `syncCopyPhase()` orchestrates bulk copy for all `localOnly` and `cloudOnly` partitions
- **Conflict resolution** (`src/sync/`): `resolveConflict()` implements HLC last-writer-wins (timestamp → counter → nodeId tiebreaker); `resolveEntityTombstone()` resolves entity-vs-delete conflicts via HLC comparison
- **Bidirectional merge** (`src/sync/`): `diffEntityMaps()` categorizes entities across local/cloud including tombstones; `mergePartition()` deserializes both blobs, resolves all conflicts, produces merged entity and tombstone maps; `syncMergePhase()` processes all diverged partitions and writes merged results to both adapters
- **Post-sync housekeeping** (`src/sync/`): `updateIndexesAfterSync()` recomputes partition hashes and persists updated indexes; `applyMergedToStore()` upserts merged entities into the in-memory store and emits reactive events

### What We Support
- HLC creation, local/remote tick, and deterministic comparison
- Pluggable blob storage via `BlobAdapter` interface
- In-memory blob adapter for testing and offline use
- Entity definition with flexible key strategies and ID generation
- Reactive event bus for entity change notifications
- Transform pipeline for composable blob encoding/decoding
- JSON serialization with Date type preservation
- FNV-1a content hashing for partition change detection
- In-memory entity store with dirty tracking and lazy loading
- Partition index for tracking partition metadata
- Debounced flush scheduler with manual flush and graceful dispose
- Repository CRUD with HLC-stamped writes and query pipeline
- Multi-tenant management with create/load/setup/delink/delete lifecycle
- Reactive observe streams for single entities and query results with change detection
- SingletonRepository for single-instance entities with deterministic IDs
- Tenant list merge and bidirectional push/pull sync with preference sharing
- Batch writes with single-signal emission for saveMany/deleteMany
- Repository and SingletonRepository dispose with observer completion and listener cleanup
- MarkerBlob creation, reading, and version validation for workspace detection
- Tenant sharing flow with marker blob validation and deterministic ID derivation
- Partition diff and hash-based copy optimization for sync
- Bidirectional merge with HLC last-writer-wins conflict resolution
- Entity-vs-tombstone resolution and merged store application with reactive events

### Quality
- Unit tests: 256 passing (49 new)
- Integration tests: 0 (not yet applicable)
- Known issues: 0

### Coverage Improvements
- Diff: all partitions unchanged, all local-only, all cloud-only, mixed categories, empty indexes, single diverged partition with hash mismatch
- Copy: copyPartitionToCloud/ToLocal blob transfer, no-op on null source, syncCopyPhase processes all localOnly and cloudOnly partitions
- Conflict resolution: resolveConflict picks higher timestamp, counter tiebreaker, nodeId string tiebreaker; resolveEntityTombstone both directions
- Partition merge: mergePartition includes local-only entities, cloud-only entities, HLC-resolved conflicts, tombstone vs entity both directions, symmetric merged results
- Full sync integration: syncMergePhase processes all diverged keys, updateIndexesAfterSync recomputes hashes and persists both indexes, applyMergedToStore upserts and emits entity events

---

## Sprint 7 — Sync: Tombstones, Scheduler & Dirty Tracking — 2026-03-23T23:30:00Z

### What's New
- **Tombstones** (`src/sync/`, `src/store/`): `setTombstone()`/`getTombstones()` in store for recording deleted entity HLCs; `purgeStaleTombstones()` with 90-day default retention; flush/load integration to persist and restore tombstones from blob `deleted` section
- **Three-phase sync** (`src/sync/`): `hydrateFromCloud()` downloads cloud partitions to local and memory; `hydrateFromLocal()` fallback when cloud is unreachable; `createSyncScheduler()` with configurable `localFlushIntervalMs`/`cloudSyncIntervalMs` and periodic sync via sync lock; `syncNow()` for immediate manual sync
- **Sync lock** (`src/sync/`): `createSyncLock()` — global lock with sequential queue execution, duplicate dedup, `drain()` and `dispose()` lifecycle
- **Sync events** (`src/sync/`): `createSyncEventEmitter()` with typed `SyncEvent` union (`sync-started`, `sync-completed`, `sync-failed`, `cloud-unreachable`); integrated with sync lock lifecycle
- **Dirty tracking** (`src/sync/`): `createDirtyTracker()` with `isDirty` getter and `isDirty$` Observable via `distinctUntilChanged`; marks dirty on store writes, clears on successful local→cloud sync

### What We Support
- HLC creation, local/remote tick, and deterministic comparison
- Pluggable blob storage via `BlobAdapter` interface
- In-memory blob adapter for testing and offline use
- Entity definition with flexible key strategies and ID generation
- Reactive event bus for entity change notifications
- Transform pipeline for composable blob encoding/decoding
- JSON serialization with Date type preservation
- FNV-1a content hashing for partition change detection
- In-memory entity store with dirty tracking and lazy loading
- Partition index for tracking partition metadata
- Debounced flush scheduler with manual flush and graceful dispose
- Repository CRUD with HLC-stamped writes and query pipeline
- Multi-tenant management with create/load/setup/delink/delete lifecycle
- Reactive observe streams for single entities and query results with change detection
- SingletonRepository for single-instance entities with deterministic IDs
- Tenant list merge and bidirectional push/pull sync with preference sharing
- Batch writes with single-signal emission for saveMany/deleteMany
- Repository and SingletonRepository dispose with observer completion and listener cleanup
- MarkerBlob creation, reading, and version validation for workspace detection
- Tenant sharing flow with marker blob validation and deterministic ID derivation
- Partition diff and hash-based copy optimization for sync
- Bidirectional merge with HLC last-writer-wins conflict resolution
- Entity-vs-tombstone resolution and merged store application with reactive events
- Tombstone storage, retention purging (90-day default), and flush/load integration
- Three-phase sync model with cloud/local hydration and periodic scheduling
- Global sync lock with sequential execution and duplicate dedup
- Sync event emitter with typed lifecycle events
- Dirty tracking with reactive Observable for unsaved-to-cloud state

### Quality
- Unit tests: 308 passing (52 new)
- Integration tests: 0 (not yet applicable)
- Known issues: 0

### Coverage Improvements
- Tombstones: setTombstone/getTombstones round-trip, Repository.delete records tombstone HLC, purgeStaleTombstones removes expired entries and keeps recent, flush includes tombstones in blob, loadPartition restores tombstones from blob
- Sync lock: createSyncLock sequential execution, duplicate dedup returns same promise, drain waits for in-flight, dispose rejects further enqueue
- Hydration: hydrateFromCloud downloads all partitions to local and memory, hydrateFromLocal loads from local adapter only, handles missing/empty indexes
- Scheduler: createSyncScheduler starts/stops periodic timers, configurable intervals, dispose drains queue and stops timers
- Sync events: createSyncEventEmitter on/off/emit, sync-started/completed/failed/cloud-unreachable fired at correct lifecycle points
- Dirty tracking: createDirtyTracker marks dirty on write, clears on cloud sync, isDirty$ emits distinct state changes

---

## Sprint 8 — Framework Entry Point & Graceful Shutdown (Final Sprint) — 2026-03-24T00:00:00Z

### What's New
- **createFyreDb() entry point** (`src/`): `createFyreDb(config)` wires all framework modules — HLC, event bus, in-memory store, flush scheduler, repositories, sync infrastructure, and tenant manager; `FyreDbConfig` and `FyreDb` types define the public API surface; `validateEntityDefinitions()` rejects duplicates and empty lists
- **Repository accessor** (`src/`): `fyredb.repo(def)` retrieves `Repository<T>` or `SingletonRepository<T>` by entity definition reference; repositories created per key strategy during initialization
- **Sync wiring** (`src/`): `fyredb.sync()` delegates to `syncNow()` via sync lock; `fyredb.isDirty`/`isDirty$` expose dirty tracker state; `onSyncEvent`/`offSyncEvent` wire to typed sync event emitter
- **Hydrate-on-tenant-load** (`src/`): `tenants.load()` triggers Phase 1 hydrate — cloud hydration with `cloud-unreachable` fallback to local; sync scheduler starts after hydration completes
- **Graceful dispose** (`src/`): `fyredb.dispose()` performs orderly shutdown — stop scheduler → drain sync lock → flush all dirty partitions → dispose all repositories → cleanup; post-dispose guards reject further operations; idempotent dispose returns same promise on subsequent calls
- **Barrel exports** (`src/`): root `index.ts` re-exports `createFyreDb`, `FyreDbConfig`, `FyreDb`, `FyreDbOptions`, `defineEntity`, `EntityDefinition`, `BlobAdapter`, `BlobTransform`, and all public API types

### What We Support
- HLC creation, local/remote tick, and deterministic comparison
- Pluggable blob storage via `BlobAdapter` interface
- In-memory blob adapter for testing and offline use
- Entity definition with flexible key strategies and ID generation
- Reactive event bus for entity change notifications
- Transform pipeline for composable blob encoding/decoding
- JSON serialization with Date type preservation
- FNV-1a content hashing for partition change detection
- In-memory entity store with dirty tracking and lazy loading
- Partition index for tracking partition metadata
- Debounced flush scheduler with manual flush and graceful dispose
- Repository CRUD with HLC-stamped writes and query pipeline
- Multi-tenant management with create/load/setup/delink/delete lifecycle
- Reactive observe streams for single entities and query results with change detection
- SingletonRepository for single-instance entities with deterministic IDs
- Tenant list merge and bidirectional push/pull sync with preference sharing
- Batch writes with single-signal emission for saveMany/deleteMany
- Repository and SingletonRepository dispose with observer completion and listener cleanup
- MarkerBlob creation, reading, and version validation for workspace detection
- Tenant sharing flow with marker blob validation and deterministic ID derivation
- Partition diff and hash-based copy optimization for sync
- Bidirectional merge with HLC last-writer-wins conflict resolution
- Entity-vs-tombstone resolution and merged store application with reactive events
- Tombstone storage, retention purging (90-day default), and flush/load integration
- Three-phase sync model with cloud/local hydration and periodic scheduling
- Global sync lock with sequential execution and duplicate dedup
- Sync event emitter with typed lifecycle events
- Dirty tracking with reactive Observable for unsaved-to-cloud state
- **createFyreDb() single entry point wiring all modules into a cohesive framework instance**
- **Graceful dispose with orderly shutdown, post-dispose guards, and idempotent dispose**

### Quality
- Unit tests: 339 passing (31 new)
- Integration tests: 0 (not yet applicable)
- Known issues: 0

### Coverage Improvements
- createFyreDb: validates entity definitions (rejects duplicates, empty list), creates HLC/store/eventBus/flushScheduler, wires sync infrastructure (lock, events, dirty tracker, scheduler), creates tenant manager
- Repository accessor: repo(def) returns correct Repository or SingletonRepository by key strategy, throws for unknown definition
- Sync wiring: fyredb.sync() delegates through sync lock, rejects without tenant or cloud adapter, isDirty/isDirty$ expose dirty tracker
- Hydrate-on-tenant-load: tenants.load() triggers cloud hydration, falls back to local on cloud-unreachable, starts sync scheduler post-hydrate
- Dispose: orderly shutdown sequence (stop scheduler → drain lock → flush → dispose repos → cleanup), post-dispose guards reject sync/repo/load, idempotent dispose returns same promise

### BACKLOG COMPLETE
All 25 epics delivered across 8 sprints. The FyreDb framework is feature-complete per the design specifications.
