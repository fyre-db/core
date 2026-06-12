import { FyreDb, defineEntity } from '@fyre-db/core';
import { LocalStorageAdapter } from '@fyre-db/plugins';

// ─── Entity Definitions ──────────────────────────────────

export type Task = { title: string; done: boolean };
export const taskDef = defineEntity<Task>('task');

// ─── FyreDb Instance ─────────────────────────────────────

export const fyredb = new FyreDb({
  appId: 'react-example',
  entities: [taskDef],
  localAdapter: new LocalStorageAdapter('react-example'),
  deviceId: 'browser-1',
});

// Expose for browser console debugging
// Usage: fyredb.tenants.list(), tasks.query(), tasks.save({title:'test',done:false})
(globalThis as Record<string, unknown>).fyredb = fyredb;
(globalThis as Record<string, unknown>).tasks = fyredb.repo(taskDef);
