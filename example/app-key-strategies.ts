import { FyreDb, defineEntity, partitioned } from '@fyre-db/core';
import { FsStorageAdapter, tmpDirFor, cleanTmpDir } from './common';

// ─── Entity types ────────────────────────────────────────

type Task = { title: string; done: boolean; category: string };
type Note = { body: string };
type Settings = { theme: string; language: string };

// 1. Global (default) — all entities in a single partition
const Task = defineEntity<Task>('task');

// 2. Partitioned — entities split by first letter of body
const Note = defineEntity<Note>('note', {
  keyStrategy: partitioned((n: Note) => n.body[0].toLowerCase()),
});

// 3. Singleton — exactly one instance, no id needed
const Settings = defineEntity<Settings>('settings', {
  keyStrategy: 'singleton',
});

// ─── Main ────────────────────────────────────────────────

async function main() {
  const dataDir = tmpDirFor('app-key-strategies');
  await cleanTmpDir(dataDir);

  const storage = new FsStorageAdapter(dataDir);

  const db = new FyreDb({
    appId: 'key-strategies-demo',
    entities: [Task, Note, Settings],
    localAdapter: storage,
    deviceId: 'device-1',
  });

  const tenant = await db.tenants.create({ name: 'demo', meta: {} });
  await db.tenants.open(tenant.id);

  // ── Global key strategy ──────────────────────────────
  console.log('=== GLOBAL KEY STRATEGY ===');

  const tasks = db.repo(Task);
  tasks.save({ title: 'Buy groceries', done: false, category: 'shopping' });
  tasks.save({ title: 'Write tests', done: true, category: 'dev' });
  tasks.save({ title: 'Deploy app', done: false, category: 'dev' });

  const allTasks = tasks.query();
  console.log(`All tasks (${allTasks.length}):`);
  for (const t of allTasks) {
    console.log(`  [${t.done ? 'x' : ' '}] ${t.title} (${t.category})`);
  }

  const devTasks = tasks.query({ where: { category: 'dev' } });
  console.log(`\nDev tasks (${devTasks.length}):`);
  for (const t of devTasks) {
    console.log(`  [${t.done ? 'x' : ' '}] ${t.title}`);
  }

  // ── Partitioned key strategy ─────────────────────────
  console.log('\n=== PARTITIONED KEY STRATEGY ===');

  const notes = db.repo(Note);
  notes.save({ body: 'Alpha note about architecture' });
  notes.save({ body: 'Beta note about builds' });
  notes.save({ body: 'Another alpha-partition note' });
  notes.save({ body: 'Charlie note about CI' });
  notes.save({ body: 'Bravo note about bundling' });

  const allNotes = notes.query();
  console.log(`All notes across partitions (${allNotes.length}):`);
  for (const n of allNotes) {
    const partition = n.body[0].toLowerCase();
    console.log(`  [partition="${partition}"] ${n.body}`);
  }

  // ── Singleton key strategy ───────────────────────────
  console.log('\n=== SINGLETON KEY STRATEGY ===');

  const settings = db.repo(Settings);

  // Save initial settings
  settings.save({ theme: 'dark', language: 'en' });
  const current = settings.get();
  console.log('Initial settings:', { theme: current?.theme, language: current?.language });

  // Update settings (just save again — singleton overwrites)
  settings.save({ theme: 'light', language: 'fr' });
  const updated = settings.get();
  console.log('Updated settings:', { theme: updated?.theme, language: updated?.language });

  // Delete singleton
  settings.delete();
  const deleted = settings.get();
  console.log('After delete:', deleted ?? 'undefined');

  // ── Cleanup ──────────────────────────────────────────
  await db.dispose();
  console.log('\nDone.');
}

main();

