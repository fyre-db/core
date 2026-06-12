import {
  Strata,
  MemoryStorageAdapter,
  defineEntity,
  saveTenantPrefs,
  NOOP_ENCRYPTION_SERVICE,
} from '@fyre-db/core';
import { EncryptedDataAdapter, type DataAdapter } from '@fyre-db/core';
import { TenantContext } from '@fyre-db/core';
import { FsStorageAdapter, tmpDirFor, cleanTmpDir } from './common';

// ── Entity ───────────────────────────────────────────────

type Task = { title: string; done: boolean };
const TaskDef = defineEntity<Task>('task');

// ── Shared cloud adapter (simulates a remote backend) ───

const sharedCloud = Object.assign(new MemoryStorageAdapter(), {
  // Cloud adapter owns tenant ID derivation — same folder = same tenant ID
  deriveTenantId: (meta: Record<string, unknown>) =>
    `shared-${(meta.folderId as string).substring(0, 4)}`,
});
const sharedCloudDa: DataAdapter = new EncryptedDataAdapter(sharedCloud, NOOP_ENCRYPTION_SERVICE, new TenantContext());

// ── Main ─────────────────────────────────────────────────

async function main() {
  console.log('=== Tenant Sharing Demo ===\n');

  const dataDir = tmpDirFor('app-sharing');
  await cleanTmpDir(dataDir);

  // ─── User A: create workspace and add tasks ───────────

  console.log('--- User A: Creating workspace ---');

  const storageA = new FsStorageAdapter(dataDir + '-deviceA');
  const strataA = new Strata({
    appId: 'sharing-demo',
    entities: [TaskDef],
    localAdapter: storageA,
    cloudAdapter: sharedCloud,
    deviceId: 'device-A',
  });

  const tenantA = await strataA.tenants.create({
    name: 'Project X',
    meta: { folderId: 'abc123' },
  });
  console.log(`  Tenant created: ${tenantA.id}`);

  await strataA.tenants.open(tenantA.id);

  const tasks = strataA.repo(TaskDef);
  tasks.save({ title: 'Design the schema', done: true });
  tasks.save({ title: 'Write the tests', done: false });
  tasks.save({ title: 'Ship it!', done: false });
  console.log(`  Saved ${tasks.query().length} tasks`);

  // Save tenant prefs to the shared cloud so User B can pick them up
  await saveTenantPrefs(sharedCloudDa, tenantA, {
    name: 'Project X',
  });
  console.log('  Saved tenant prefs (name: "Project X")');

  // Sync to cloud
  const syncResult = await strataA.tenants.sync();
  console.log(`  Synced to cloud (${syncResult.entitiesUpdated} entities pushed)`);

  await strataA.dispose();
  console.log('  User A disposed\n');

  // ─── User B: join existing workspace ──────────────────

  console.log('--- User B: Joining workspace ---');

  const storageB = new FsStorageAdapter(dataDir + '-deviceB');
  const strataB = new Strata({
    appId: 'sharing-demo',
    entities: [TaskDef],
    localAdapter: sharedCloud,  // User B reads directly from cloud for setup
    cloudAdapter: sharedCloud,  // Cloud adapter provides deriveTenantId
    deviceId: 'device-B',
  });

  // join() detects the existing workspace via the marker blob
  const tenantB = await strataB.tenants.join({
    meta: { folderId: 'abc123' },
  });
  console.log(`  Join detected tenant: ${tenantB.id} (name: "${tenantB.name}")`);

  await strataB.tenants.open(tenantB.id);

  const tasksB = strataB.repo(TaskDef);
  const allTasks = tasksB.query();
  console.log(`  User B sees ${allTasks.length} tasks:`);
  for (const t of allTasks) {
    console.log(`    ${t.done ? '✅' : '⬜'} ${t.title}`);
  }

  // Tenant name should be "Project X" from prefs
  console.log(`\n  Tenant name from prefs: "${tenantB.name}"`);

  await strataB.dispose();
  console.log('  User B disposed\n');

  console.log('=== Done ===');
}

main().catch(console.error);




