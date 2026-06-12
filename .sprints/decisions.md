# Implementation Decisions

Append-only log of decisions made during sprints that are not explicitly covered by the design docs.

<!-- Format:
## DNNN — Sprint NNN — timestamp

**Agent:** developer | reviewer | vp
**Component:** hlc | schema | adapter | store | repo | reactive | persistence | sync | tenant
**Decision:** what was decided
**Rationale:** why
**Status:** accepted | superseded-by-DNNN
-->

## D001 — sprint-migration-sync-cleanup — 2026-03-27T14:05:00Z

**Agent:** vp
**Component:** schema, persistence, store
**Decision:** Migration redesign uses blob-level `__v` and `BlobMigration` type instead of per-entity `__v` and `migrateEntity`.
**Rationale:** E32 spec requires moving `__v` to blob level and decoupling migrations from `defineEntity`. The `PartitionBlob` type gains an optional `__v` field. Migrations are `ReadonlyArray<BlobMigration>` on `FyreDbConfig`, each with a `version` and `migrate(blob) → blob` function. The `migrateBlob()` function applies migrations sequentially above the stored version. Entity-level `version`/`migrations` removed from `EntityDefinition`, `EntityDefinitionOptions`, and `defineEntity`.
**Status:** accepted

## D002 — sprint-migration-sync-cleanup — 2026-03-27T14:10:00Z

**Agent:** vp
**Component:** sync
**Decision:** `hydrateFromCloud` removed from barrel exports; all callers now use `syncBetween` directly.
**Rationale:** E33 spec requires deduplication of `hydrateFromCloud`/`syncCloudCycle`. `hydrateFromCloud` was a thin wrapper around `syncBetween`. Inlining it eliminates an unnecessary abstraction layer. The `hydrate.ts` file remains on disk for reference but is no longer exported.
**Status:** accepted

## D003 — sprint-migration-sync-cleanup — 2026-03-27T14:10:00Z

**Agent:** vp
**Component:** sync
**Decision:** `SyncScheduler` accepts optional `DirtyTracker` and `SyncEventEmitter` via `SyncSchedulerOptions` rather than as separate constructor parameters.
**Rationale:** Keeps the existing `createSyncScheduler` signature stable while enabling DM-13 (dirty tracking after cloud sync) and sync event emission from the scheduler. Using options makes both dependencies optional for backward compatibility with existing tests.
**Status:** accepted
