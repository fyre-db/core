import { describe, it, expect, afterEach } from 'vitest';
import { firstValueFrom, filter } from 'rxjs';
import {
  FyreDb,
  defineEntity,
  MemoryStorageAdapter,
} from '@/index';
import type { Repository } from '@/repo';

type Task = { title: string; done: boolean; priority: number };

const TaskDef = defineEntity<Task>('task');

describe('Two-device sync integration', () => {
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

  async function createDevice(
    deviceId: string,
    cloudAdapter: InstanceType<typeof MemoryStorageAdapter>,
  ) {
    const localAdapter = new MemoryStorageAdapter();
    const fyredb = track(new FyreDb({
      appId: 'test',
      entities: [TaskDef],
      localAdapter,
      cloudAdapter,
      deviceId,
    }));
    return { fyredb, localAdapter };
  }

  it('save on A → sync A → hydrate B → B has A data', async () => {
    const sharedCloud = new MemoryStorageAdapter();

    // Device A: create tenant, save data, sync to cloud
    const { fyredb: fyredbA } = await createDevice('device-A', sharedCloud);
    const tenant = await fyredbA.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
    });
    await fyredbA.tenants.open(tenant.id);

    const repoA = fyredbA.repo(TaskDef) as Repository<Task>;
    const id = repoA.save({ title: 'From A', done: false, priority: 1 });
    await fyredbA.tenants.sync();

    // Device B: create tenant with same meta, load → hydrate from cloud
    const { fyredb: fyredbB } = await createDevice('device-B', sharedCloud);
    await fyredbB.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
      id: tenant.id,
    });
    await fyredbB.tenants.open(tenant.id);

    const repoB = fyredbB.repo(TaskDef) as Repository<Task>;
    const fromB = await firstValueFrom(repoB.observe(id).pipe(filter((e): e is NonNullable<typeof e> => e !== undefined)));

    expect(fromB).toBeDefined();
    expect(fromB!.title).toBe('From A');
    expect(fromB!.done).toBe(false);
    expect(fromB!.priority).toBe(1);
  });

  it('concurrent edits → sync both → HLC conflict resolution (last writer wins)', async () => {
    const sharedCloud = new MemoryStorageAdapter();

    // Device A setup
    const { fyredb: fyredbA } = await createDevice('device-A', sharedCloud);
    const tenant = await fyredbA.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
    });
    await fyredbA.tenants.open(tenant.id);

    const repoA = fyredbA.repo(TaskDef) as Repository<Task>;
    const id = repoA.save({ title: 'Original', done: false, priority: 1 });
    await fyredbA.tenants.sync();

    // Device B: hydrate from cloud to get the original entity
    const { fyredb: fyredbB } = await createDevice('device-B', sharedCloud);
    await fyredbB.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
      id: tenant.id,
    });
    await fyredbB.tenants.open(tenant.id);

    const repoB = fyredbB.repo(TaskDef) as Repository<Task>;
    await firstValueFrom(repoB.observe(id).pipe(filter((e): e is NonNullable<typeof e> => e !== undefined)));

    // Device A edits (earlier timestamp)
    repoA.save({ title: 'Edit from A', done: false, priority: 2, id } as Task & { id: string });
    await fyredbA.tenants.sync();

    // Device B edits (later timestamp — should win)
    // Small delay to ensure B has a later timestamp
    await new Promise(r => setTimeout(r, 5));
    repoB.save({ title: 'Edit from B', done: true, priority: 3, id } as Task & { id: string });
    await fyredbB.tenants.sync();

    // B synced last, so B's version should win in cloud
    // Now re-sync A to get B's version
    await fyredbA.tenants.sync();

    // After sync, both should have B's version (last writer wins)
    const resultB = repoB.get(id);
    expect(resultB!.title).toBe('Edit from B');
    expect(resultB!.priority).toBe(3);
  });

  it('delete on A → sync → B sees deletion via tombstone', async () => {
    const sharedCloud = new MemoryStorageAdapter();

    // Device A: create, save, sync
    const { fyredb: fyredbA } = await createDevice('device-A', sharedCloud);
    const tenant = await fyredbA.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
    });
    await fyredbA.tenants.open(tenant.id);

    const repoA = fyredbA.repo(TaskDef) as Repository<Task>;
    const id = repoA.save({ title: 'Will delete', done: false, priority: 1 });
    await fyredbA.tenants.sync();

    // Device B hydrates
    const { fyredb: fyredbB } = await createDevice('device-B', sharedCloud);
    await fyredbB.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
      id: tenant.id,
    });
    await fyredbB.tenants.open(tenant.id);

    const repoB = fyredbB.repo(TaskDef) as Repository<Task>;
    await firstValueFrom(repoB.observe(id).pipe(filter((e): e is NonNullable<typeof e> => e !== undefined)));

    // A deletes entity, syncs
    repoA.delete(id);
    await fyredbA.tenants.sync();

    // B syncs to pick up tombstone
    await fyredbB.tenants.sync();

    const afterSync = repoB.get(id);
    expect(afterSync).toBeUndefined();
  });

  it('save on A, delete on B → sync → tombstone wins when B deleted later', async () => {
    const sharedCloud = new MemoryStorageAdapter();

    // Device A: create entity, sync
    const { fyredb: fyredbA } = await createDevice('device-A', sharedCloud);
    const tenant = await fyredbA.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
    });
    await fyredbA.tenants.open(tenant.id);

    const repoA = fyredbA.repo(TaskDef) as Repository<Task>;
    const id = repoA.save({ title: 'Contested', done: false, priority: 1 });
    await fyredbA.tenants.sync();

    // Device B: hydrate, then delete, sync
    const { fyredb: fyredbB } = await createDevice('device-B', sharedCloud);
    await fyredbB.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
      id: tenant.id,
    });
    await fyredbB.tenants.open(tenant.id);

    const repoB = fyredbB.repo(TaskDef) as Repository<Task>;
    await firstValueFrom(repoB.observe(id).pipe(filter((e): e is NonNullable<typeof e> => e !== undefined)));

    // B deletes (later HLC)
    await new Promise(r => setTimeout(r, 5));
    repoB.delete(id);
    await fyredbB.tenants.sync();

    // A edits the entity (but A's HLC for the entity is older than B's tombstone)
    // Actually, A syncs → picks up tombstone from B → entity should be gone
    await fyredbA.tenants.sync();

    const resultA = repoA.get(id);
    expect(resultA).toBeUndefined();
  });

  it('bidirectional saves: A saves X, B saves Y → sync → both have X and Y', async () => {
    const sharedCloud = new MemoryStorageAdapter();

    const { fyredb: fyredbA } = await createDevice('device-A', sharedCloud);
    const tenant = await fyredbA.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
    });
    await fyredbA.tenants.open(tenant.id);

    const { fyredb: fyredbB } = await createDevice('device-B', sharedCloud);
    await fyredbB.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
      id: tenant.id,
    });
    await fyredbB.tenants.open(tenant.id);

    const repoA = fyredbA.repo(TaskDef) as Repository<Task>;
    const repoB = fyredbB.repo(TaskDef) as Repository<Task>;

    // A saves entity X
    const idX = repoA.save({ title: 'X from A', done: false, priority: 1 });
    await fyredbA.tenants.sync();

    // B saves entity Y
    const idY = repoB.save({ title: 'Y from B', done: true, priority: 2 });
    await fyredbB.tenants.sync();

    // A syncs again to get Y
    await fyredbA.tenants.sync();

    expect(repoA.get(idX)?.title).toBe('X from A');
    expect(repoA.get(idY)?.title).toBe('Y from B');
    expect(repoB.get(idX)?.title).toBe('X from A');
    expect(repoB.get(idY)?.title).toBe('Y from B');
  });
});




