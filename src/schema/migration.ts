import type { PartitionBlob } from '@/persistence';
import type { EntityDefinition } from './types';
import { FyreDbConfigError } from '@/errors';

export type BlobMigration = {
  readonly version: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly entities?: ReadonlyArray<EntityDefinition<any>>;
  readonly migrate: (blob: PartitionBlob) => PartitionBlob;
};

/**
 * Validates that migration versions form a contiguous 1-based sequence
 * (1, 2, 3, …) with no gaps or duplicates. Call once at startup.
 */
export function validateMigrations(
  migrations: ReadonlyArray<BlobMigration>,
): void {
  if (migrations.length === 0) return;

  const sorted = [...migrations].sort((a, b) => a.version - b.version);

  for (let i = 0; i < sorted.length; i++) {
    const expected = i + 1;
    const actual = sorted[i].version;
    if (actual !== expected) {
      if (i > 0 && sorted[i - 1].version === actual) {
        throw new FyreDbConfigError(`Duplicate migration version: ${actual}`);
      }
      throw new FyreDbConfigError(
        `Migration versions must be contiguous starting at 1. Expected version ${expected}, got ${actual}`,
      );
    }
  }
}

export function migrateBlob(
  blob: PartitionBlob,
  migrations: ReadonlyArray<BlobMigration>,
  entityName?: string,
): PartitionBlob {
  const storedVersion = blob.__v ?? 0;
  const sorted = [...migrations]
    .filter(m => m.version > storedVersion)
    .filter(m => !entityName || !m.entities || m.entities.some(def => def.name === entityName))
    .sort((a, b) => a.version - b.version);

  let current = blob;
  for (const m of sorted) {
    current = m.migrate(current);
  }

  if (sorted.length === 0) return current;
  const maxVersion = sorted[sorted.length - 1].version;
  return { ...current, __v: maxVersion };
}
