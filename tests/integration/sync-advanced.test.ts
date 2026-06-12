import { describe, it, expect, afterEach } from 'vitest';
import { firstValueFrom, filter } from 'rxjs';
import {
  FyreDb,
  defineEntity,
  MemoryStorageAdapter,
  serialize,
  mergePartition,
} from '@/index';
import type { SyncEvent, StorageAdapter } from '@/index';
import type { Repository } from '@/repo';

type Task = { title: string; done: boolean; priority: number };

const TaskDef = defineEntity<Task>('task');

function createFailingAdapter(): StorageAdapter {
  let shouldFail = false;
  return {
    async read() { if (shouldFail) throw new Error('Cloud unreachable'); return null; },
    async write() { if (shouldFail) throw new Error('Cloud unreachable'); },
    async delete() { if (shouldFail) throw new Error('Cloud unreachable'); return false; },
    async list() { if (shouldFail) throw new Error('Cloud unreachable'); return []; },
    startFailing() { shouldFail = true; },
  } as StorageAdapter & { startFailing(): void };
}

describe('Sync advanced integration', () => {
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

  it('cloud unreachable fallback — hydrate falls back to local-only', async () => {
    const localAdapter = new MemoryStorageAdapter();
    const failingCloud = createFailingAdapter();
    const events: SyncEvent[] = [];

    const fyredb = track(new FyreDb({
      appId: 'test',
      entities: [TaskDef],
      localAdapter,
      cloudAdapter: failingCloud,
      deviceId: 'dev-1',
    }));

    fyredb.observe('sync').subscribe(e => events.push(e));

    const tenant = await fyredb.tenants.create({
      name: 'Test',
      meta: { bucket: 'test' },
    });

    // Start failing after create so marker blob can be written
    (failingCloud as StorageAdapter & { startFailing(): void }).startFailing();

    // Load tenant — open is now lazy (no eager cloud sync)
    await fyredb.tenants.open(tenant.id);

    // Trigger lazy load — this will attempt to read from cloud and fail
    const repo = fyredb.repo(TaskDef) as Repository<Task>;
    repo.query();
    // Wait for ensurePartition to complete (and fail)
    await new Promise(r => setTimeout(r, 50));

    // Should have emitted sync-failed for cloud
    expect(events.some(e => e.type === 'sync-failed')).toBe(true);
    const id = repo.save({ title: 'Local', done: false, priority: 1 });
    expect(repo.get(id)?.title).toBe('Local');
  });

  it('sync lock dedup — concurrent sync() calls both resolve without error', async () => {
    const sharedCloud = new MemoryStorageAdapter();
    const localAdapter = new MemoryStorageAdapter();

    const fyredb = track(new FyreDb({
      appId: 'test',
      entities: [TaskDef],
      localAdapter,
      cloudAdapter: sharedCloud,
      deviceId: 'dev-1',
    }));

    const tenant = await fyredb.tenants.create({
      name: 'Test',
      meta: { folder: 'shared' },
    });
    await fyredb.tenants.open(tenant.id);

    const repo = fyredb.repo(TaskDef) as Repository<Task>;
    repo.save({ title: 'Item', done: false, priority: 1 });

    // Call sync() twice concurrently — sync lock should dedup
    const [r1, r2] = await Promise.all([
      fyredb.tenants.sync(),
      fyredb.tenants.sync(),
    ]);

    expect(r1).toBeDefined();
    expect(r2).toBeDefined();

    // Data should be consistent
    const data = repo.query();
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('Item');
  });

  it('HLC nodeId tiebreaker — deterministic winner when timestamp and counter are equal', () => {
    const hlcA = { timestamp: 1000, counter: 5, nodeId: 'device-A' };
    const hlcB = { timestamp: 1000, counter: 5, nodeId: 'device-B' };

    const entityA = {
      id: 'task._.abc123',
      title: 'From A',
      done: false,
      priority: 1,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      version: 1,
      device: 'device-A',
      hlc: hlcA,
    };

    const entityB = {
      id: 'task._.abc123',
      title: 'From B',
      done: true,
      priority: 2,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      version: 1,
      device: 'device-B',
      hlc: hlcB,
    };

    const localBlob = ({
      task: { 'task._.abc123': entityA },
      deleted: { task: {} },
    });
    const cloudBlob = ({
      task: { 'task._.abc123': entityB },
      deleted: { task: {} },
    });

    const result = mergePartition(localBlob, cloudBlob, 'task');

    // device-B > device-A lexicographically, so B wins
    const merged = result.entities['task._.abc123'] as typeof entityB;
    expect(merged.title).toBe('From B');
    expect(merged.device).toBe('device-B');
  });

  it('sync + reactive end-to-end — A saves → syncs → B hydrates → B observe emits', async () => {
    const sharedCloud = new MemoryStorageAdapter();

    // Device A
    const localA = new MemoryStorageAdapter();
    const fyredbA = track(new FyreDb({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: localA,
      cloudAdapter: sharedCloud,
      deviceId: 'device-A',
    }));
    const tenant = await fyredbA.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
    });
    await fyredbA.tenants.open(tenant.id);

    const repoA = fyredbA.repo(TaskDef) as Repository<Task>;
    const id = repoA.save({ title: 'From A', done: false, priority: 1 });
    await fyredbA.tenants.sync();

    // Device B — hydrate from cloud via tenant load
    const localB = new MemoryStorageAdapter();
    const fyredbB = track(new FyreDb({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: localB,
      cloudAdapter: sharedCloud,
      deviceId: 'device-B',
    }));
    await fyredbB.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
      id: tenant.id,
    });
    await fyredbB.tenants.open(tenant.id);

    // B's observe should emit the entity from A
    const repoB = fyredbB.repo(TaskDef) as Repository<Task>;
    const entity = await firstValueFrom(repoB.observe(id).pipe(filter((e): e is NonNullable<typeof e> => e !== undefined)));

    expect(entity).toBeDefined();
    expect(entity!.title).toBe('From A');
    expect(entity!.done).toBe(false);
    expect(entity!.priority).toBe(1);
  });
});




