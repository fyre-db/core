import { Strata, defineEntity } from '@fyre-db/core';
import { FsStorageAdapter, tmpDirFor, cleanTmpDir } from './common';

type Task = { title: string; done: boolean };
const TaskDef = defineEntity<Task>('task');

async function main() {
  const dataDir = tmpDirFor('app-multi-tenant');
  await cleanTmpDir(dataDir);

  const storage = new FsStorageAdapter(dataDir);

  const strata = new Strata({
    appId: 'multi-tenant-demo',
    entities: [TaskDef],
    localAdapter: storage,
    deviceId: 'device-1',
  });

  // ── 1. Create two tenants ──────────────────────────────
  console.log('=== Creating Tenants ===');
  const work = await strata.tenants.create({ name: 'Work', meta: {} });
  const personal = await strata.tenants.create({ name: 'Personal', meta: {} });
  console.log(`Created: "${work.name}" (${work.id})`);
  console.log(`Created: "${personal.name}" (${personal.id})`);

  // ── 2. List all tenants ────────────────────────────────
  console.log('\n=== All Tenants ===');
  const tenants = await strata.tenants.list();
  for (const t of tenants) {
    console.log(`  - ${t.name} [${t.id}]`);
  }

  // ── 3. Load Work tenant & save work tasks ──────────────
  console.log('\n=== Loading Work Tenant ===');
  await strata.tenants.open(work.id);
  console.log(`Active tenant: ${strata.tenants.activeTenant?.name}`);

  const taskRepo = strata.repo(TaskDef);
  taskRepo.save({ title: 'Finish quarterly report', done: false });
  taskRepo.save({ title: 'Review PR #42', done: true });
  taskRepo.save({ title: 'Update CI pipeline', done: false });
  console.log('Saved 3 work tasks');

  // ── 4. Load Personal tenant & save personal tasks ──────
  console.log('\n=== Loading Personal Tenant ===');
  await strata.tenants.open(personal.id);
  console.log(`Active tenant: ${strata.tenants.activeTenant?.name}`);

  taskRepo.save({ title: 'Buy groceries', done: false });
  taskRepo.save({ title: 'Book dentist appointment', done: true });
  console.log('Saved 2 personal tasks');

  // ── 5. Query personal tasks (work tasks NOT visible) ───
  console.log('\n=== Personal Tasks (tenant isolation check) ===');
  const personalTasks = taskRepo.query();
  console.log(`Found ${personalTasks.length} task(s):`);
  for (const t of personalTasks) {
    console.log(`  [${t.done ? 'x' : ' '}] ${t.title}`);
  }

  // ── 6. Switch back to Work tenant ──────────────────────
  console.log('\n=== Switching back to Work Tenant ===');
  await strata.tenants.open(work.id);
  console.log(`Active tenant: ${strata.tenants.activeTenant?.name}`);

  const workTasks = taskRepo.query();
  console.log(`Found ${workTasks.length} task(s):`);
  for (const t of workTasks) {
    console.log(`  [${t.done ? 'x' : ' '}] ${t.title}`);
  }

  // ── Cleanup ────────────────────────────────────────────
  await strata.dispose();
  console.log('\nDone.');
}

main();


