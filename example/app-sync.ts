import { Strata, MemoryStorageAdapter, defineEntity } from '@fyre-db/core';
import type { SyncEvent } from '@fyre-db/core';
import { FsStorageAdapter, tmpDirFor, cleanTmpDir } from './common';

type Task = { title: string; done: boolean };

const taskDef = defineEntity<Task>('task');

async function main() {
  const dataDir = tmpDirFor('app-sync');
  await cleanTmpDir(dataDir);

  // Shared cloud adapter simulates remote storage both devices sync to
  const cloudAdapter = new MemoryStorageAdapter();

  const storage1 = new FsStorageAdapter(dataDir + '-device1');
  const storage2 = new FsStorageAdapter(dataDir + '-device2');

  const device1 = new Strata({
    appId: 'demo',
    entities: [taskDef],
    localAdapter: storage1,
    cloudAdapter,
    deviceId: 'device-1',
  });

  const device2 = new Strata({
    appId: 'demo',
    entities: [taskDef],
    localAdapter: storage2,
    cloudAdapter,
    deviceId: 'device-2',
  });

  // ── Subscribe to sync events on both devices ──────────
  const logEvent = (device: string) => (event: SyncEvent) => {
    console.log(`  [${device} sync-event] ${event.type}`);
  };
  device1.observe('sync').subscribe(logEvent('device-1'));
  device2.observe('sync').subscribe(logEvent('device-2'));

  // ── Step 1: Device 1 creates a tenant and saves tasks ─
  console.log('=== Step 1: Device 1 creates tenant & saves tasks ===');
  const tenant = await device1.tenants.create({ name: 'My Workspace', meta: {} });
  console.log(`Tenant created: ${tenant.id}`);

  await device1.tenants.open(tenant.id);

  const tasks1 = device1.repo(taskDef);
  tasks1.save({ title: 'Buy groceries', done: false });
  tasks1.save({ title: 'Write tests', done: true });
  console.log('Device 1 tasks:', tasks1.query().map(t => t.title));

  console.log(`Device 1 isDirty before sync: ${device1.isDirty}`);
  const result1 = await device1.tenants.sync();
  console.log(`Device 1 synced — entities updated: ${result1.entitiesUpdated}`);
  console.log(`Device 1 isDirty after sync: ${device1.isDirty}`);

  // ── Step 2: Device 2 joins the same tenant ────────────
  console.log('\n=== Step 2: Device 2 loads same tenant (pulls from cloud) ===');
  await device2.tenants.create({ name: 'My Workspace', meta: {}, id: tenant.id });
  await device2.tenants.open(tenant.id);

  const tasks2 = device2.repo(taskDef);
  console.log('Device 2 tasks after load:', tasks2.query().map(t => t.title));

  // ── Step 3: Device 2 adds a task and syncs ────────────
  console.log('\n=== Step 3: Device 2 saves a new task & syncs ===');
  tasks2.save({ title: 'Deploy app', done: false });
  console.log('Device 2 tasks:', tasks2.query().map(t => t.title));

  console.log(`Device 2 isDirty before sync: ${device2.isDirty}`);
  const result2 = await device2.tenants.sync();
  console.log(`Device 2 synced — entities updated: ${result2.entitiesUpdated}`);
  console.log(`Device 2 isDirty after sync: ${device2.isDirty}`);

  // ── Step 4: Device 1 syncs again to pull device 2's task
  console.log('\n=== Step 4: Device 1 syncs again ===');
  const result3 = await device1.tenants.sync();
  console.log(`Device 1 synced — entities updated: ${result3.entitiesUpdated}`);
  console.log('Device 1 tasks after re-sync:', tasks1.query().map(t => t.title));

  // ── Cleanup ───────────────────────────────────────────
  console.log('\n=== Disposing both devices ===');
  await device1.dispose();
  await device2.dispose();
  console.log('Done.');
}

main().catch(console.error);




