import { Strata, defineEntity } from '@fyre-db/core';
import { FsStorageAdapter, tmpDirFor, cleanTmpDir } from './common';

// ─── Define a Task entity ────────────────────────────────
type Task = { title: string; done: boolean };

const taskDef = defineEntity<Task>('task');

// ─── Main ────────────────────────────────────────────────
async function main() {
  const dataDir = tmpDirFor('app-basic');
  await cleanTmpDir(dataDir);

  const storage = new FsStorageAdapter(dataDir);

  // Create a Strata instance backed by file storage
  const strata = new Strata({
    appId: 'demo',
    entities: [taskDef],
    localAdapter: storage,
    deviceId: 'device-1',
  });

  // Create and load a tenant (required before any data operations)
  const tenant = await strata.tenants.create({ name: 'My Workspace', meta: {} });
  await strata.tenants.open(tenant.id);

  const tasks = strata.repo(taskDef);

  // ── Save ───────────────────────────────────────────────
  console.log('=== Save ===');
  const id1 = tasks.save({ title: 'Buy groceries', done: false });
  const id2 = tasks.save({ title: 'Write docs', done: false });
  const id3 = tasks.save({ title: 'Deploy v2', done: true });
  console.log('Saved task IDs:', id1, id2, id3);

  // ── Get ────────────────────────────────────────────────
  console.log('\n=== Get ===');
  const fetched = tasks.get(id1);
  console.log('Fetched task:', fetched?.title, '| done:', fetched?.done);

  // ── Query (all) ────────────────────────────────────────
  console.log('\n=== Query All ===');
  const all = tasks.query();
  console.log('All tasks:', all.map(t => t.title));

  // ── Query with where filter ────────────────────────────
  console.log('\n=== Query Where (done: true) ===');
  const completed = tasks.query({ where: { done: true } });
  console.log('Completed tasks:', completed.map(t => t.title));

  // ── Update (spread existing entity + changes) ──────────
  console.log('\n=== Update ===');
  const existing = tasks.get(id1)!;
  tasks.save({ ...existing, done: true });
  const updated = tasks.get(id1)!;
  console.log('Updated task:', updated.title, '| done:', updated.done, '| version:', updated.version);

  // ── Delete ─────────────────────────────────────────────
  console.log('\n=== Delete ===');
  const deleted = tasks.delete(id3);
  console.log('Deleted:', deleted);
  console.log('Remaining tasks:', tasks.query().map(t => t.title));

  // ── Dispose ────────────────────────────────────────────
  await strata.dispose();
  console.log('\nDone!');
}

main().catch(console.error);
