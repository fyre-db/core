import { describe, it, expect, afterEach } from 'vitest';
import { firstValueFrom, filter } from 'rxjs';
import {
  Strata,
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
  const instances: Strata[] = [];

  afterEach(async () => {
    for (const s of instances) {
      await s.dispose().catch(() => {});
    }
    instances.length = 0;
  });

  function track(s: Strata): Strata {
    instances.push(s);
    return s;
  }

  it('cloud unreachable fallback — hydrate falls back to local-only', async () => {
    const localAdapter = new MemoryStorageAdapter();
    const failingCloud = createFailingAdapter();
    const events: SyncEvent[] = [];

    const strata = track(new Strata({
      appId: 'test',
      entities: [TaskDef],
      localAdapter,
      cloudAdapter: failingCloud,
      deviceId: 'dev-1',
    }));

    strata.observe('sync').subscribe(e => events.push(e));

    const tenant = await strata.tenants.create({
      name: 'Test',
      meta: { bucket: 'test' },
    });

    // Start failing after create so marker blob can be written
    (failingCloud as StorageAdapter & { startFailing(): void }).startFailing();

    // Load tenant — open is now lazy (no eager cloud sync)
    await strata.tenants.open(tenant.id);

    // Trigger lazy load — this will attempt to read from cloud and fail
    const repo = strata.repo(TaskDef) as Repository<Task>;
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

    const strata = track(new Strata({
      appId: 'test',
      entities: [TaskDef],
      localAdapter,
      cloudAdapter: sharedCloud,
      deviceId: 'dev-1',
    }));

    const tenant = await strata.tenants.create({
      name: 'Test',
      meta: { folder: 'shared' },
    });
    await strata.tenants.open(tenant.id);

    const repo = strata.repo(TaskDef) as Repository<Task>;
    repo.save({ title: 'Item', done: false, priority: 1 });

    // Call sync() twice concurrently — sync lock should dedup
    const [r1, r2] = await Promise.all([
      strata.tenants.sync(),
      strata.tenants.sync(),
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
    const strataA = track(new Strata({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: localA,
      cloudAdapter: sharedCloud,
      deviceId: 'device-A',
    }));
    const tenant = await strataA.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
    });
    await strataA.tenants.open(tenant.id);

    const repoA = strataA.repo(TaskDef) as Repository<Task>;
    const id = repoA.save({ title: 'From A', done: false, priority: 1 });
    await strataA.tenants.sync();

    // Device B — hydrate from cloud via tenant load
    const localB = new MemoryStorageAdapter();
    const strataB = track(new Strata({
      appId: 'test',
      entities: [TaskDef],
      localAdapter: localB,
      cloudAdapter: sharedCloud,
      deviceId: 'device-B',
    }));
    await strataB.tenants.create({
      name: 'Shared',
      meta: { folder: 'shared' },
      id: tenant.id,
    });
    await strataB.tenants.open(tenant.id);

    // B's observe should emit the entity from A
    const repoB = strataB.repo(TaskDef) as Repository<Task>;
    const entity = await firstValueFrom(repoB.observe(id).pipe(filter((e): e is NonNullable<typeof e> => e !== undefined)));

    expect(entity).toBeDefined();
    expect(entity!.title).toBe('From A');
    expect(entity!.done).toBe(false);
    expect(entity!.priority).toBe(1);
  });
});




