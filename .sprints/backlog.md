# Backlog

| # | Epic | Component | Design Doc | Status |
|---|------|-----------|------------|--------|
| E1 | HLC — types, tick, compare | `hlc/` | `docs/persistence-sync.md` (HLC section) | done |
| E2 | Schema — defineEntity, ID gen, key strategies | `schema/` | `docs/schema-repository.md` (Entity Definition, Entity IDs, Key Strategies) | done |
| E3 | Adapter — BlobAdapter interface & types | `adapter/` | `docs/adapter.md` (Interface, meta, keys) | done |
| E4 | Adapter — MemoryBlobAdapter | `adapter/` | `docs/adapter.md` (MemoryBlobAdapter section) | done |
| E5 | Adapter — Transform pipeline | `adapter/` | `docs/adapter.md` (Transform Pipeline section) | done |
| E6 | Reactive — Event bus & Subject signals | `reactive/` | `docs/reactive.md` (Event Bus, Entity Type Subject) | done |
| E7 | Store — In-memory Map, lazy loading, dirty tracking | `store/` | `docs/schema-repository.md` (In-Memory Store) | done |
| E8 | Store — Debounced flush to adapter | `store/` | `docs/persistence-sync.md` (Flush Timing) | done |
| E9 | Persistence — JSON serialization & type markers | `persistence/` | `docs/persistence-sync.md` (Serialization, Type Markers) | done |
| E10 | Persistence — FNV-1a hashing | `persistence/` | `docs/persistence-sync.md` (Hashing section) | done |
| E11 | Persistence — Partition index | `persistence/` | `docs/persistence-sync.md` (Partition Index) | done |
| E12 | Repository — Repository\<T\> CRUD & query | `repo/` | `docs/schema-repository.md` (Repository Types, QueryOptions) | done |
| E13 | Repository — SingletonRepository\<T\> | `repo/` | `docs/schema-repository.md` (SingletonRepository) | done |
| E14 | Reactive — observe, observeQuery, distinctUntilChanged | `reactive/` | `docs/reactive.md` (observe, observeQuery, Change Detection) | done |
| E15 | Reactive — Batch writes & dispose | `reactive/` | `docs/reactive.md` (Batch Writes, Cleanup) | done |
| E16 | Tenant — Tenant model & TenantManager CRUD | `tenant/` | `docs/tenant.md` (Tenant Model, TenantManager API) | done |
| E17 | Tenant — Tenant list storage & sync | `tenant/` | `docs/tenant.md` (Tenant List Storage) | done |
| E18 | Tenant — Sharing, setup, marker blob | `tenant/` | `docs/tenant.md` (Sharing Flow, Marker Blob) | done |
| E19 | Sync — Partition diff & copy optimization | `sync/` | `docs/persistence-sync.md` (Sync Cycle steps 1-4, Copy optimization) | done |
| E20 | Sync — Bidirectional merge & HLC conflict resolution | `sync/` | `docs/persistence-sync.md` (Sync Cycle step 5, Conflict Resolution) | done |
| E21 | Sync — Tombstones & retention | `sync/` | `docs/persistence-sync.md` (Tombstones) | done |
| E22 | Sync — Three-phase model, scheduler & global lock | `sync/` | `docs/persistence-sync.md` (Three-Phase Model, Global Sync Lock) | done |
| E23 | Sync — Dirty tracking & sync events | `sync/` | `docs/persistence-sync.md` (Dirty Tracking, events) | done |
| E24 | Framework Entry Point — createFyreDb() | `src/` root | `docs/lifecycle.md`, `docs/architecture.md` | done |
| E25 | Framework — Graceful shutdown & dispose | `src/` root | `docs/persistence-sync.md` (Graceful shutdown), `docs/lifecycle.md` (Phase 9) | done |
| E26 | Unified Sync Refactor — BlobAdapter to JS objects, EntityStore as sync peer, syncBetween everywhere | `adapter/`, `store/`, `sync/`, `tenant/`, `src/` root | `docs/persistence-sync.md`, `docs/adapter.md`, `docs/architecture.md` | done |
| E27 | Shared Types & Typed BlobAdapter — normalize all adapter data to PartitionBlob, type BlobAdapter read/write, restructure `__fyredb` and `__tenants` as PartitionBlob, remove MarkerBlob/TenantListBlob types | `adapter/`, `persistence/`, `tenant/`, `store/`, `src/` root | `docs/adapter.md`, `docs/persistence-sync.md`, `docs/tenant.md` | done |
| E28 | StorageAdapter interface & AdapterBridge — define `StorageAdapter` (Uint8Array-based), `AdapterBridge` (wraps StorageAdapter → BlobAdapter with serialize/deserialize + optional crypto), `appId` namespacing for framework keys | `adapter/` | `docs/adapter.md` (StorageAdapter, AdapterBridge) | done |
| E29 | Encryption primitives — AES-256-GCM encrypt/decrypt, PBKDF2 key derivation, DEK generation, key wrapping, encryption header format, `InvalidEncryptionKeyError` | `adapter/` (`crypto/` sub-module or `adapter/crypto.ts`) | `docs/adapter.md` (Encryption section) | done |
| E30 | Encryption integration in createFyreDb — encryption config in FyreDbConfig, init-time DEK bootstrap, password change, enable/disable encryption lifecycle | `src/` root, `adapter/` | `docs/adapter.md`, `docs/lifecycle.md` | done |
| E31 | Schema migration — per-entity versioning, migration functions, on-load version check & upgrade, marker version tracking | `schema/`, `store/`, `sync/` | `docs/schema-repository.md` (Schema Migration section) | done |
| E32 | Migration Redesign — move `__v` to blob level, decouple migrations from `defineEntity`, blob-level transforms on `FyreDbConfig`, global version sequence, framework + app migrations on partition read (supersedes E31 approach) | `adapter/`, `schema/`, `store/`, `sync/`, `src/` root | `docs/schema-repository.md`, `docs/adapter.md`, `docs/lifecycle.md` | done |
| E33 | Sync Cleanup & Redesign — dirty tracking clearing after scheduler sync (DM-13), `sync()` return value (DM-14), sync event emission from `syncBetween`, deduplicate `hydrateFromCloud`/`syncCloudCycle`, rename `syncMemoryToLocal`, remove dead code (`flushAll`/`flushPartition`/`applyMergedToStore` test references) | `sync/`, `store/`, tests | `docs/persistence-sync.md` | done |
| E34 | gzip() Transform — implement `gzip()` adapter transform using Web Compression Streams API (DM-5 / DO-1), zero external deps, requires modern runtimes | `adapter/` | `docs/adapter.md` (Transform Pipeline section) | done |
| E35 | Documentation Gaps — tenant list merge `updatedAt` vs union (DM-17), undocumented `enableEncryption`/`disableEncryption`/`changePassword` (MD-5,6,7), undocumented `__tenant_prefs` blob (MD-13), undocumented `createFyreDbAsync` factory (MD-16) | docs | `docs/tenant.md`, `docs/lifecycle.md` | done |
| E36 | Test Cleanup — fix broken tests referencing removed functions: `flushPartition`/`flushAll` in migration and flush tests, `applyMergedToStore` in sync integration tests; rewrite to use `syncBetween` or direct `adapter.write()` | tests | — | done |

## Dependency Order

```
Layer 0 (no deps):    E1 (HLC), E3 (Adapter types)
Layer 1:              E2 (Schema → HLC), E4 (MemoryAdapter → E3), E6 (Reactive event bus)
Layer 2:              E5 (Transforms → E3), E9 (Serialize → E1), E10 (Hash → E1)
Layer 3:              E7 (Store → E3, E6), E11 (Partition index → E10)
Layer 4:              E8 (Flush → E7, E3), E12 (Repo → E7, E2, E6), E16 (Tenant CRUD → E3)
Layer 5:              E13 (SingletonRepo → E12), E14 (Observe → E6, E12), E17 (Tenant list → E16, E3)
Layer 6:              E15 (Batch/dispose → E14), E18 (Sharing → E17)
Layer 7:              E19 (Sync diff → E11, E7, E3), E20 (Sync merge → E19, E1)
Layer 8:              E21 (Tombstones → E20), E22 (Scheduler → E19), E23 (Dirty/events → E22)
Layer 9:              E24 (createFyreDb → all), E25 (Dispose → E24)
Layer 10:             E28 (StorageAdapter & AdapterBridge → E3, E24)
Layer 11:             E29 (Encryption primitives → E28)
Layer 12:             E30 (Encryption integration → E29, E24), E31 (Schema migration → E29)
Layer 13:             E32 (Migration Redesign → E28, supersedes E31), E33 (Sync Cleanup → E22, E23, E26)
Layer 13:             E34 (gzip Transform → E5, E28), E36 (Test Cleanup → E26)
Layer 14:             E35 (Documentation Gaps — no code deps, can run anytime)
```
