<!-- Active: sprint-migration-sync-cleanup -->

## Sprint — Migration Redesign & Sync Cleanup
Started: 2026-03-27T14:00:00Z

Epics: E32 (Migration Redesign), E33 (Sync Cleanup & Redesign)

### Phase 1 — Migration Redesign (E32)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 1 | Add `__v?: number` to `PartitionBlob` type | E32 | developer | done | plan | 2026-03-27T14:00:00Z | 2026-03-27T14:05:00Z |
| 2 | Create `BlobMigration` type and `migrateBlob()` function, replace entity-level `migrateEntity` | E32 | developer | done | plan | 2026-03-27T14:00:00Z | 2026-03-27T14:05:00Z |
| 3 | Add `migrations?: ReadonlyArray<BlobMigration>` to `FyreDbConfig` and wire through FyreDb class | E32 | developer | done | plan | 2026-03-27T14:00:00Z | 2026-03-27T14:05:00Z |
| 4 | Remove entity-level `version`/`migrations` from `EntityDefinitionOptions`, `EntityDefinition`, and `defineEntity` | E32 | developer | done | plan | 2026-03-27T14:00:00Z | 2026-03-27T14:05:00Z |
| 5 | Update `loadPartitionFromAdapter` to use blob-level migration instead of entity-level | E32 | developer | done | plan | 2026-03-27T14:00:00Z | 2026-03-27T14:05:00Z |
| 6 | Update barrel exports in `schema/index.ts` | E32 | developer | done | plan | 2026-03-27T14:00:00Z | 2026-03-27T14:05:00Z |

### Phase 2 — Sync Cleanup & Redesign (E33)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 7 | Fix recursive `loadTenant` bug: change `this.loadTenant(tenantId)` → `this.tenants.load(tenantId)` | E33 | developer | done | plan | 2026-03-27T14:00:00Z | 2026-03-27T14:10:00Z |
| 8 | DM-13: Pass `DirtyTracker` to `SyncScheduler`, clear dirty only after successful cloud sync | E33 | developer | done | plan | 2026-03-27T14:00:00Z | 2026-03-27T14:10:00Z |
| 9 | DM-14: Update `syncNow` to return `SyncResult`, use real values in `FyreDb.sync()` | E33 | developer | done | plan | 2026-03-27T14:00:00Z | 2026-03-27T14:10:00Z |
| 10 | Emit sync events from scheduler cloud sync cycle (pass `SyncEventEmitter` to scheduler) | E33 | developer | done | plan | 2026-03-27T14:00:00Z | 2026-03-27T14:10:00Z |
| 11 | Deduplicate: inline `hydrateFromCloud`, use `syncBetween` directly in `FyreDb.loadTenant` | E33 | developer | done | plan | 2026-03-27T14:00:00Z | 2026-03-27T14:10:00Z |
| 12 | Rename `syncMemoryToLocal` → `flushToLocal`, remove `hydrateFromCloud` export | E33 | developer | done | plan | 2026-03-27T14:00:00Z | 2026-03-27T14:10:00Z |

### Phase 3 — Review

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 13 | Review all E32 migration redesign changes | E32 | reviewer | done | plan | 2026-03-27T14:00:00Z | 2026-03-27T14:30:00Z |
| 14 | Review all E33 sync cleanup changes | E33 | reviewer | done | plan | 2026-03-27T14:00:00Z | 2026-03-27T14:30:00Z |

### Phase 4 — Unit Tests

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 15 | Update migration tests for blob-level approach | E32 | unit-tester | done | test | 2026-03-27T14:00:00Z | 2026-03-27T14:35:00Z |
| 16 | Update sync scheduler and fyredb tests for DM-13, DM-14 changes | E33 | unit-tester | done | test | 2026-03-27T14:00:00Z | 2026-03-27T14:35:00Z |

### Phase 5 — Integration Tests

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 17 | Update integration migration tests for blob-level approach | E32 | integration-tester | done | test | 2026-03-27T14:00:00Z | 2026-03-27T14:35:00Z |
| 18 | Build and run all tests to verify sprint changes | E33 | integration-tester | done | test | 2026-03-27T14:00:00Z | 2026-03-27T14:40:00Z |

---

<!-- Previous: sprint-test-cleanup-docs -->

## Sprint — Test Cleanup & Documentation Gaps
Started: 2026-03-27T09:00:00Z

Epics: E36 (Test Cleanup), E35 (Documentation Gaps)

### Phase 1 — Test Cleanup (E36)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 1 | Remove `flushPartition` and `flushAll` test blocks from `tests/store/flush.test.ts`, fix imports | E36 | developer | done | plan | 2026-03-27T09:00:00Z | 2026-03-27T09:10:00Z |
| 2 | Remove `flushPartition` tests from `tests/store/flush-tombstone.test.ts`, fix imports | E36 | developer | done | plan | 2026-03-27T09:00:00Z | 2026-03-27T09:10:00Z |
| 3 | Rewrite `tests/integration/migration.test.ts` to use `adapter.write()` instead of `flushPartition` | E36 | developer | done | plan | 2026-03-27T09:00:00Z | 2026-03-27T09:10:00Z |
| 4 | Remove `applyMergedToStore` describe block from `tests/sync/sync-integration.test.ts`, fix imports | E36 | developer | done | plan | 2026-03-27T09:00:00Z | 2026-03-27T09:10:00Z |

### Phase 2 — Documentation Gaps (E35)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 5 | DM-17: Update `docs/tenant.md` tenant list merge to say `updatedAt` comparison | E35 | developer | done | plan | 2026-03-27T09:00:00Z | 2026-03-27T09:15:00Z |
| 6 | MD-5,6,7: Add encryption method docs to `docs/lifecycle.md` | E35 | developer | done | plan | 2026-03-27T09:00:00Z | 2026-03-27T09:15:00Z |
| 7 | MD-13: Add `__tenant_prefs` section to `docs/tenant.md` | E35 | developer | done | plan | 2026-03-27T09:00:00Z | 2026-03-27T09:15:00Z |
| 8 | MD-16: Document `createFyreDbAsync` in `docs/lifecycle.md` | E35 | developer | done | plan | 2026-03-27T09:00:00Z | 2026-03-27T09:15:00Z |
| 9 | Strike through DM-17, MD-5, MD-6, MD-7, MD-13, MD-16 in `docs/doc-vs-implementation.md` | E35 | developer | done | plan | 2026-03-27T09:00:00Z | 2026-03-27T09:15:00Z |

### Phase 3 — Review & Verification

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 10 | Review all test cleanup changes | E36 | reviewer | done | plan | 2026-03-27T09:00:00Z | 2026-03-27T09:18:00Z |
| 11 | Review all documentation changes | E35 | reviewer | done | plan | 2026-03-27T09:00:00Z | 2026-03-27T09:18:00Z |

### Phase 4 — Unit Tests

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 12 | Build and run all tests to verify cleanup | E36 | unit-tester | done | test | 2026-03-27T09:00:00Z | 2026-03-27T09:20:00Z |

---

<!-- Previous: sprint-encryption-migration -->

## Sprint — Encryption & Migration
Started: 2026-03-26T10:00:00Z

Epics: E28 (StorageAdapter & AdapterBridge), E29 (Encryption primitives), E30 (Encryption integration), E31 (Schema migration)

Dependency order: E28 → E29 → E30, E29 → E31. Phase 1 (E28) must complete before Phase 2 (E29). Phase 2 must complete before Phase 3 (E30) and Phase 4 (E31). Phase 3 and Phase 4 are independent of each other.

### Phase 1 — StorageAdapter Interface & AdapterBridge (E28)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 1 | Define `StorageAdapter` interface in `src/adapter/types.ts` — `read(tenant, key): Promise<Uint8Array \| null>`, `write(tenant, key, data: Uint8Array): Promise<void>`, `delete(tenant, key): Promise<void>`, `list(tenant, prefix): Promise<string[]>` with `tenant: Tenant \| undefined` param | E28 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:15:00Z |
| 2 | Add `appId: string` required field to `FyreDbConfig` — used to namespace blob keys in `AdapterBridge` and in KEK derivation for encryption | E28 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:15:00Z |
| 3 | Implement core `AdapterBridge` class in `src/adapter/bridge.ts` — wraps `StorageAdapter` to implement `BlobAdapter` interface, JSON-serializes `PartitionBlob` to `Uint8Array` on write, deserializes on read | E28 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:15:00Z |
| 4 | Add `appId`-based key namespacing in `AdapterBridge` — prefix all blob keys with `{appId}/` before delegating to underlying `StorageAdapter` | E28 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:15:00Z |
| 5 | Wire optional `encrypt`/`decrypt` hooks in `AdapterBridge` — accept optional `(data: Uint8Array) => Promise<Uint8Array>` callbacks, apply encrypt after serialize on write and decrypt before deserialize on read | E28 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:15:00Z |
| 6 | Implement `MemoryStorageAdapter` in `src/adapter/memory-storage.ts` — in-memory `Map<string, Uint8Array>` implementation of `StorageAdapter` for testing | E28 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:15:00Z |
| 7 | Update barrel exports in `src/adapter/index.ts` — export `StorageAdapter`, `AdapterBridge`, `MemoryStorageAdapter` | E28 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:15:00Z |

### Phase 2 — Encryption Primitives (E29)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 8 | Define encryption types in `src/adapter/crypto/types.ts` — `EncryptionHeader` (version byte + IV), `WrappedDEK` (encrypted DEK + salt), `EncryptionConfig` (password field) | E29 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:18:00Z |
| 9 | Implement PBKDF2 KEK derivation in `src/adapter/crypto/kek.ts` — `deriveKEK(password, salt, appId)` using Web Crypto API with PBKDF2, 600k iterations, SHA-256, produces AES-256 `CryptoKey` | E29 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:18:00Z |
| 10 | Implement DEK generation in `src/adapter/crypto/dek.ts` — `generateDEK()` returns random AES-256-GCM `CryptoKey` via `crypto.subtle.generateKey` | E29 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:18:00Z |
| 11 | Implement DEK wrap/unwrap in `src/adapter/crypto/dek.ts` — `wrapDEK(dek, kek)` exports and encrypts DEK with AES-KW, `unwrapDEK(wrapped, kek)` reverses; throw `InvalidEncryptionKeyError` on unwrap failure | E29 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:18:00Z |
| 12 | Implement AES-256-GCM encrypt in `src/adapter/crypto/cipher.ts` — `encrypt(data, dek)` generates random 12-byte IV, encrypts via `crypto.subtle.encrypt`, prepends header (version byte + IV) to ciphertext | E29 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:18:00Z |
| 13 | Implement AES-256-GCM decrypt in `src/adapter/crypto/cipher.ts` — `decrypt(data, dek)` parses header to extract version and IV, decrypts ciphertext via `crypto.subtle.decrypt` | E29 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:18:00Z |
| 14 | Define `InvalidEncryptionKeyError` in `src/adapter/crypto/errors.ts` — custom error class thrown when DEK unwrap fails due to wrong password | E29 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:18:00Z |
| 15 | Create barrel exports — `src/adapter/crypto/index.ts` re-exports all crypto primitives and types, update `src/adapter/index.ts` to re-export `@/adapter/crypto` | E29 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:18:00Z |

### Phase 3 — Encryption Integration in createFyreDb (E30)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 16 | Define `EncryptionOptions` type and add optional `encryption: { password: string }` field to `FyreDbConfig` | E30 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:22:00Z |
| 17 | Implement salt generation and storage — generate random 16-byte salt on first encrypted init, store as raw `Uint8Array` in `__fyredb_salt` blob via `StorageAdapter`, load on subsequent inits | E30 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:22:00Z |
| 18 | Implement DEK bootstrap on first encrypted init — generate DEK, derive KEK from password+salt+appId, wrap DEK, store wrapped DEK in `__fyredb_dek` blob via `StorageAdapter` | E30 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:22:00Z |
| 19 | Implement DEK load on subsequent encrypted init — load salt and wrapped DEK blobs from `StorageAdapter`, derive KEK from password+salt+appId, unwrap DEK; throw `InvalidEncryptionKeyError` if unwrap fails | E30 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:22:00Z |
| 20 | Create `encrypt`/`decrypt` callback factory — function that closes over initialized DEK and returns `(data: Uint8Array) => Promise<Uint8Array>` pair suitable as `AdapterBridge` crypto hooks | E30 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:22:00Z |
| 21 | Wire encryption into `createFyreDb()` — when `encryption` config present: run DEK bootstrap/load, create crypto callbacks, construct `AdapterBridge` with crypto hooks wrapping user-provided `StorageAdapter` | E30 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:22:00Z |
| 22 | Implement `changePassword(oldPassword, newPassword)` on FyreDb instance — derive old KEK, unwrap DEK, derive new KEK with same salt, re-wrap DEK, overwrite `__fyredb_dek` blob | E30 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:22:00Z |
| 23 | Implement `enableEncryption(password)` on FyreDb instance — generate DEK+salt, derive KEK, wrap DEK, store salt+DEK blobs, re-encrypt all existing data blobs via `StorageAdapter` list+read+encrypt+write | E30 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:22:00Z |
| 24 | Implement `disableEncryption(password)` on FyreDb instance — derive KEK, unwrap DEK, decrypt all existing data blobs, remove `__fyredb_salt` and `__fyredb_dek` blobs | E30 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:22:00Z |

### Phase 4 — Schema Migration (E31)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 25 | Add `version` and `migrations` fields to `EntityDefinitionOptions` in `src/schema/types.ts` — `version?: number` (default 1), `migrations?: Record<number, (entity: unknown) => unknown>` keyed by target version | E31 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:25:00Z |
| 26 | Store entity schema version in serialized partition data — add `__v: number` metadata field to each entity record on write, strip on read after migration | E31 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:25:00Z |
| 27 | Implement on-load version check — during entity deserialization, compare stored `__v` against current `EntityDefinition.version`, flag entities needing migration | E31 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:25:00Z |
| 28 | Implement migration runner — apply migration functions sequentially from stored version to current version (e.g., v1→v2→v3), update `__v` after each step | E31 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:25:00Z |
| 29 | Wire migration into `AdapterBridge` deserialize pipeline — after deserialize (and decrypt if applicable), run migration check and apply migrations on each entity before returning data to store | E31 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:25:00Z |
| 30 | Update `__fyredb` marker blob to track schema versions — store current version per entity type, detect version changes on startup to trigger re-processing of affected partitions | E31 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:25:00Z |
| 31 | Update barrel exports for schema migration — export `migrations` option type and version-related types from `src/schema/index.ts` | E31 | developer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:25:00Z |

### Phase 5 — Review & Verification

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 32 | Review Phase 1 — `StorageAdapter` interface, `AdapterBridge` serialize/deserialize/key-namespacing, `MemoryStorageAdapter`, type safety and design doc alignment | E28 | reviewer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:30:00Z |
| 33 | Review Phase 2 — Encryption primitives for Web Crypto correctness, secure key handling, IV uniqueness, proper error propagation | E29 | reviewer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:30:00Z |
| 34 | Review Phase 3 — DEK bootstrap/load lifecycle, password change flow, enable/disable encryption, `createFyreDb()` wiring, edge cases | E30 | reviewer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:30:00Z |
| 35 | Review Phase 4 — Schema migration version tracking, migration runner correctness, pipeline integration, backward compatibility | E31 | reviewer | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:30:00Z |

### Phase 6 — Unit Tests

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 36 | Unit tests for `StorageAdapter`/`MemoryStorageAdapter` — read/write/delete/list round-trips, null on missing key, prefix filtering | E28 | unit-tester | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:29:00Z |
| 37 | Unit tests for `AdapterBridge` — serialize/deserialize round-trip, key namespacing with appId, encrypt/decrypt hook integration, passthrough without hooks | E28 | unit-tester | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:29:00Z |
| 38 | Unit tests for encryption primitives — KEK derivation determinism, DEK generation randomness, wrap/unwrap round-trip, encrypt/decrypt round-trip, wrong-password throws `InvalidEncryptionKeyError`, header format validation | E29 | unit-tester | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:29:00Z |
| 39 | Unit tests for encryption lifecycle — DEK bootstrap on first init, DEK load on subsequent init, password change re-wraps DEK, enable/disable encryption transforms all blobs | E30 | unit-tester | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:29:00Z |
| 40 | Unit tests for schema migration — version stored on write, migration runner applies sequential transforms, missing migration throws, no-op when version matches | E31 | unit-tester | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:29:00Z |

### Phase 7 — Integration Tests

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 41 | Integration test — `AdapterBridge` end-to-end: `MemoryStorageAdapter` → `AdapterBridge` → `BlobAdapter` interface, write `PartitionBlob`, read back, verify round-trip | E28 | integration-tester | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:35:00Z |
| 42 | Integration test — encrypted `createFyreDb` lifecycle: init with password, save entities, dispose, re-init with same password reads data, re-init with wrong password throws | E30 | integration-tester | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:35:00Z |
| 43 | Integration test — password change: init encrypted, save data, change password, dispose, re-init with new password reads data, old password throws | E30 | integration-tester | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:35:00Z |
| 44 | Integration test — enable/disable encryption: init unencrypted, save data, enable encryption, verify data readable, disable encryption, verify data readable unencrypted | E30 | integration-tester | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:35:00Z |
| 45 | Integration test — schema migration on load: save entity at v1, update definition to v2 with migration, reload, verify entity migrated correctly with `__v` updated | E31 | integration-tester | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:35:00Z |
| 46 | Integration test — multi-version migration: save entity at v1, update definition to v3 with v1→v2 and v2→v3 migrations, reload, verify sequential migration applied | E31 | integration-tester | done | plan | 2026-03-26T10:00:00Z | 2026-03-26T18:35:00Z |

---

## Sprint — Shared Types & Typed BlobAdapter
Started: 2026-03-25T08:00:00Z

Epics: E27 (shared-types-typed-adapter)

Normalize all adapter data to `PartitionBlob`. Type `BlobAdapter.read()` to return `PartitionBlob | null` and `BlobAdapter.write()` to accept `PartitionBlob`. Restructure `__fyredb` marker and `__tenants` list as PartitionBlob-format blobs. Remove `MarkerBlob` and `TenantListBlob` types. Keep `Tenant` in `tenant/types.ts` and `PartitionBlob` in `persistence/types.ts` — no `src/types/` shared module needed. Fix `example/app-fs.ts`.

### Phase 1 — Type the BlobAdapter Interface

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 1 | Update `BlobAdapter` interface in `src/adapter/types.ts` — change `read()` return type from `Promise<unknown>` to `Promise<PartitionBlob \| null>`, change `write()` data param from `unknown` to `PartitionBlob`, import `PartitionBlob` from `@/persistence` | E27 | developer | done | plan | 2026-03-25T08:00:00Z | 2026-03-25T06:20:00Z |
| 2 | Move `Tenant` type definition from `src/adapter/types.ts` back to `src/tenant/types.ts`; update `src/adapter/types.ts` to import `Tenant` from `@/tenant`; update barrel re-exports to preserve public API | E27 | developer | done | plan | 2026-03-25T08:00:00Z | 2026-03-25T06:22:00Z |
| 3 | Update `MemoryBlobAdapter` in `src/adapter/memory.ts` — store `PartitionBlob` values instead of `unknown`, use structured clone for defensive copy on `PartitionBlob` objects | E27 | developer | done | plan | 2026-03-25T08:00:00Z | 2026-03-25T06:24:00Z |

### Phase 2 — Restructure `__fyredb` Marker as PartitionBlob

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 4 | Restructure `__fyredb` marker blob to PartitionBlob format in `src/tenant/marker-blob.ts` — store marker data (version, createdAt, entityTypes, indexes) as an entity keyed by a well-known ID within a system partition; remove `MarkerBlob` type | E27 | developer | done | plan | 2026-03-25T08:00:00Z | 2026-03-25T06:26:00Z |
| 5 | Update `writeMarkerBlob` and `readMarkerBlob` in `src/tenant/marker-blob.ts` to produce and consume `PartitionBlob` format instead of the removed `MarkerBlob` type | E27 | developer | done | plan | 2026-03-25T08:00:00Z | 2026-03-25T06:26:00Z |
| 6 | Update `loadAllIndexes`/`saveAllIndexes` in `src/persistence/partition-index.ts` to read/write indexes from the restructured `__fyredb` PartitionBlob | E27 | developer | done | plan | 2026-03-25T08:00:00Z | 2026-03-25T06:28:00Z |

### Phase 3 — Restructure `__tenants` List as PartitionBlob

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 7 | Restructure `__tenants` blob to PartitionBlob format — each `Tenant` stored as an entity keyed by `tenant.id` in the partition entity map; remove `TenantListBlob` type from `src/persistence/types.ts` | E27 | developer | done | plan | 2026-03-25T08:00:00Z | 2026-03-25T06:30:00Z |
| 8 | Update `loadTenantList`/`saveTenantList` in `src/tenant/tenant-list.ts` to read/write PartitionBlob format (extract tenants from entity map, write tenants keyed by ID) | E27 | developer | done | plan | 2026-03-25T08:00:00Z | 2026-03-25T06:30:00Z |
| 9 | Update `mergeTenantLists`, `pushTenantList`, `pullTenantList` in tenant sync code to work with PartitionBlob-based tenant storage | E27 | developer | done | plan | 2026-03-25T08:00:00Z | 2026-03-25T06:30:00Z |

### Phase 4 — Update Store & Framework Code

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 10 | Update `src/store/store.ts` BlobAdapter methods (`read`, `write`) to return/accept `PartitionBlob` instead of `unknown` | E27 | developer | done | plan | 2026-03-25T08:00:00Z | 2026-03-25T06:34:00Z |
| 11 | Update all framework code that consumes adapter `read()` results to use `PartitionBlob` instead of `unknown` — sync modules (`src/sync/`), tenant modules (`src/tenant/`), fyredb entry point (`src/fyredb.ts`) | E27 | developer | done | plan | 2026-03-25T08:00:00Z | 2026-03-25T06:34:00Z |
| 12 | Fix `example/app-fs.ts` — replace broken `Meta` import with `Tenant`, update FS adapter to conform to typed `PartitionBlob` BlobAdapter interface | E27 | developer | done | plan | 2026-03-25T08:00:00Z | 2026-03-25T06:36:00Z |

### Phase 5 — Cleanup

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 13 | Delete `src/types/` shared module files if they exist (types stay in their origin modules) | E27 | developer | done | plan | 2026-03-25T08:00:00Z | 2026-03-25T06:38:00Z |
| 14 | Update barrel exports across all affected modules (`src/adapter/index.ts`, `src/persistence/index.ts`, `src/tenant/index.ts`) — remove `MarkerBlob`, `TenantListBlob` exports; ensure `Tenant` re-exported from adapter barrel for backward compatibility | E27 | developer | done | plan | 2026-03-25T08:00:00Z | 2026-03-25T06:38:00Z |

### Phase 6 — Tests, Review & Verification

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 15 | Update all unit and integration tests for `PartitionBlob`-typed BlobAdapter, restructured `__fyredb` marker, and restructured `__tenants` list | E27 | developer | done | plan | 2026-03-25T08:00:00Z | 2026-03-25T06:40:00Z |
| 16 | Review all changes for type safety, design alignment, and completeness | E27 | developer | done | plan | 2026-03-25T08:00:00Z | 2026-03-25T06:40:00Z |
| 17 | Build (`npm run build`) and verify all tests pass (`npm test`) | E27 | developer | done | plan | 2026-03-25T08:00:00Z | 2026-03-25T06:40:00Z |

## Sprint — Unified Sync Refactor
Started: 2026-03-24T21:00:00Z

Epics: unified-sync-refactor

Major refactor: BlobAdapter switches from Uint8Array to typed JS objects, `meta: Meta` becomes `tenant: Tenant`, EntityStore becomes a BlobAdapter peer, all data movement uses `syncBetween`, serialize/deserialize removed from framework internals, FlushScheduler and hydrateFromLocal eliminated.

### Phase 1 — Types & Interfaces

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 1 | Define `PartitionBlob` type (`{ [entityName]: Record<string, unknown>, deleted: { [entityName]: Record<string, Hlc> } }`) and `TenantListBlob` type (typed wrapper for `Tenant[]`) in `src/persistence/types.ts` | unified-sync-refactor | developer | done | plan | 2026-03-24T21:00:00Z | 2026-03-24T21:10:00Z |
| 2 | Refactor `BlobAdapter` interface in `src/adapter/types.ts`: change `read`/`write` from `Uint8Array` to JS objects (typed as `unknown`), change all method signatures from `meta: Meta` to `tenant: Tenant \| undefined`, remove `Meta` type export | unified-sync-refactor | developer | done | plan | 2026-03-24T21:00:00Z | 2026-03-24T21:10:00Z |
| 3 | Update `EntityStore` type in `src/store/types.ts`: rename `get`→`getEntity`, `set`→`setEntity`, `delete`→`deleteEntity`; add BlobAdapter-compatible methods (`read`, `write`, `delete`, `list`) to the type; remove `FlushScheduler` and `FlushSchedulerOptions` types | unified-sync-refactor | developer | done | plan | 2026-03-24T21:00:00Z | 2026-03-24T21:10:00Z |

### Phase 2 — Adapter & Store Implementations

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 4 | Update `MemoryBlobAdapter` in `src/adapter/memory.ts`: store JS objects instead of `Uint8Array` (use structured clone for defensive copy), accept `Tenant \| undefined` instead of `Meta` in all methods | unified-sync-refactor | developer | done | plan | 2026-03-24T21:00:00Z | 2026-03-24T21:15:00Z |
| 5 | Rename all `EntityStore` call sites: `store.get`→`store.getEntity`, `store.set`→`store.setEntity`, `store.delete`→`store.deleteEntity` across `src/store/store.ts`, `src/repo/`, `src/sync/`, and `src/fyredb.ts` | unified-sync-refactor | developer | done | plan | 2026-03-24T21:00:00Z | 2026-03-24T21:15:00Z |
| 6 | Implement BlobAdapter methods on `Store` class in `src/store/store.ts`: `read(tenant, key)` returns partition data as `PartitionBlob`, `write(tenant, key, data)` loads partition data from blob into Maps, `delete(tenant, key)` clears a partition, `list(tenant, prefix)` returns matching entity keys | unified-sync-refactor | developer | done | plan | 2026-03-24T21:00:00Z | 2026-03-24T21:15:00Z |

### Phase 3 — Remove serialize/deserialize from Internals

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 7 | Remove `serialize`/`deserialize` calls from `src/store/flush.ts` (`flushPartition`, `loadPartitionFromAdapter`) — adapters now receive/return JS objects directly | unified-sync-refactor | developer | done | plan | 2026-03-24T21:00:00Z | 2026-03-24T21:20:00Z |
| 8 | Remove `serialize`/`deserialize` calls from sync internals: `src/sync/sync-phase.ts`, `src/sync/copy.ts`, `src/sync/merge.ts` — partition blobs are now JS objects, no encoding/decoding needed | unified-sync-refactor | developer | done | plan | 2026-03-24T21:00:00Z | 2026-03-24T21:20:00Z |
| 9 | Remove `serialize`/`deserialize` calls from tenant internals: `src/tenant/tenant-list.ts` (`loadTenantList`, `saveTenantList`), `src/tenant/marker-blob.ts` (`writeMarkerBlob`, `readMarkerBlob`) — adapters now store/return typed objects | unified-sync-refactor | developer | done | plan | 2026-03-24T21:00:00Z | 2026-03-24T21:20:00Z |

### Phase 4 — Sync & Data Flow Refactor

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 10 | Update `syncBetween` in `src/sync/unified.ts` to accept `Tenant \| undefined` instead of `Meta`, operate on JS objects, and support `EntityStore`-as-BlobAdapter as either sync peer | unified-sync-refactor | developer | done | plan | 2026-03-24T21:00:00Z | 2026-03-24T21:25:00Z |
| 11 | Delete `flushAll`, `flushPartition` from `src/store/flush.ts`, delete `FlushScheduler` class from `src/store/flush-scheduler.ts`, delete `hydrateFromLocal` from `src/sync/hydrate.ts` — all data movement now uses `syncBetween` | unified-sync-refactor | developer | done | plan | 2026-03-24T21:00:00Z | 2026-03-24T21:25:00Z |
| 12 | Update `SyncScheduler` in `src/sync/sync-scheduler.ts`: replace `flushAll` memory→local hop with `syncBetween(store, localAdapter, ...)`, accept `Tenant \| undefined` instead of `Meta`; update `syncNow` similarly | unified-sync-refactor | developer | done | plan | 2026-03-24T21:00:00Z | 2026-03-24T21:25:00Z |

### Phase 5 — Entry Point & Tenant Updates

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 13 | Update `FyreDb` class in `src/fyredb.ts`: remove `FlushScheduler` dependency and `flushScheduler` field, replace `hydrateFromLocal` fallback with `syncBetween(localAdapter, store, ...)`, pass `Tenant` objects instead of `tenant.meta` throughout | unified-sync-refactor | developer | done | plan | 2026-03-24T21:00:00Z | 2026-03-24T21:30:00Z |
| 14 | Update tenant system to accept `Tenant \| undefined` instead of `Meta`: `loadTenantList`, `saveTenantList`, `writeMarkerBlob`, `readMarkerBlob`, `saveTenantPrefs`, `loadTenantPrefs`, `pushTenantList`, `pullTenantList`, and `TenantManager` internals | unified-sync-refactor | developer | done | plan | 2026-03-24T21:00:00Z | 2026-03-24T21:30:00Z |
| 15 | Update barrel exports: `src/store/index.ts` (remove `flushAll`, `flushPartition`, `FlushScheduler`, `createFlushScheduler`, `FlushSchedulerOptions`), `src/sync/index.ts` (remove `hydrateFromLocal`), `src/adapter/index.ts` (remove `Meta` export) | unified-sync-refactor | developer | done | plan | 2026-03-24T21:00:00Z | 2026-03-24T21:30:00Z |

### Phase 6 — Review & Tests

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 16 | Review all changes for type safety, design alignment, and completeness across adapter, store, sync, tenant, and fyredb modules | unified-sync-refactor | reviewer | done | plan | 2026-03-24T21:00:00Z | 2026-03-24T21:55:00Z |
| 17 | Update unit tests: `BlobAdapter`/`MemoryBlobAdapter` tests for JS objects and Tenant param, `EntityStore` tests for renamed methods and new BlobAdapter methods, sync tests for `syncBetween` with store-as-adapter, tenant tests for Tenant param | unified-sync-refactor | unit-tester | done | plan | 2026-03-24T21:00:00Z | 2026-03-24T21:55:00Z |
| 18 | Update integration tests: end-to-end flows with new BlobAdapter interface, `syncBetween` for memory↔local↔cloud, tenant lifecycle with Tenant objects, verify `FlushScheduler` and `hydrateFromLocal` removal has no regressions | unified-sync-refactor | integration-tester | done | plan | 2026-03-24T21:00:00Z | 2026-03-24T21:55:00Z |

## Sprint — Consolidate partition indexes into single `__index` blob
Started: 2026-03-24T12:00:00Z

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 1 | Replace `indexKey()` with `INDEX_KEY` constant in `src/adapter/keys.ts` | index-consolidation | developer | done | plan | 2026-03-24T12:00:00Z | 2026-03-24T12:58:00Z |
| 2 | Add `AllIndexes` type to `src/persistence/types.ts` | index-consolidation | developer | done | plan | 2026-03-24T12:00:00Z | 2026-03-24T12:58:00Z |
| 3 | Replace `loadPartitionIndex`/`savePartitionIndex` with `loadAllIndexes`/`saveAllIndexes` in `src/persistence/partition-index.ts` | index-consolidation | developer | done | plan | 2026-03-24T12:00:00Z | 2026-03-24T12:58:00Z |
| 4 | Update exports in `src/adapter/index.ts` and `src/persistence/index.ts` | index-consolidation | developer | done | plan | 2026-03-24T12:00:00Z | 2026-03-24T12:58:00Z |
| 5 | Update `src/sync/hydrate.ts` to use combined index | index-consolidation | developer | done | plan | 2026-03-24T12:00:00Z | 2026-03-24T12:58:00Z |
| 6 | Update `src/sync/diff.ts` to load all indexes at once | index-consolidation | developer | done | plan | 2026-03-24T12:00:00Z | 2026-03-24T12:58:00Z |
| 7 | Update `src/store/flush.ts` to use combined index | index-consolidation | developer | done | plan | 2026-03-24T12:00:00Z | 2026-03-24T12:58:00Z |
| 8 | Update `src/sync/sync-phase.ts` to return updated indexes instead of saving | index-consolidation | developer | done | plan | 2026-03-24T12:00:00Z | 2026-03-24T12:58:00Z |
| 9 | Update `src/sync/sync-scheduler.ts` to load/save combined indexes | index-consolidation | developer | done | plan | 2026-03-24T12:00:00Z | 2026-03-24T12:58:00Z |
| 10 | Update `src/sync/index.ts` exports | index-consolidation | developer | done | plan | 2026-03-24T12:00:00Z | 2026-03-24T12:58:00Z |
| 11 | Update all tests for new API | index-consolidation | developer | done | plan | 2026-03-24T12:00:00Z | 2026-03-24T12:58:00Z |

## Sprint — Merge `__fyredb` marker blob and `__index` into single `__fyredb` blob
Started: 2026-03-24T15:00:00Z

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 1 | Update `MarkerBlob` type and `writeMarkerBlob` to include `indexes` field | merge-fyredb-blob | developer | done | plan | 2026-03-24T15:00:00Z | 2026-03-24T15:05:00Z |
| 2 | Update `loadAllIndexes`/`saveAllIndexes` to read/write from `__fyredb` blob | merge-fyredb-blob | developer | done | plan | 2026-03-24T15:00:00Z | 2026-03-24T15:05:00Z |
| 3 | Remove `INDEX_KEY` from `src/adapter/keys.ts` and `src/adapter/index.ts` | merge-fyredb-blob | developer | done | plan | 2026-03-24T15:00:00Z | 2026-03-24T15:05:00Z |
| 4 | Update partition-index test for new storage location | merge-fyredb-blob | developer | done | plan | 2026-03-24T15:00:00Z | 2026-03-24T15:05:00Z |
| 5 | Review all changes | merge-fyredb-blob | reviewer | done | plan | 2026-03-24T15:00:00Z | 2026-03-24T15:08:00Z |
| 6 | Unit tests | merge-fyredb-blob | unit-tester | done | test | 2026-03-24T15:00:00Z | 2026-03-24T15:10:00Z |
| 7 | Integration tests | merge-fyredb-blob | integration-tester | done | test | 2026-03-24T15:00:00Z | 2026-03-24T15:10:00Z |


<!-- Status values: not-started, in-progress, done, known-issue, skipped -->
<!-- Source values: plan, review, test-fix, test -->
<!-- Assigned values: developer, unit-tester, integration-tester -->

## Integration Test Sprint 2
Started: 2026-03-24T06:54:00Z

### Sync Advanced Tests (`tests/integration/sync-advanced.test.ts`)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 1 | Cloud unreachable fallback — hydrate falls back to local-only, emits cloud-unreachable event | E22-E23 | integration-tester | done | test | 2026-03-24T06:54:00Z | 2026-03-24T06:58:00Z |
| 2 | Sync lock dedup — concurrent sync() calls both resolve without error | E22 | integration-tester | done | test | 2026-03-24T06:54:00Z | 2026-03-24T06:58:00Z |
| 3 | HLC nodeId tiebreaker — deterministic winner when timestamp and counter are equal | E20 | integration-tester | done | test | 2026-03-24T06:54:00Z | 2026-03-24T06:58:00Z |
| 4 | Sync + reactive end-to-end — A saves → syncs → B hydrates → B observe emits entity from A | E20-E22 | integration-tester | done | test | 2026-03-24T06:54:00Z | 2026-03-24T06:58:00Z |

### Repository Advanced Tests (`tests/integration/repo-advanced.test.ts`)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 5 | deriveId upsert — second save with same derived key updates existing entity | E12 | integration-tester | done | test | 2026-03-24T06:54:00Z | 2026-03-24T06:58:00Z |
| 6 | Range queries — filters entities by numeric field range (gt/lte) | E12 | integration-tester | done | test | 2026-03-24T06:54:00Z | 2026-03-24T06:58:00Z |
| 7 | Query edge cases — offset > count returns empty, limit=0 returns empty | E12 | integration-tester | done | test | 2026-03-24T06:54:00Z | 2026-03-24T06:58:00Z |
| 8 | SingletonRepository full lifecycle — get → save → get → observe → delete → get → observe undefined | E13 | integration-tester | done | test | 2026-03-24T06:54:00Z | 2026-03-24T06:58:00Z |
| 9 | Multiple simultaneous observers — all receive updates, unsubscribing one keeps others | E14 | integration-tester | done | test | 2026-03-24T06:54:00Z | 2026-03-24T06:58:00Z |
| 10 | Event bus listener cleanup — unsubscribed observer does not fire on save | E14 | integration-tester | done | test | 2026-03-24T06:54:00Z | 2026-03-24T06:58:00Z |

### Persistence Advanced Tests (`tests/integration/persistence-advanced.test.ts`)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 11 | Transform pipeline end-to-end — XOR transform applied on flush and reversed on reload | E5 | integration-tester | done | test | 2026-03-24T06:54:00Z | 2026-03-24T06:58:00Z |
| 12 | Adapter list() discovers partition keys after flush | E4 | integration-tester | done | test | 2026-03-24T06:54:00Z | 2026-03-24T06:58:00Z |

### Tenant Advanced Tests (`tests/integration/tenant-advanced.test.ts`)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 13 | Tenant preferences sync — save prefs on A, load on B via shared cloud | E17 | integration-tester | done | test | 2026-03-24T06:54:00Z | 2026-03-24T06:58:00Z |
| 14 | Tenant list multi-device merge — A creates X, B creates Y, both end up with both | E17 | integration-tester | done | test | 2026-03-24T06:54:00Z | 2026-03-24T06:58:00Z |

### Dirty Tracking Tests (`tests/integration/dirty-tracking.test.ts`)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 15 | isDirty transitions — false → true after save → false after sync | E23 | integration-tester | done | test | 2026-03-24T06:54:00Z | 2026-03-24T06:58:00Z |
| 16 | isDirty$ observable — emits true on save, false on sync | E23 | integration-tester | done | test | 2026-03-24T06:54:00Z | 2026-03-24T06:58:00Z |

### Lifecycle Advanced Tests (`tests/integration/lifecycle-advanced.test.ts`)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 17 | Invalid entity definitions — empty entities array throws | E24 | integration-tester | done | test | 2026-03-24T06:54:00Z | 2026-03-24T06:58:00Z |
| 18 | Invalid entity definitions — duplicate entity names throws | E24 | integration-tester | done | test | 2026-03-24T06:54:00Z | 2026-03-24T06:58:00Z |
| 19 | Flush debounce coalescing — rapid saves trigger single flush (2 writes) | E8 | integration-tester | done | test | 2026-03-24T06:54:00Z | 2026-03-24T06:58:00Z |
| 20 | Tenant load triggers hydrate from cloud automatically | E24 | integration-tester | done | test | 2026-03-24T06:54:00Z | 2026-03-24T06:58:00Z |
<!-- Status values: not-started, in-progress, done, known-issue, skipped -->
<!-- Source values: plan, review, test-fix, test -->
<!-- Assigned values: developer, unit-tester, integration-tester -->

## Sprint 1 — Foundation Layer (HLC, Adapter, Schema, Reactive)
Started: 2026-03-23T20:30:00Z

Epics: E1 (HLC), E3 (Adapter types), E4 (MemoryAdapter), E2 (Schema), E6 (Reactive event bus)

### E1 — HLC (types, tick, compare)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 1 | Define `Hlc` type (`timestamp: number`, `counter: number`, `nodeId: string`) and `createHlc()` factory in `src/hlc/` | E1 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 2 | Implement `tickLocal(hlc)` — advances timestamp to `max(wallClock, hlc.timestamp)`, increments counter if timestamp unchanged, resets counter if timestamp advanced | E1 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 3 | Implement `tickRemote(local, remote)` — merges local HLC with received remote HLC per HLC algorithm | E1 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 4 | Implement `compareHlc(a, b)` — total ordering: compare timestamp first, then counter, then nodeId string comparison as tiebreaker; return -1/0/1 | E1 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 5 | Write unit tests for HLC module — createHlc, tickLocal (timestamp advance, counter increment), tickRemote (merge scenarios), compareHlc (all tiebreaker levels) | E1 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |

### E3 — Adapter types (BlobAdapter interface)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 6 | Define `BlobAdapter` type with 4 async methods (`read`, `write`, `delete`, `list`) accepting `meta: Readonly<Record<string, unknown>> \| undefined` as first param in `src/adapter/` | E3 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 7 | Define framework blob key constants/helpers — `__tenants`, `__fyredb`, `__index.{entityName}`, `{entityName}.{partitionKey}` patterns | E3 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |

### E4 — MemoryBlobAdapter

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 8 | Implement `createMemoryBlobAdapter()` — `Map<string, Uint8Array>` backing store with defensive copy on write, null return on missing read, key prefix filtering for list | E4 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 9 | Write unit tests for MemoryBlobAdapter — read/write round-trip, read returns null for missing key, write stores defensive copy (mutation isolation), delete returns true/false, list filters by prefix, list returns empty for no matches | E4 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |

### E2 — Schema (defineEntity, ID gen, key strategies)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 10 | Define `BaseEntity` type (id, createdAt, updatedAt, version, device, hlc) and `EntityDefinition<T>` type in `src/schema/` | E2 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 11 | Implement `generateId()` — 8-char random alphanumeric unique ID, and `formatEntityId(entityName, partitionKey, uniqueId)` to produce `entityName.partitionKey.uniqueId` format | E2 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 12 | Implement key strategy functions — `partitioned(fn)` derives partition key from entity data, `'global'` always returns `'_'`, `'singleton'` returns `'_'` with deterministic ID | E2 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 13 | Implement `defineEntity<T>(name, options?)` — creates `EntityDefinition` with name, key strategy (default global), and optional `deriveId` function; validate deriveId output contains no dots | E2 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 14 | Write unit tests for schema module — defineEntity returns correct definition, generateId format/uniqueness, partitioned/global/singleton key strategies, deriveId validation rejects dots | E2 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |

### E6 — Reactive event bus

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 15 | Define `EntityEvent` type (with entityName field), `EntityEventListener` callback type, and `EntityEventBus` type (on/off/emit) in `src/reactive/` | E6 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 16 | Implement `createEventBus()` — maintains listener array, `on()` registers listener, `off()` removes listener, `emit()` calls all listeners synchronously | E6 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |
| 17 | Write unit tests for event bus — on/emit delivers events, off removes listener, multiple listeners all fire, emit with no listeners is safe, same listener registered twice | E6 | developer | done | plan | 2026-03-23T20:30:00Z | 2026-03-23T20:38:00Z |

## Sprint 2 — Transforms, Persistence & Store
Started: 2026-03-23T21:00:00Z

Epics: E5 (Transform pipeline), E9 (Serialization), E10 (FNV-1a hashing), E7 (In-memory store), E11 (Partition index)

### E5 — Adapter Transform Pipeline (Layer 2)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 1 | Define `BlobTransform` type with `encode(data: Uint8Array): Promise<Uint8Array>` and `decode(data: Uint8Array): Promise<Uint8Array>` methods in `src/adapter/` | E5 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 2 | Implement `applyTransforms(transforms, data)` — applies transforms in forward order for writes, and `reverseTransforms(transforms, data)` — applies transforms in reverse order for reads | E5 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 3 | Write unit tests for transform pipeline — identity passthrough, chained transforms apply in correct forward order, reverse applies in correct reverse order, empty transform array passthrough | E5 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |

### E9 — JSON Serialization & Type Markers (Layer 2)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 4 | Implement JSON replacer that wraps `Date` values as `{ __t: 'D', v: isoString }` type marker, and JSON reviver that detects `__t` and reconstructs original types, in `src/persistence/` | E9 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 5 | Implement `serialize(data): Uint8Array` — `JSON.stringify` with replacer → `TextEncoder` to bytes, and `deserialize<T>(bytes: Uint8Array): T` — `TextDecoder` → `JSON.parse` with reviver | E9 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 6 | Write unit tests for serialization — Date round-trip preserves value, nested Date fields, no-Date data passthrough, Uint8Array encoding fidelity, type marker `{ __t: 'D', v }` format correctness | E9 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |

### E10 — FNV-1a Hashing (Layer 2)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 7 | Implement FNV-1a 32-bit hash — `FNV_OFFSET` (2166136261), `FNV_PRIME` (16777619), `fnv1a(input: string): number` core function, and `fnv1aAppend(hash, input): number` for incremental hashing in `src/persistence/` | E10 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 8 | Implement `partitionHash(entityMap): number` — sorts entity IDs, hashes `id:hlcTimestamp:hlcCounter:hlcNodeId` per entity, includes tombstone HLCs in hash computation | E10 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 9 | Write unit tests for hashing — known FNV-1a test vectors, deterministic output for same input, hash changes when HLC differs, sort-order independence (same entities in any insertion order produce same hash), empty input | E10 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |

### E7 — In-Memory Store (Layer 3)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 10 | Define `EntityStore` type with nested `Map<string, Map<string, unknown>>` structure and `createStore()` factory in `src/store/` | E7 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 11 | Implement `get(entityKey, id)`, `set(entityKey, id, entity)`, `delete(entityKey, id)` — sync Map operations, `set` auto-creates inner Map if partition missing, `set` and `delete` mark partition dirty | E7 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 12 | Implement `getPartition(entityKey): ReadonlyMap` and `getAllPartitionKeys(entityName): string[]` — partition access and discovery by filtering keys with `entityName.` prefix | E7 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 13 | Implement dirty tracking — `getDirtyKeys(): ReadonlySet<string>`, `clearDirty(entityKey)` to track which partitions have been modified and need flushing | E7 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 14 | Implement lazy loading — `loadPartition(entityKey, loader: () => Promise<Map>)` loads partition data from adapter on first access, subsequent calls return cached partition without re-invoking loader | E7 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 15 | Write unit tests for store — CRUD get/set/delete, auto-creating partitions on set, dirty tracking lifecycle (mark on set/delete, clear resets), getAllPartitionKeys prefix filtering, lazy load executes loader once then caches | E7 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |

### E11 — Partition Index (Layer 3, depends on E10)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 16 | Define `PartitionIndexEntry` type (`hash: number`, `count: number`, `updatedAt: number`) and `PartitionIndex` type (`Record<string, PartitionIndexEntry>`) in `src/persistence/` | E11 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 17 | Implement `loadPartitionIndex(adapter, meta, entityName): Promise<PartitionIndex>` — reads `__index.{entityName}` blob via adapter, deserializes with `deserialize`, returns `{}` if blob is null | E11 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 18 | Implement `savePartitionIndex(adapter, meta, entityName, index): Promise<void>` — serializes index with `serialize` and writes to `__index.{entityName}` blob via adapter | E11 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 19 | Implement `updatePartitionIndexEntry(index, partitionKey, hash, count): PartitionIndex` — creates or updates entry for given partition key with hash, count, and current timestamp | E11 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |
| 20 | Write unit tests for partition index — load returns empty object for missing blob, save/load round-trip, updateEntry creates new entry and updates existing, key format uses `__index.{entityName}` | E11 | developer | done | plan | 2026-03-23T21:00:00Z | 2026-03-23T21:05:00Z |

## Sprint 3 — Store Flush, Repository CRUD & Tenant Manager
Started: 2026-03-23T21:30:00Z

Epics: E8 (Store — Debounced flush), E12 (Repository — CRUD & query), E16 (Tenant — TenantManager CRUD)

### E8 — Store: Debounced flush to adapter (Layer 4)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 1 | Implement `flushPartition(adapter, store, entityKey)` — reads dirty partition from store, serializes entity map to blob format (`{ [entityName]: { ...entities }, deleted: { [entityName]: { ...tombstones } } }`), writes via `adapter.write()` | E8 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 2 | Implement `flushAll(adapter, store, entityNames)` — iterates `store.getDirtyKeys()`, calls `flushPartition` for each dirty key, clears dirty flag per partition after successful write | E8 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 3 | Implement `createFlushScheduler(adapter, store, options)` — returns scheduler object; on `schedule()` call, resets debounce timer and triggers `flushAll` after configurable idle ms (default 2000) | E8 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 4 | Implement `flushScheduler.flush()` — cancels any pending debounce timer and forces immediate `flushAll`, returns promise that resolves when flush completes | E8 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 5 | Implement `flushScheduler.dispose()` — cancels pending timer and forces immediate flush of all dirty data; no-op if no dirty partitions; scheduler rejects further `schedule()` calls after dispose | E8 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |

### E12 — Repository: Repository\<T\> CRUD & query (Layer 4)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 6 | Define `Repository<T>` type (get, query, save, saveMany, delete, deleteMany) and `QueryOptions<T>` type (where, range, orderBy, limit, offset) in `src/repo/` | E12 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 7 | Implement `createRepository<T>(definition, store, hlc, eventBus)` factory — returns `Repository<T>` bound to the entity definition's name and key strategy | E12 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 8 | Implement `Repository.get(id)` — parses entity key from ID format `entityName.partitionKey.uniqueId`, looks up partition in store, returns entity or `undefined` | E12 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 9 | Implement `Repository.save(entity)` — generates ID (random via `generateId` or deterministic via `deriveId`), derives partition key from key strategy, stamps `createdAt`/`updatedAt`/`version`/`hlc` (via `tickLocal`), writes to store, emits entity event, returns ID | E12 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 10 | Implement `Repository.saveMany(entities)` — batch save applying same logic as `save` per entity, returns array of IDs | E12 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 11 | Implement `Repository.delete(id)` — removes entity from store partition, emits entity event, returns `boolean`; and `deleteMany(ids)` — batch delete for multiple IDs | E12 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 12 | Implement query filtering — `applyWhere(entities, where)` filters by shallow partial field match; `applyRange(entities, range)` filters by field `gt`/`gte`/`lt`/`lte` comparisons | E12 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 13 | Implement query sorting and pagination — `applyOrderBy(entities, orderBy)` sorts by multiple fields with `asc`/`desc`; `applyPagination(entities, offset, limit)` slices result array | E12 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 14 | Implement `Repository.query(opts?)` — scans all partitions for entity type (using `store.getAllPartitionKeys`), collects entities, applies pipeline: where → range → orderBy → offset/limit; returns `ReadonlyArray<T>` | E12 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |

### E16 — Tenant: Tenant model & TenantManager CRUD (Layer 4)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 15 | Define `Tenant` type (`id`, `name`, `icon?`, `color?`, `meta`, `createdAt`, `updatedAt`) and `TenantManager` type (list, create, setup, load, delink, delete, `activeTenant$`) in `src/tenant/` | E16 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 16 | Implement tenant list persistence — `loadTenantList(adapter): Promise<Tenant[]>` reads `__tenants` blob with `meta = undefined`, deserializes; `saveTenantList(adapter, tenants): Promise<void>` serializes and writes | E16 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 17 | Implement `TenantManager.list()` — returns all tenants from local adapter via `loadTenantList`, cached after first load | E16 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 18 | Implement `TenantManager.create(opts)` — generates or derives tenant ID (via `deriveTenantId` if configured), creates `Tenant` record with timestamps, appends to tenant list, writes `__fyredb` marker blob at `meta` location | E16 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 19 | Implement `TenantManager.load(tenantId)` — finds tenant by ID in list, sets as active tenant, updates `activeTenant$` observable; throws if tenant ID not found | E16 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 20 | Implement `TenantManager.setup(opts)` — reads `__fyredb` marker blob from `meta` location to detect existing workspace, reads tenant prefs (name/icon/color), derives deterministic tenant ID, adds to local tenant list | E16 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 21 | Implement `TenantManager.delink(tenantId)` — removes tenant from local list only, persists updated list; does NOT delete cloud data | E16 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |
| 22 | Implement `TenantManager.delete(tenantId)` — removes tenant from local list AND deletes all blobs at the tenant's `meta` location via adapter | E16 | developer | done | plan | 2026-03-23T21:30:00Z | 2026-03-23T22:13:00Z |

## Sprint 4 — Reactive Observe, SingletonRepository & Tenant Sync
Started: 2026-03-23T22:00:00Z

Epics: E14 (Reactive — observe, observeQuery, distinctUntilChanged), E13 (SingletonRepository), E17 (Tenant list storage & sync)

### E14 — Reactive: observe, observeQuery, distinctUntilChanged (Layer 5)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 1 | Create per-entity-type `Subject<void>` (changeSignal) during repository creation; register event bus listener that calls `changeSignal.next()` when event's `entityName` matches the repo's entity definition name | E14 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 2 | Implement single-entity `distinctUntilChanged` comparator — returns equality `true` when both `a?.id === b?.id` and `a?.version === b?.version`; handles `undefined` values | E14 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 3 | Implement `Repository.observe(id)` — returns `Observable<T \| undefined>` via `changeSignal.pipe(startWith(undefined), map(() => store.get(entityKey, id)), distinctUntilChanged(entityComparator))` | E14 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 4 | Implement `resultsChanged` comparator for query results — returns `true` (changed) if array lengths differ or any element-wise `id`/`version` mismatch; `false` if all elements match | E14 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 5 | Implement `Repository.observeQuery(opts?)` — returns `Observable<ReadonlyArray<T>>` via `changeSignal.pipe(startWith(undefined), map(() => query(opts)), distinctUntilChanged(resultsChanged))` | E14 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |

### E13 — SingletonRepository\<T\> (Layer 5)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 6 | Define `SingletonRepository<T>` type with `get(): T \| undefined`, `save(entity: T): void`, `delete(): boolean`, and `observe(): Observable<T \| undefined>` method signatures in `src/repo/` | E13 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 7 | Implement `createSingletonRepository<T>(definition, store, hlc, eventBus)` factory — creates internal Repository using the singleton key strategy, computes deterministic entity ID (`entityName._.entityName`), returns `SingletonRepository<T>` | E13 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 8 | Implement `SingletonRepository.get()` — delegates to internal `Repository.get(deterministicId)`, returns entity or `undefined` | E13 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 9 | Implement `SingletonRepository.save(entity)` — delegates to internal `Repository.save()` with the deterministic singleton ID, stamps `createdAt`/`updatedAt`/`version`/`hlc` via `tickLocal`, emits entity event | E13 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 10 | Implement `SingletonRepository.delete()` — delegates to internal `Repository.delete(deterministicId)`, returns `boolean` | E13 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 11 | Implement `SingletonRepository.observe()` — returns `Observable<T \| undefined>` via changeSignal pipe using the singleton's deterministic ID, same `startWith → map → distinctUntilChanged` pattern as `Repository.observe` | E13 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |

### E17 — Tenant list storage & sync (Layer 5)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 12 | Implement `mergeTenantLists(local, remote)` — produces union by tenant ID; for matching IDs keeps entry with latest `updatedAt`; returns merged `Tenant[]` array | E17 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 13 | Implement `pushTenantList(localAdapter, cloudAdapter)` — reads local `__tenants` blob (`meta = undefined`), writes to cloud adapter at `__tenants` key | E17 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 14 | Implement `pullTenantList(localAdapter, cloudAdapter)` — reads cloud `__tenants` blob, merges with local list via `mergeTenantLists`, writes merged result back to local adapter | E17 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 15 | Implement `saveTenantPrefs(adapter, meta, prefs)` — serializes tenant preferences (`name`, `icon?`, `color?`) to a prefs blob at the tenant's `meta` location for cross-device sharing | E17 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |
| 16 | Implement `loadTenantPrefs(adapter, meta)` — reads tenant preferences blob from `meta` location, deserializes, returns `{ name, icon?, color? }` or `undefined` if blob not found | E17 | developer | done | plan | 2026-03-23T22:00:00Z | 2026-03-23T22:25:00Z |

## Sprint 5 — Reactive Batch/Dispose & Tenant Sharing
Started: 2026-03-23T22:30:00Z

Epics: E15 (Reactive — Batch writes & dispose), E18 (Tenant — Sharing, setup, marker blob)

### E15 — Reactive: Batch writes & dispose (Layer 6)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 1 | Refactor `saveMany()` to batch all Map writes without per-entity signal emission, then emit a single `changeSignal.next()` after all writes complete — 100 saves → 1 signal → 1 observer re-scan | E15 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:35:00Z |
| 2 | Refactor `deleteMany()` to batch all Map deletes without per-entity signal emission, then emit a single `changeSignal.next()` after all deletes complete | E15 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:35:00Z |
| 3 | Implement `dispose()` on Repository — calls `changeSignal.complete()` so active observers receive completion signal, removes entity event bus listener via `eventBus.off(listener)`, rejects further save/delete/observe operations after dispose | E15 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:35:00Z |
| 4 | Implement `dispose()` on SingletonRepository — delegates to internal Repository's `dispose()` method, completing singleton changeSignal and removing event bus listener | E15 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:35:00Z |
| 5 | Write unit tests for batch writes — verify `saveMany` emits exactly one signal (not N), `deleteMany` emits exactly one signal, observers re-scan once per batch, individual `save`/`delete` still emit immediately | E15 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:42:00Z |
| 6 | Write unit tests for dispose — `dispose()` completes active Observable subscriptions, disposed Repository rejects further operations, event bus listener is removed after dispose, SingletonRepository dispose delegates correctly | E15 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:42:00Z |

### E18 — Tenant: Sharing, setup, marker blob (Layer 6)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 7 | Define `MarkerBlob` type (`version: number`, `createdAt: Date`, `entityTypes: readonly string[]`) in `src/tenant/` | E18 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:38:00Z |
| 8 | Implement `writeMarkerBlob(adapter, meta, entityTypes)` — creates `MarkerBlob` with `version: 1`, current timestamp, and entity type names; serializes via `serialize()` and writes to `__fyredb` blob key | E18 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:38:00Z |
| 9 | Implement `readMarkerBlob(adapter, meta)` — reads `__fyredb` blob via adapter, deserializes via `deserialize()`, returns `MarkerBlob | undefined` if blob not found | E18 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:38:00Z |
| 10 | Implement `validateMarkerBlob(blob)` — checks `version` field is supported (currently version 1), returns boolean; used by `setup()` to reject incompatible fyredb workspaces | E18 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:38:00Z |
| 11 | Update `TenantManager.create()` to call `writeMarkerBlob` with registered entity type names when creating marker blob at the tenant's `meta` location | E18 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:38:00Z |
| 12 | Update `TenantManager.setup()` to call `readMarkerBlob` and `validateMarkerBlob`; read tenant prefs from shared `meta` location via `loadTenantPrefs`; derive deterministic tenant ID via `deriveTenantId(meta)` | E18 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:38:00Z |
| 13 | Write unit tests for marker blob — `writeMarkerBlob`/`readMarkerBlob` round-trip, `readMarkerBlob` returns `undefined` for missing blob, `validateMarkerBlob` accepts version 1 and rejects unsupported versions, entity types array persisted correctly | E18 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:42:00Z |
| 14 | Write unit tests for sharing flow — `setup()` reads marker blob from shared location and detects existing workspace, derives same tenant ID as creator via `deriveTenantId`, merges tenant prefs into local list, rejects location without valid marker blob | E18 | developer | done | plan | 2026-03-23T22:30:00Z | 2026-03-23T22:42:00Z |

## Sprint 6 — Sync Engine: Diff, Copy & Merge
Started: 2026-03-23T23:00:00Z

Epics: E19 (Sync — Partition diff & copy optimization), E20 (Sync — Bidirectional merge & HLC conflict resolution)

### E19 — Sync: Partition diff & copy optimization (Layer 7)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 1 | Create `src/sync/` module — define core sync types: `PartitionDiffResult` with `localOnly: string[]`, `cloudOnly: string[]`, `diverged: string[]`, `unchanged: string[]` arrays; set up barrel `index.ts` with exports | E19 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 2 | Implement `loadIndexPair(localAdapter, cloudAdapter, meta, entityName)` — calls `loadPartitionIndex` for both local (`meta = undefined`) and cloud adapters; returns `{ localIndex, cloudIndex }` | E19 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 3 | Implement `diffPartitions(localIndex, cloudIndex)` — iterates union of all partition keys; categorizes: key only in local → `localOnly`, key only in cloud → `cloudOnly`, both with matching hash → `unchanged`, both with different hash → `diverged`; returns `PartitionDiffResult` | E19 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 4 | Implement `copyPartitionToCloud(localAdapter, cloudAdapter, meta, entityName, partitionKey)` — reads partition blob from local adapter (`meta = undefined`) using `partitionBlobKey(entityName, partitionKey)`, writes to cloud adapter with `meta`; no-op if local blob is null | E19 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 5 | Implement `copyPartitionToLocal(localAdapter, cloudAdapter, meta, entityName, partitionKey)` — reads partition blob from cloud adapter with `meta`, writes to local adapter (`meta = undefined`); no-op if cloud blob is null | E19 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 6 | Implement `syncCopyPhase(localAdapter, cloudAdapter, meta, entityName, diff)` — iterates `diff.localOnly` calling `copyPartitionToCloud` for each, iterates `diff.cloudOnly` calling `copyPartitionToLocal` for each; returns list of copied partition keys | E19 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 7 | Write unit tests for `diffPartitions` — all partitions unchanged, all local-only, all cloud-only, mixed categories, empty indexes on both sides, single diverged partition with hash mismatch | E19 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 8 | Write unit tests for copy operations — `copyPartitionToCloud` transfers blob correctly, `copyPartitionToLocal` transfers blob correctly, no-op when source blob is null, `syncCopyPhase` processes all localOnly and cloudOnly partitions | E19 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |

### E20 — Sync: Bidirectional merge & HLC conflict resolution (Layer 7, depends on E19)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|-----------|
| 9 | Implement `resolveConflict(localEntity, cloudEntity)` — compares HLC via `compareHlc(local.hlc, cloud.hlc)`; returns entity with higher HLC (last-writer-wins); deterministic ordering: timestamp → counter → nodeId tiebreaker | E20 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 10 | Implement `resolveEntityTombstone(entityHlc, tombstoneHlc)` — compares entity HLC with tombstone HLC via `compareHlc`; returns `'entity'` if entity HLC is higher, `'tombstone'` if delete wins | E20 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 11 | Implement `diffEntityMaps(localEntities, localTombstones, cloudEntities, cloudTombstones)` — categorizes entity IDs across local and cloud: `localOnly`, `cloudOnly`, `both` (present on both sides); accounts for tombstone presence on either side | E20 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 12 | Implement `mergePartition(localBlob, cloudBlob)` — deserializes both blobs into entity maps and tombstone maps, runs `diffEntityMaps`, resolves each conflict via `resolveConflict` and `resolveEntityTombstone`, produces merged entity map and merged tombstone map | E20 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 13 | Implement `syncMergePhase(localAdapter, cloudAdapter, meta, entityName, divergedKeys)` — for each diverged partition key: reads both blobs from local and cloud, calls `mergePartition`, serializes merged result, writes merged blob to both adapters | E20 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 14 | Implement `updateIndexesAfterSync(localAdapter, cloudAdapter, meta, entityName, localIndex, cloudIndex, syncedPartitions)` — recomputes hashes for all synced partitions via `partitionHash`, updates entries via `updatePartitionIndexEntry`, saves both indexes via `savePartitionIndex` | E20 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 15 | Implement `applyMergedToStore(store, entityName, mergedResults, eventBus)` — upserts merged entities into in-memory store, removes entities that lost to tombstones, emits entity events via event bus to trigger reactive observer updates | E20 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 16 | Write unit tests for conflict resolution — `resolveConflict` picks higher timestamp, counter breaks tie when timestamps equal, nodeId string comparison breaks final tie; `resolveEntityTombstone` picks correct winner in both directions | E20 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 17 | Write unit tests for partition merge — `mergePartition` includes local-only entities, cloud-only entities, conflicting entities resolved by HLC, tombstone vs entity resolution in both directions, both sides produce identical merged result | E20 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |
| 18 | Write unit tests for full sync integration — `syncMergePhase` processes all diverged keys, `updateIndexesAfterSync` recomputes correct hashes and persists both indexes, `applyMergedToStore` upserts correctly and emits entity events | E20 | developer | done | plan | 2026-03-23T23:00:00Z | 2026-03-23T23:10:00Z |

## Sprint 7 — Sync: Tombstones, Scheduler & Dirty Tracking
Started: 2026-03-23T23:30:00Z

Epics: E21 (Tombstones & retention), E22 (Three-phase model, scheduler & global lock), E23 (Dirty tracking & sync events)

### E21 — Sync: Tombstones & retention (Layer 8)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 1 | Add tombstone storage to `EntityStore` — implement `setTombstone(entityKey, entityId, hlc)` to record a deleted entity's HLC in a parallel `Map<string, Map<string, Hlc>>` tombstone structure; implement `getTombstones(entityKey): ReadonlyMap<string, Hlc>` to retrieve tombstones for a partition | E21 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 2 | Update `Repository.delete(id)` to call `store.setTombstone(entityKey, entityId, entity.hlc)` before removing entity from store partition — preserving the entity's HLC as a tombstone; update `deleteMany(ids)` similarly | E21 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 3 | Implement `purgeStaleTombstones(tombstones, retentionMs, now)` in `src/sync/` — iterates tombstone entries, removes those whose `hlc.timestamp` is older than `now - retentionMs`; default retention `90 * 24 * 60 * 60 * 1000` ms (90 days); returns count of purged entries | E21 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 4 | Integrate tombstone purging into `flushPartition` — call `purgeStaleTombstones` on the partition's tombstones using configured retention period before serializing the blob to adapter | E21 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 5 | Update `loadPartition` to restore tombstones from blob's `deleted` section into the store's tombstone map alongside entity data when hydrating from adapter | E21 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |

### E22 — Sync: Three-phase model, scheduler & global lock (Layer 8)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 6 | Define sync types in `src/sync/` — `SyncDirection` (`'memory-to-local' \| 'local-to-cloud' \| 'cloud-to-local' \| 'cloud-to-memory'`), `SyncQueueItem` (source, target, promise, resolve, reject), `SyncLock` type with `enqueue()`, `isRunning()`, `drain()`, `dispose()` | E22 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 7 | Implement `createSyncLock()` — global lock allowing one sync operation at a time; `enqueue(source, target, fn)` returns existing promise if duplicate already queued or running, otherwise queues and returns new promise; executes queued items sequentially | E22 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 8 | Implement Phase 1 hydrate — `hydrateFromCloud(cloudAdapter, localAdapter, store, entityNames, meta)` loads cloud partition indexes per entity type, downloads partition blobs, writes to local adapter, loads entities into memory store; returns list of hydrated entity types | E22 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 9 | Implement Phase 1 local-only fallback — `hydrateFromLocal(localAdapter, store, entityNames)` loads all partition indexes from local adapter per entity type, loads partition blobs into memory store; used when cloud is unreachable during initial hydrate | E22 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 10 | Implement Phase 2 periodic scheduler — `createSyncScheduler(options)` with configurable `localFlushIntervalMs` (default 2000) and `cloudSyncIntervalMs` (default 300000); `start()` begins interval timers that enqueue sync operations via sync lock; `stop()` clears all timers | E22 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 11 | Implement Phase 3 manual sync — `syncNow(syncLock, localAdapter, cloudAdapter, store, entityNames, meta)` enqueues immediate memory→local flush then local↔cloud full sync cycle sequentially through the sync lock; returns promise resolving when both complete | E22 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 12 | Implement scheduler lifecycle — `SyncScheduler.dispose()` stops periodic timers, drains sync lock queue (waits for in-flight operation), rejects further enqueue calls; integrate with `createSyncScheduler` | E22 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |

### E23 — Sync: Dirty tracking & sync events (Layer 8, depends on E22)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 13 | Define `SyncEvent` type union (`{ type: 'sync-started' }`, `{ type: 'sync-completed', result: SyncResult }`, `{ type: 'sync-failed', error: Error }`, `{ type: 'cloud-unreachable' }`) and `SyncResult` type (`entitiesUpdated: number`, `conflictsResolved: number`, `partitionsSynced: number`) in `src/sync/` | E23 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 14 | Implement `createSyncEventEmitter()` — manages sync event listeners via `on(listener)`, `off(listener)`, `emit(event)` methods; typed to `SyncEvent` union | E23 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 15 | Integrate sync events with sync lock — fire `sync-started` before each sync operation begins, `sync-completed` with `SyncResult` on success, `sync-failed` with error on failure, `cloud-unreachable` when cloud adapter throws connectivity error during hydrate or periodic sync | E23 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 16 | Implement `createDirtyTracker()` — `isDirty: boolean` getter tracks whether any data hasn't reached cloud; `isDirty$: Observable<boolean>` emits reactive dirty-state changes via `distinctUntilChanged`; set dirty on any store write, clear only after successful local→cloud sync | E23 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |
| 17 | Integrate dirty tracker with store and sync — mark dirty on every `Repository.save`/`saveMany`/`delete`/`deleteMany` operation; clear dirty flag when local→cloud sync completes successfully; expose `isDirty` and `isDirty$` from sync module | E23 | developer | done | plan | 2026-03-23T23:30:00Z | 2026-03-23T23:55:00Z |

## Sprint 8 — Framework Entry Point & Graceful Shutdown (Final Sprint)
Started: 2026-03-24T00:00:00Z

Epics: E24 (Framework Entry Point — createFyreDb()), E25 (Framework — Graceful shutdown & dispose)

### E24 — Framework Entry Point: createFyreDb() (Layer 9)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 1 | Define `FyreDbConfig` type in `src/` root — `entities: EntityDefinition[]`, `localAdapter: BlobAdapter`, `cloudAdapter?: BlobAdapter`, `deviceId: string`, and `FyreDbOptions` (optional `flushDebounceMs`, `cloudSyncIntervalMs`, `localFlushIntervalMs`, `tombstoneRetentionMs` with defaults) | E24 | developer | done | plan | 2026-03-24T00:00:00Z | 2026-03-24T06:05:00Z |
| 2 | Define `FyreDb` type in `src/` root — public API surface: `tenants: TenantManager`, `repo(def): Repository<T>`, `sync(): Promise<SyncResult>`, `dispose(): Promise<void>`, `isDirty: boolean`, `isDirty$: Observable<boolean>`, `onSyncEvent(listener)`, `offSyncEvent(listener)` | E24 | developer | done | plan | 2026-03-24T00:00:00Z | 2026-03-24T06:05:00Z |
| 3 | Implement `validateEntityDefinitions(entities)` in `src/` root — reject duplicate entity names, empty entity list, missing name fields; throw descriptive errors on validation failure | E24 | developer | done | plan | 2026-03-24T00:00:00Z | 2026-03-24T06:05:00Z |
| 4 | Implement `createFyreDb(config)` core setup — validate entity defs via `validateEntityDefinitions`, create HLC via `createHlc(config.deviceId)`, create event bus via `createEventBus()`, create in-memory store via `createStore()`, create flush scheduler via `createFlushScheduler` with configured debounce interval | E24 | developer | done | plan | 2026-03-24T00:00:00Z | 2026-03-24T06:05:00Z |
| 5 | Implement repository creation within `createFyreDb` — iterate entity definitions, create `Repository<T>` or `SingletonRepository<T>` per key strategy (singleton strategy → SingletonRepository, otherwise → Repository), build lookup `Map<EntityDefinition, Repository>` keyed by definition reference; expose `fyredb.repo(def)` accessor that retrieves from map | E24 | developer | done | plan | 2026-03-24T00:00:00Z | 2026-03-24T06:05:00Z |
| 6 | Implement sync infrastructure wiring within `createFyreDb` — create sync lock via `createSyncLock()`, create sync event emitter via `createSyncEventEmitter()`, create dirty tracker via `createDirtyTracker()`, create sync scheduler via `createSyncScheduler` with configured intervals (starts idle until tenant loads) | E24 | developer | done | plan | 2026-03-24T00:00:00Z | 2026-03-24T06:05:00Z |
| 7 | Implement tenant manager wiring within `createFyreDb` — create `TenantManager` with local adapter and optional cloud adapter; expose as `fyredb.tenants` | E24 | developer | done | plan | 2026-03-24T00:00:00Z | 2026-03-24T06:05:00Z |
| 8 | Implement hydrate-on-tenant-load — when `tenants.load(tenantId)` resolves, trigger Phase 1 hydrate: if cloud adapter present, attempt `hydrateFromCloud` with tenant's `meta`; on cloud failure emit `cloud-unreachable` event and fall back to `hydrateFromLocal`; start sync scheduler after hydrate completes | E24 | developer | done | plan | 2026-03-24T00:00:00Z | 2026-03-24T06:05:00Z |
| 9 | Implement `fyredb.sync()` — delegate to `syncNow()` via sync lock using active tenant's `meta`; reject with descriptive error if no tenant loaded or no cloud adapter configured; return `Promise<SyncResult>` | E24 | developer | done | plan | 2026-03-24T00:00:00Z | 2026-03-24T06:05:00Z |
| 10 | Expose sync events and dirty state on FyreDb instance — wire `fyredb.onSyncEvent(listener)` / `fyredb.offSyncEvent(listener)` to sync event emitter; expose `fyredb.isDirty` getter and `fyredb.isDirty$` observable from dirty tracker | E24 | developer | done | plan | 2026-03-24T00:00:00Z | 2026-03-24T06:05:00Z |
| 11 | Create barrel `index.ts` for `src/` root module — re-export `createFyreDb`, `FyreDbConfig`, `FyreDb`, `FyreDbOptions`, `defineEntity`, `EntityDefinition`, `BlobAdapter`, `BlobTransform`, and other public API types needed by consumers | E24 | developer | done | plan | 2026-03-24T00:00:00Z | 2026-03-24T06:05:00Z |

### E25 — Framework: Graceful shutdown & dispose (Layer 9, depends on E24)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 12 | Implement `fyredb.dispose()` — stop sync scheduler via `syncScheduler.dispose()`, drain sync lock via `syncLock.drain()` (await in-flight sync), force immediate flush of all dirty partitions via `flushScheduler.flush()` (bypass debounce), dispose all repositories (complete subjects, remove event bus listeners), dispose flush scheduler | E25 | developer | done | plan | 2026-03-24T00:00:00Z | 2026-03-24T06:05:00Z |
| 13 | Implement post-dispose guards on FyreDb instance — after dispose completes, `sync()` rejects with `Error('FyreDb instance is disposed')`, `repo()` throws, `tenants.load()` rejects; set internal `disposed` flag checked by all public methods before execution | E25 | developer | done | plan | 2026-03-24T00:00:00Z | 2026-03-24T06:05:00Z |
| 14 | Implement `dispose()` idempotency — store the `Promise<void>` from first `dispose()` call; subsequent calls return the same promise without re-executing the shutdown sequence | E25 | developer | done | plan | 2026-03-24T00:00:00Z | 2026-03-24T06:05:00Z |

## Integration Testing

### Integration Tests

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 15 | Write lifecycle integration tests (`tests/integration/lifecycle.test.ts`) — save → dispose → reload data persisted, dispose flushes dirty data, post-dispose rejection (repo/sync/tenants.load), dispose idempotency, multiple entity types survive reload, partitioned entities survive reload (8 tests) | All | integration-tester | done | test | 2026-03-24T06:15:00Z | 2026-03-24T06:50:00Z |
| 16 | Write sync integration tests (`tests/integration/sync.test.ts`) — two-device sync via shared cloud adapter: save→sync→hydrate, HLC conflict resolution (last writer wins), tombstone propagation via delete→sync, save+delete interleave across devices, bidirectional saves (5 tests) | E20-E22 | integration-tester | done | test | 2026-03-24T06:15:00Z | 2026-03-24T06:50:00Z |
| 17 | Write repository + reactive integration tests (`tests/integration/repo-reactive.test.ts`) — observe(id) emits/undefined, observeQuery with filter, saveMany single emission, deleteMany single emission, dispose completes observers, observeQuery with orderBy+limit (10 tests) | E5,E6,E7 | integration-tester | done | test | 2026-03-24T06:15:00Z | 2026-03-24T06:50:00Z |
| 18 | Write tenant integration tests (`tests/integration/tenant.test.ts`) — create→load→save, tenant list persistence, multi-tenant data isolation, delink, setup via marker blob, setup rejection, shared tenant via deriveTenantId, delete tenant+data (8 tests) | E8,E9,E10 | integration-tester | done | test | 2026-03-24T06:15:00Z | 2026-03-24T06:50:00Z |
| 19 | Write persistence round-trip integration tests (`tests/integration/persistence.test.ts`) — Date field survival through flush→reload, multiple partition blobs, hash determinism, hash sensitivity to HLC changes, type marker preservation, version increment persistence, tombstone inclusion in blob (7 tests) | E11-E14 | integration-tester | done | test | 2026-03-24T06:15:00Z | 2026-03-24T06:50:00Z |

### Bug Fixes Discovered During Integration Testing

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 20 | Fix: `flushAll` must update partition index (`__index.{entityName}`) after flushing dirty partitions — design doc says "Updated on every flush" but implementation only wrote partition blobs without updating the index, preventing `hydrateFromLocal`/`hydrateFromCloud` from discovering partitions on reload | E11 | developer | done | test-fix | 2026-03-24T06:30:00Z | 2026-03-24T06:35:00Z |
| 21 | Fix: `syncCloudCycle` must apply merged entities/tombstones back to in-memory store after merge — sync wrote merged blobs to adapters but never updated the in-memory Map, so reactive observers and repo.get() returned stale data after sync | E20 | developer | done | test-fix | 2026-03-24T06:35:00Z | 2026-03-24T06:38:00Z |
| 22 | Fix: `hydrateFromCloud` must copy cloud partition index to local adapter — without this, subsequent syncs couldn't detect diverged partitions because the local index was empty, causing all partitions to be treated as cloud-only copies instead of merge candidates | E20 | developer | done | test-fix | 2026-03-24T06:38:00Z | 2026-03-24T06:40:00Z |
| 23 | Fix: partition hash must differentiate entities from tombstones — when `deleteFromStore` creates a tombstone with the entity's existing HLC, the hash input (`id:timestamp:counter:nodeId`) was identical for both entity and tombstone, causing `diffPartitions` to report `unchanged` instead of `diverged` and preventing tombstone sync propagation. Fixed by prefixing tombstone keys with `\0` in hash computation | E15 | developer | done | test-fix | 2026-03-24T06:40:00Z | 2026-03-24T06:45:00Z |
| 24 | Fix: update existing `flush.test.ts` assertion for `flush() cancels pending timer` — test expected 1 adapter write but partition index update adds a second write; updated to expect 2 writes (partition blob + partition index) | E11 | integration-tester | done | test-fix | 2026-03-24T06:45:00Z | 2026-03-24T06:50:00Z |

## Sprint — Partition Index Enhancements & Unified Sync
Started: 2026-03-24T18:00:00Z

Epics: E11 (Persistence — Partition index), unified-sync (Unified sync logic)

| # | Task | Epic | Assigned | Status | Source | Created | Completed |
|---|------|------|----------|--------|--------|---------|----------|
| 1 | Add `deletedCount` field to `PartitionIndexEntry` in `src/persistence/types.ts` — new optional `readonly deletedCount: number` tracking tombstone count separately from live entity count | E11 | developer | done | plan | 2026-03-24T18:00:00Z | 2026-03-24T20:17:00Z |
| 2 | Update `updatePartitionIndexEntry` in `src/persistence/partition-index.ts` to accept and store `deletedCount` parameter | E11 | developer | done | plan | 2026-03-24T18:00:00Z | 2026-03-24T20:17:00Z |
| 3 | Update `flushPartition` in `src/store/flush.ts` to compute tombstone count from the partition's tombstone map and pass `deletedCount` when updating the partition index entry | E11 | developer | done | plan | 2026-03-24T18:00:00Z | 2026-03-24T20:17:00Z |
| 4 | Update `updateIndexesAfterSync` in `src/sync/sync-phase.ts` to compute and pass `deletedCount` when rebuilding index entries after merge | E11 | developer | done | plan | 2026-03-24T18:00:00Z | 2026-03-24T20:17:00Z |
| 5 | Define `SyncBetweenResult` type and `syncBetween(adapterA, adapterB, store, entityNames, meta)` function signature in `src/sync/unified.ts` — result includes hydrated entity names, partitions copied, partitions merged, conflicts resolved | unified-sync | developer | done | plan | 2026-03-24T18:00:00Z | 2026-03-24T20:17:00Z |
| 6 | Implement `syncBetween` core logic — load indexes from both adapters via `loadAllIndexes`, diff partitions via `diffPartitions`, copy A-only partitions to B and B-only partitions to A via `syncCopyPhase`, merge diverged partitions via `syncMergePhase`, apply merged entities/tombstones to in-memory store, load newly-copied partitions into store, update and save indexes on both adapters | unified-sync | developer | done | plan | 2026-03-24T18:00:00Z | 2026-03-24T20:17:00Z |
| 7 | Refactor `hydrateFromCloud` in `src/sync/hydrate.ts` to delegate to `syncBetween(cloudAdapter, localAdapter, store, entityNames, meta)` — replace manual index loading, blob copying, and store loading with single `syncBetween` call | unified-sync | developer | done | plan | 2026-03-24T18:00:00Z | 2026-03-24T20:17:00Z |
| 8 | Refactor `syncCloudCycle` in `src/sync/sync-scheduler.ts` to delegate to `syncBetween(localAdapter, cloudAdapter, store, entityNames, meta)` — replace manual diff/copy/merge/index-update logic with single `syncBetween` call | unified-sync | developer | done | plan | 2026-03-24T18:00:00Z | 2026-03-24T20:17:00Z |
| 9 | Update `src/sync/index.ts` exports to expose `syncBetween` and `SyncBetweenResult` | unified-sync | developer | done | plan | 2026-03-24T18:00:00Z | 2026-03-24T20:17:00Z |
| 10 | Unit tests for `deletedCount` in partition index and `syncBetween` | E11, unified-sync | unit-tester | done | test | 2026-03-24T20:18:00Z | 2026-03-24T20:20:00Z |
| 11 | Integration tests for `syncBetween` with full FyreDb lifecycle | unified-sync | integration-tester | done | test | 2026-03-24T20:20:00Z | 2026-03-24T20:21:00Z |
