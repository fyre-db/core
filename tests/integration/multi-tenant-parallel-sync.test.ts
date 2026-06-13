import { wrapAdapter } from '../helpers';
import { describe, it, expect, afterEach } from 'vitest';
import { firstValueFrom, filter, timeout } from 'rxjs';
import {
  FyreDb,
  defineEntity,
  MemoryStorageAdapter,
  partitionBlobKey,
  saveAllIndexes,
  updatePartitionIndexEntry,
  loadAllIndexes,
  resolveOptions,
} from '@/index';
import type { SyncEvent, Tenant } from '@/index';
import type { DataAdapter } from '@/persistence';
import type { Repository } from '@/repo';

type Note = { title: string; body: string; priority: number };
type Project = { name: string; active: boolean };

const NoteDef = defineEntity<Note>('note');
const ProjectDef = defineEntity<Project>('project');

describe('Multi-tenant parallel sync integration', () => {
  const instances: FyreDb[] = [];

  afterEach(async () => {
    for (const s of instances) {
      await s.dispose().catch(() => {});
    }
    instances.length = 0;
  });

  function track(s: FyreDb): FyreDb {
    instances.push(s);
    return s;
  }

  /** Write a partition blob externally into an adapter (simulating another device). */
  async function writeExternalPartition(
    adapter: DataAdapter,
    tenant: Tenant | undefined,
    entityName: string,
    partitionKey: string,
    entities: Record<string, unknown>,
    tombstones: Record<string, Record<string, unknown>> = {},
  ): Promise<void> {
    const blob = {
      [entityName]: entities,
      deleted: { [entityName]: tombstones },
    } as import('@/persistence').PartitionBlob;
    const key = partitionBlobKey(entityName, partitionKey);
    await adapter.write(tenant, key, blob);
  }

  /** Write an external partition + update the __fyredb index so sync can discover it. */
  async function seedExternal(
    adapter: DataAdapter,
    tenant: Tenant | undefined,
    entityName: string,
    partitionKey: string,
    entities: Record<string, unknown>,
  ): Promise<void> {
    await writeExternalPartition(adapter, tenant, entityName, partitionKey, entities);

    const indexes = await loadAllIndexes(adapter, tenant, resolveOptions());
    let idx = indexes[entityName] ?? {};
    idx = updatePartitionIndexEntry(idx, partitionKey, Date.now(), Object.keys(entities).length, 0);
    indexes[entityName] = idx;
    await saveAllIndexes(adapter, tenant, indexes, resolveOptions());
  }

  it('two tenants — data stays isolated after switching and syncing', async () => {
    // MemoryStorageAdapter ignores meta, so each tenant needs its own cloud adapter
    // to simulate real isolation (e.g. separate buckets/containers).
    const cloudA = new MemoryStorageAdapter();
    const cloudB = new MemoryStorageAdapter();
    const localAdapter = new MemoryStorageAdapter();

    // Tenant A uses cloudA
    const fyredbA = track(new FyreDb({
      appId: 'test',
      entities: [NoteDef, ProjectDef],
      localAdapter,
      cloudAdapter: cloudA,
      deviceId: 'dev-1',
    }));

    const tenantA = await fyredbA.tenants.create({
      name: 'Workspace A',
      meta: { folder: 'ws-a' },
    });
    await fyredbA.tenants.open(tenantA.id);

    const noteRepoA = fyredbA.repo(NoteDef) as Repository<Note>;
    const idA1 = noteRepoA.save({ title: 'Note in A', body: 'body-a', priority: 1 });
    const idA2 = noteRepoA.save({ title: 'Another A', body: 'body-a2', priority: 2 });
    await fyredbA.tenants.sync();
    await fyredbA.dispose();
    instances.length = 0;

    // Tenant B uses cloudB (a completely separate cloud store)
    const fyredbB = track(new FyreDb({
      appId: 'test',
      entities: [NoteDef, ProjectDef],
      localAdapter,
      cloudAdapter: cloudB,
      deviceId: 'dev-1',
    }));

    const tenantB = await fyredbB.tenants.create({
      name: 'Workspace B',
      meta: { folder: 'ws-b' },
    });
    await fyredbB.tenants.open(tenantB.id);

    const noteRepoB = fyredbB.repo(NoteDef) as Repository<Note>;
    const idB1 = noteRepoB.save({ title: 'Note in B', body: 'body-b', priority: 10 });
    await fyredbB.tenants.sync();

    // A's data must not exist in B's cloud or store
    expect(noteRepoB.get(idA1)).toBeUndefined();
    expect(noteRepoB.get(idA2)).toBeUndefined();
    expect(noteRepoB.query()).toHaveLength(1);
    expect(noteRepoB.get(idB1)!.title).toBe('Note in B');
    await fyredbB.dispose();
    instances.length = 0;

    // Re-load tenant A from its cloud — B's data must not appear
    const fyredbA2 = track(new FyreDb({
      appId: 'test',
      entities: [NoteDef, ProjectDef],
      localAdapter,
      cloudAdapter: cloudA,
      deviceId: 'dev-1',
    }));
    // Re-create tenant entry so we can load it
    await fyredbA2.tenants.create({
      name: 'Workspace A',
      meta: { folder: 'ws-a' },
      id: tenantA.id,
    });
    await fyredbA2.tenants.open(tenantA.id);

    const noteRepoA2 = fyredbA2.repo(NoteDef) as Repository<Note>;
    const dataA2 = await firstValueFrom(noteRepoA2.observeQuery().pipe(filter(arr => arr.length > 0)));
    expect(noteRepoA2.get(idB1)).toBeUndefined();
    expect(dataA2).toHaveLength(2);
    expect(noteRepoA2.get(idA1)!.title).toBe('Note in A');
  });

  it('external cloud write detected on sync — new entities appear in store', async () => {
    const sharedCloud = new MemoryStorageAdapter();
    const localAdapter = new MemoryStorageAdapter();
    const meta = { folder: 'shared' };

    const fyredb = track(new FyreDb({
      appId: 'test',
      entities: [NoteDef],
      localAdapter,
      cloudAdapter: sharedCloud,
      deviceId: 'dev-1',
    }));
    const tenant = await fyredb.tenants.create({ name: 'Shared', meta });
    await fyredb.tenants.open(tenant.id);

    // Device 1 saves a note
    const noteRepo = fyredb.repo(NoteDef) as Repository<Note>;
    noteRepo.save({ title: 'Local note', body: 'from dev-1', priority: 1 });
    await fyredb.tenants.sync();

    // ---- Simulate an external device writing directly to cloud ----
    const externalNote = {
      id: 'note._.ext001',
      title: 'External note',
      body: 'from phantom device',
      priority: 99,
      createdAt: new Date('2026-03-24T10:00:00Z'),
      updatedAt: new Date('2026-03-24T10:00:00Z'),
      version: 1,
      device: 'phantom-device',
      hlc: { timestamp: Date.now() + 5000, counter: 0, nodeId: 'phantom-device' },
    };
    await seedExternal(wrapAdapter(sharedCloud), tenant, 'note', '_', {
      'note._.ext001': externalNote,
    });

    // Sync again — fyredb should pick up the external note
    await fyredb.tenants.sync();

    const found = noteRepo.get('note._.ext001');
    expect(found).toBeDefined();
    expect(found!.title).toBe('External note');
    expect(found!.body).toBe('from phantom device');
    expect(found!.priority).toBe(99);

    // Original local note should still be there
    const all = noteRepo.query();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('parallel local and cloud writes with conflict — HLC resolution after sync', async () => {
    const sharedCloud = new MemoryStorageAdapter();
    const localA = new MemoryStorageAdapter();
    const localB = new MemoryStorageAdapter();
    const meta = { folder: 'shared' };

    // Device A: create tenant and write initial data
    const fyredbA = track(new FyreDb({
      appId: 'test',
      entities: [NoteDef],
      localAdapter: localA,
      cloudAdapter: sharedCloud,
      deviceId: 'device-A',
    }));
    const tenant = await fyredbA.tenants.create({ name: 'Shared', meta });
    await fyredbA.tenants.open(tenant.id);

    const repoA = fyredbA.repo(NoteDef) as Repository<Note>;
    const sharedId = repoA.save({ title: 'Original', body: 'v0', priority: 1 });
    await fyredbA.tenants.sync();

    // Device B: load the same tenant, hydrate
    const fyredbB = track(new FyreDb({
      appId: 'test',
      entities: [NoteDef],
      localAdapter: localB,
      cloudAdapter: sharedCloud,
      deviceId: 'device-B',
    }));
    await fyredbB.tenants.create({ name: 'Shared', meta, id: tenant.id });
    await fyredbB.tenants.open(tenant.id);

    const repoB = fyredbB.repo(NoteDef) as Repository<Note>;
    await firstValueFrom(repoB.observe(sharedId).pipe(filter((e): e is NonNullable<typeof e> => e !== undefined)));
    expect(repoB.get(sharedId)!.title).toBe('Original');

    // Both write in parallel (different values, different timestamps)
    repoA.save({ title: 'Edit from A', body: 'vA', priority: 2, id: sharedId } as Note & { id: string });
    await fyredbA.tenants.sync();

    // Small delay so B has a later wall-clock timestamp
    await new Promise(r => setTimeout(r, 5));
    repoB.save({ title: 'Edit from B', body: 'vB', priority: 3, id: sharedId } as Note & { id: string });
    await fyredbB.tenants.sync();

    // B synced last → B's HLC is higher → B wins in cloud
    // Re-sync A to pull B's version
    await fyredbA.tenants.sync();

    expect(repoA.get(sharedId)!.title).toBe('Edit from B');
    expect(repoA.get(sharedId)!.body).toBe('vB');
    expect(repoB.get(sharedId)!.title).toBe('Edit from B');
  });

  it('switch tenant, external cloud mutation, re-load — sees fresh data', async () => {
    const sharedCloud = new MemoryStorageAdapter();
    const localAdapter = new MemoryStorageAdapter();
    const metaA = { folder: 'ws-a' };
    const metaB = { folder: 'ws-b' };

    const fyredb = track(new FyreDb({
      appId: 'test',
      entities: [NoteDef],
      localAdapter,
      cloudAdapter: sharedCloud,
      deviceId: 'dev-1',
    }));

    const tenantA = await fyredb.tenants.create({ name: 'A', meta: metaA });
    const tenantB = await fyredb.tenants.create({ name: 'B', meta: metaB });

    // Work in tenant A
    await fyredb.tenants.open(tenantA.id);
    const noteRepo = fyredb.repo(NoteDef) as Repository<Note>;
    noteRepo.save({ title: 'A note', body: 'a', priority: 1 });
    await fyredb.tenants.sync();

    // Switch to tenant B
    await fyredb.tenants.open(tenantB.id);
    const noteRepoB = fyredb.repo(NoteDef) as Repository<Note>;
    noteRepoB.save({ title: 'B note', body: 'b', priority: 2 });
    await fyredb.tenants.sync();

    // While on tenant B, an external device writes to tenant A's cloud
    const externalNote = {
      id: 'note._.ext-a',
      title: 'External A',
      body: 'injected while away',
      priority: 50,
      createdAt: new Date('2026-03-24T12:00:00Z'),
      updatedAt: new Date('2026-03-24T12:00:00Z'),
      version: 1,
      device: 'external',
      hlc: { timestamp: Date.now() + 10000, counter: 0, nodeId: 'external' },
    };
    await seedExternal(wrapAdapter(sharedCloud), tenantA, 'note', '_', {
      'note._.ext-a': externalNote,
    });

    // Switch back to tenant A — lazy load from local, then sync to get cloud changes
    await fyredb.tenants.open(tenantA.id);
    const noteRepoA2 = fyredb.repo(NoteDef) as Repository<Note>;

    // First trigger lazy load so partition is in memory
    await firstValueFrom(noteRepoA2.observeQuery().pipe(filter(arr => arr.length >= 1)));

    // Sync to pick up external cloud mutation
    await fyredb.tenants.sync();

    // Should see both the original note and the externally injected one
    const all = noteRepoA2.query();
    expect(all.length).toBeGreaterThanOrEqual(2);
    const ext = noteRepoA2.get('note._.ext-a');
    expect(ext).toBeDefined();
    expect(ext!.title).toBe('External A');
  });

  it('auto-sync picks up external cloud changes via scheduler', async () => {
    const sharedCloud = new MemoryStorageAdapter();
    const localAdapter = new MemoryStorageAdapter();
    const meta = { folder: 'shared' };

    const fyredb = track(new FyreDb({
      appId: 'test',
      entities: [NoteDef],
      localAdapter,
      cloudAdapter: sharedCloud,
      deviceId: 'dev-1',
      options: {
        localFlushIntervalMs: 50,
        cloudSyncIntervalMs: 100,
      },
    }));

    const tenant = await fyredb.tenants.create({ name: 'Shared', meta });
    await fyredb.tenants.open(tenant.id);

    const noteRepo = fyredb.repo(NoteDef) as Repository<Note>;
    noteRepo.save({ title: 'Local', body: 'local', priority: 1 });

    // Wait for auto-flush to persist locally
    await new Promise(r => setTimeout(r, 120));

    // Inject data into cloud externally
    const externalNote = {
      id: 'note._.auto-ext',
      title: 'Auto-synced',
      body: 'via scheduler',
      priority: 77,
      createdAt: new Date('2026-03-24T14:00:00Z'),
      updatedAt: new Date('2026-03-24T14:00:00Z'),
      version: 1,
      device: 'auto-device',
      hlc: { timestamp: Date.now() + 20000, counter: 0, nodeId: 'auto-device' },
    };
    await seedExternal(wrapAdapter(sharedCloud), tenant, 'note', '_', {
      'note._.auto-ext': externalNote,
    });

    // Wait for auto cloud sync to fire (interval = 100ms, give it a few cycles)
    await new Promise(r => setTimeout(r, 350));

    const found = noteRepo.get('note._.auto-ext');
    expect(found).toBeDefined();
    expect(found!.title).toBe('Auto-synced');
    expect(found!.body).toBe('via scheduler');
  });

  it('multi-entity types — parallel writes across note and project repos', async () => {
    const sharedCloud = new MemoryStorageAdapter();
    const localA = new MemoryStorageAdapter();
    const localB = new MemoryStorageAdapter();
    const meta = { folder: 'shared' };

    const fyredbA = track(new FyreDb({
      appId: 'test',
      entities: [NoteDef, ProjectDef],
      localAdapter: localA,
      cloudAdapter: sharedCloud,
      deviceId: 'device-A',
    }));
    const tenant = await fyredbA.tenants.create({ name: 'Multi', meta });
    await fyredbA.tenants.open(tenant.id);

    // Device A writes notes
    const noteRepoA = fyredbA.repo(NoteDef) as Repository<Note>;
    const noteIdA = noteRepoA.save({ title: 'A note', body: 'from A', priority: 1 });

    // Device A writes projects
    const projectRepoA = fyredbA.repo(ProjectDef) as Repository<Project>;
    const projIdA = projectRepoA.save({ name: 'Project Alpha', active: true });
    await fyredbA.tenants.sync();

    // Device B hydrates and writes its own entities of both types
    const fyredbB = track(new FyreDb({
      appId: 'test',
      entities: [NoteDef, ProjectDef],
      localAdapter: localB,
      cloudAdapter: sharedCloud,
      deviceId: 'device-B',
    }));
    await fyredbB.tenants.create({ name: 'Multi', meta, id: tenant.id });
    await fyredbB.tenants.open(tenant.id);

    const noteRepoB = fyredbB.repo(NoteDef) as Repository<Note>;
    const projectRepoB = fyredbB.repo(ProjectDef) as Repository<Project>;

    // B should have A's data after lazy load
    await firstValueFrom(noteRepoB.observe(noteIdA).pipe(filter((e): e is NonNullable<typeof e> => e !== undefined)));
    await firstValueFrom(projectRepoB.observe(projIdA).pipe(filter((e): e is NonNullable<typeof e> => e !== undefined)));
    expect(noteRepoB.get(noteIdA)!.title).toBe('A note');
    expect(projectRepoB.get(projIdA)!.name).toBe('Project Alpha');

    // B writes its own
    const noteIdB = noteRepoB.save({ title: 'B note', body: 'from B', priority: 5 });
    const projIdB = projectRepoB.save({ name: 'Project Beta', active: false });
    await fyredbB.tenants.sync();

    // A syncs and gets B's entities
    await fyredbA.tenants.sync();
    expect(noteRepoA.get(noteIdB)!.title).toBe('B note');
    expect(projectRepoA.get(projIdB)!.name).toBe('Project Beta');

    // Both have all 4 entities
    expect(noteRepoA.query()).toHaveLength(2);
    expect(projectRepoA.query()).toHaveLength(2);
    expect(noteRepoB.query()).toHaveLength(2);
    expect(projectRepoB.query()).toHaveLength(2);
  });

  it('three devices — convergence after sequential syncs', async () => {
    const cloud = new MemoryStorageAdapter();
    const meta = { folder: 'shared' };

    function makeDevice(id: string) {
      const local = new MemoryStorageAdapter();
      const s = track(new FyreDb({
        appId: 'test',
        entities: [NoteDef],
        localAdapter: local,
        cloudAdapter: cloud,
        deviceId: id,
      }));
      return s;
    }

    const s1 = makeDevice('dev-1');
    const tenant = await s1.tenants.create({ name: 'Trio', meta });
    await s1.tenants.open(tenant.id);

    const r1 = s1.repo(NoteDef) as Repository<Note>;
    r1.save({ title: 'From 1', body: 'b1', priority: 1 });
    await s1.tenants.sync();

    // Dev 2 joins
    const s2 = makeDevice('dev-2');
    await s2.tenants.create({ name: 'Trio', meta, id: tenant.id });
    await s2.tenants.open(tenant.id);
    const r2 = s2.repo(NoteDef) as Repository<Note>;
    r2.save({ title: 'From 2', body: 'b2', priority: 2 });
    await s2.tenants.sync();

    // Dev 3 joins
    const s3 = makeDevice('dev-3');
    await s3.tenants.create({ name: 'Trio', meta, id: tenant.id });
    await s3.tenants.open(tenant.id);
    const r3 = s3.repo(NoteDef) as Repository<Note>;
    r3.save({ title: 'From 3', body: 'b3', priority: 3 });
    await s3.tenants.sync();

    // All devices sync to converge
    await s1.tenants.sync();
    await s2.tenants.sync();

    // All three should have 3 notes
    expect(r1.query()).toHaveLength(3);
    expect(r2.query()).toHaveLength(3);
    expect(r3.query()).toHaveLength(3);

    const titles1 = r1.query().map(n => n.title).sort();
    const titles2 = r2.query().map(n => n.title).sort();
    const titles3 = r3.query().map(n => n.title).sort();
    expect(titles1).toEqual(['From 1', 'From 2', 'From 3']);
    expect(titles2).toEqual(['From 1', 'From 2', 'From 3']);
    expect(titles3).toEqual(['From 1', 'From 2', 'From 3']);
  });
});








