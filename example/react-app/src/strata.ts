import { Strata, defineEntity } from '@fyre-db/core';
import { LocalStorageAdapter } from '@fyre-db/plugins';

// ─── Entity Definitions ──────────────────────────────────

export type Task = { title: string; done: boolean };
export const taskDef = defineEntity<Task>('task');

// ─── Strata Instance ─────────────────────────────────────

export const strata = new Strata({
  appId: 'react-example',
  entities: [taskDef],
  localAdapter: new LocalStorageAdapter('react-example'),
  deviceId: 'browser-1',
});

// Expose for browser console debugging
// Usage: strata.tenants.list(), tasks.query(), tasks.save({title:'test',done:false})
(globalThis as Record<string, unknown>).strata = strata;
(globalThis as Record<string, unknown>).tasks = strata.repo(taskDef);
