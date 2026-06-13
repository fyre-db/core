import { FyreDb, defineEntity } from '@fyre-db/core';
import { Subscription } from 'rxjs';
import { FsStorageAdapter, tmpDirFor, cleanTmpDir } from './common';

type Task = { title: string; done: boolean };

const TaskDef = defineEntity<Task>('task');

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function main() {
  const dataDir = tmpDirFor('app-reactive');
  await cleanTmpDir(dataDir);

  const storage = new FsStorageAdapter(dataDir);

  const fyredb = new FyreDb({
    appId: 'reactive-demo',
    entities: [TaskDef],
    localAdapter: storage,
    deviceId: 'device-1',
  });

  const tenant = await fyredb.tenants.create({ name: 'Demo', meta: {} });
  await fyredb.tenants.open(tenant.id);

  const repo = fyredb.repo(TaskDef);
  const subs: Subscription[] = [];

  // ── 1. observe(id) ────────────────────────────────────
  console.log('=== observe(id) ===');

  const id = repo.save({ title: 'Write docs', done: false });
  console.log('Saved task:', id);

  subs.push(
    repo.observe(id).subscribe(task => {
      if (task) {
        console.log(`  [observe] title="${task.title}" done=${task.done} v=${task.version}`);
      } else {
        console.log('  [observe] undefined (deleted)');
      }
    }),
  );

  await delay(50);
  repo.save({ title: 'Write docs (updated)', done: false, id });
  await delay(50);
  repo.save({ title: 'Write docs (updated)', done: true, id });
  await delay(50);
  repo.delete(id);
  await delay(50);

  // ── 2. observeQuery ───────────────────────────────────
  console.log('\n=== observeQuery ===');

  let emissionCount = 0;
  subs.push(
    repo.observeQuery({ where: { done: false } }).subscribe(results => {
      emissionCount++;
      console.log(`  [query #${emissionCount}] open tasks: ${results.length}`,
        results.map(t => t.title));
    }),
  );

  await delay(50);
  const a = repo.save({ title: 'Task A', done: false });
  await delay(50);
  const b = repo.save({ title: 'Task B', done: false });
  await delay(50);
  repo.save({ title: 'Task C', done: true }); // done=true, won't appear
  await delay(50);

  // Mark Task A as done — open count drops from 2 → 1
  repo.save({ title: 'Task A', done: true, id: a });
  await delay(50);

  repo.delete(b);
  await delay(50);

  // ── 3. Batch vs individual saves ──────────────────────
  console.log('\n=== Batch (saveMany) vs individual save() ===');

  let batchEmissions = 0;
  subs.push(
    repo.observeQuery().subscribe(() => {
      batchEmissions++;
    }),
  );

  await delay(50);
  const beforeBatch = batchEmissions;

  repo.saveMany([
    { title: 'Batch 1', done: false },
    { title: 'Batch 2', done: false },
    { title: 'Batch 3', done: false },
  ]);
  await delay(50);
  console.log(`  saveMany(3 items) → ${batchEmissions - beforeBatch} emission(s)`);

  const beforeIndividual = batchEmissions;
  repo.save({ title: 'Individual 1', done: false });
  repo.save({ title: 'Individual 2', done: false });
  repo.save({ title: 'Individual 3', done: false });
  await delay(50);
  console.log(`  3x save()          → ${batchEmissions - beforeIndividual} emission(s)`);

  // ── Cleanup ───────────────────────────────────────────
  for (const sub of subs) sub.unsubscribe();
  await fyredb.dispose();

  console.log('\nDone.');
}

main().catch(console.error);

