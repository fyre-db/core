import { FyreDb, defineEntity } from '@fyre-db/core';
import { FsStorageAdapter, tmpDirFor, cleanTmpDir, printTree } from './common';

// ─── Entity ──────────────────────────────────────────────

const Task = defineEntity<{ title: string; done: boolean }>('task');

// ─── Main ────────────────────────────────────────────────

async function main() {
  const tmpDir = tmpDirFor('app-persistent');

  // Clean up from any previous run
  await cleanTmpDir(tmpDir);

  const storage = new FsStorageAdapter(tmpDir);

  // ── Session 1: create tenant and save tasks ────────────
  console.log('=== Session 1: Write ===');
  const db1 = new FyreDb({
    appId: 'persistent-demo',
    entities: [Task],
    localAdapter: storage,
    deviceId: 'device-1',
  });

  const tenant = await db1.tenants.create({
    name: 'My Workspace',
    meta: {},
  });

  await db1.tenants.open(tenant.id);

  const tasks = db1.repo(Task);
  tasks.save({ title: 'Design schema', done: true });
  tasks.save({ title: 'Implement adapter', done: false });
  tasks.save({ title: 'Write tests', done: false });

  console.log('Saved tasks:');
  for (const t of tasks.query()) {
    console.log(`  [${t.done ? 'x' : ' '}] ${t.title}`);
  }

  await db1.dispose();
  console.log('\nFyreDb disposed — data flushed to disk.\n');

  // ── Show files on disk ─────────────────────────────────
  console.log('Files on disk:');
  await printTree(tmpDir);

  // ── Session 2: reload from disk ────────────────────────
  console.log('\n=== Session 2: Read ===');
  const db2 = new FyreDb({
    appId: 'persistent-demo',
    entities: [Task],
    localAdapter: storage,
    deviceId: 'device-1',
  });

  await db2.tenants.open(tenant.id);

  const reloaded = db2.repo(Task).query();
  console.log(`Loaded ${reloaded.length} tasks from disk:`);
  for (const t of reloaded) {
    console.log(`  [${t.done ? 'x' : ' '}] ${t.title}`);
  }

  await db2.dispose();
  console.log('\nDone.');
}

main().catch(console.error);

