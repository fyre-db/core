export type FyreDbOptions = {
  readonly localFlushDebounceMs?: number;
  readonly localFlushMaxWaitMs?: number;
  readonly cloudSyncDebounceMs?: number;
  readonly cloudSyncMaxWaitMs?: number;
  readonly cloudPullIntervalMs?: number;
  readonly tombstoneRetentionMs?: number;
  readonly tenantKey?: string;
  readonly markerKey?: string;
  readonly systemEntityKey?: string;
};

export type ResolvedFyreDbOptions = Required<FyreDbOptions>;

import { FyreDbConfigError } from '@/errors';

function validatePositiveInterval(name: string, value: number): void {
  if (value <= 0 || !Number.isFinite(value)) {
    throw new FyreDbConfigError(`Invalid ${name}: ${value}. Must be a finite positive number.`);
  }
}

export function resolveOptions(opts?: FyreDbOptions): ResolvedFyreDbOptions {
  const tombstoneRetentionMs = opts?.tombstoneRetentionMs ?? 7 * 24 * 60 * 60 * 1000;
  if (tombstoneRetentionMs < 0 || !Number.isFinite(tombstoneRetentionMs)) {
    throw new FyreDbConfigError(`Invalid tombstoneRetentionMs: ${tombstoneRetentionMs}. Must be a finite non-negative number.`);
  }

  // Local flush: memory → local, edit-driven (debounce + ceiling).
  const localFlushDebounceMs = opts?.localFlushDebounceMs ?? 500;
  validatePositiveInterval('localFlushDebounceMs', localFlushDebounceMs);
  const localFlushMaxWaitMs = opts?.localFlushMaxWaitMs ?? 3_000;
  validatePositiveInterval('localFlushMaxWaitMs', localFlushMaxWaitMs);
  if (localFlushMaxWaitMs < localFlushDebounceMs) {
    throw new FyreDbConfigError(`localFlushMaxWaitMs (${localFlushMaxWaitMs}) must be >= localFlushDebounceMs (${localFlushDebounceMs}).`);
  }

  // Cloud sync: local ↔ cloud, edit-driven (debounce + ceiling).
  const cloudSyncDebounceMs = opts?.cloudSyncDebounceMs ?? 10_000;
  validatePositiveInterval('cloudSyncDebounceMs', cloudSyncDebounceMs);
  const cloudSyncMaxWaitMs = opts?.cloudSyncMaxWaitMs ?? 60_000;
  validatePositiveInterval('cloudSyncMaxWaitMs', cloudSyncMaxWaitMs);
  if (cloudSyncMaxWaitMs < cloudSyncDebounceMs) {
    throw new FyreDbConfigError(`cloudSyncMaxWaitMs (${cloudSyncMaxWaitMs}) must be >= cloudSyncDebounceMs (${cloudSyncDebounceMs}).`);
  }

  // Cloud pull: periodic backstop that fetches remote changes when this device
  // is idle (no local edits to trigger an edit-driven cloud sync).
  const cloudPullIntervalMs = opts?.cloudPullIntervalMs ?? 300_000;
  validatePositiveInterval('cloudPullIntervalMs', cloudPullIntervalMs);

  return {
    localFlushDebounceMs,
    localFlushMaxWaitMs,
    cloudSyncDebounceMs,
    cloudSyncMaxWaitMs,
    cloudPullIntervalMs,
    tombstoneRetentionMs,
    tenantKey: opts?.tenantKey ?? '__tenants',
    markerKey: opts?.markerKey ?? '__fyredb',
    systemEntityKey: opts?.systemEntityKey ?? '__system',
  };
}
