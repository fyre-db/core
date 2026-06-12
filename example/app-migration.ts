import { Strata, defineEntity } from '@fyre-db/core';
import type { BlobMigration } from '@fyre-db/core';
import { FsStorageAdapter, tmpDirFor, cleanTmpDir } from './common';

async function main() {
  const dataDir = tmpDirFor('app-migration');
  await cleanTmpDir(dataDir);

  const storage = new FsStorageAdapter(dataDir);

  // ── Phase 1 — Save data WITHOUT migrations ──────────────

  console.log('=== Phase 1: Save tasks (no migrations) ===\n');

  type TaskV0 = { title: string; done: boolean };
  const taskDefV0 = defineEntity<TaskV0>('task');

  const strata1 = new Strata({
    appId: 'migration-demo',
    entities: [taskDefV0],
    localAdapter: storage,
    deviceId: 'device-1',
  });

  const tenant = await strata1.tenants.create({ name: 'Demo', meta: {} });
  await strata1.tenants.open(tenant.id);

  const tasks1 = strata1.repo(taskDefV0);
  tasks1.save({ title: 'Buy groceries', done: false });
  tasks1.save({ title: 'Write tests', done: true });
  tasks1.save({ title: 'Deploy app', done: false });

  console.log('Saved tasks (v0, no priority field):');
  for (const t of tasks1.query()) {
    console.log(`  - [${t.done ? 'x' : ' '}] ${t.title}`);
  }

  await strata1.dispose();
  console.log();

  // ── Phase 2 — Reload WITH migration ─────────────────────

  console.log('=== Phase 2: Reload with migration (v1 adds priority) ===\n');

  type TaskV1 = { title: string; done: boolean; priority: string };
  const taskDefV1 = defineEntity<TaskV1>('task');

  const migration: BlobMigration = {
    version: 1,
    entities: [taskDefV1],
    migrate: (blob) => {
      const entries = (blob.task ?? {}) as Record<string, Record<string, unknown>>;
      const migrated: Record<string, unknown> = {};
      for (const [id, entity] of Object.entries(entries)) {
        migrated[id] = { ...entity, priority: (entity).priority ?? 'medium' };
      }
      return { ...blob, task: migrated };
    },
  };

  const strata2 = new Strata({
    appId: 'migration-demo',
    entities: [taskDefV1],
    localAdapter: storage,
    deviceId: 'device-1',
    migrations: [migration],
  });

  await strata2.tenants.open(tenant.id);

  const tasks2 = strata2.repo(taskDefV1);
  console.log('Tasks after migration (v1, with priority):');
  for (const t of tasks2.query()) {
    console.log(`  - [${t.done ? 'x' : ' '}] ${t.title} (priority: ${t.priority})`);
  }

  await strata2.dispose();
}

main().catch(console.error);

