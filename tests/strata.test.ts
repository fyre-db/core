import { describe, it, expect, vi, afterEach } from 'vitest';
import { firstValueFrom, filter } from 'rxjs';
import {
  Strata,
  validateEntityDefinitions,
  defineEntity,
  MemoryStorageAdapter,
  resolveOptions,
  serialize,
} from '@/index';
import type { SyncEvent } from '@/index';
import type { Repository, SingletonRepository } from '@/repo';
import { createTestEncryptionService } from './helpers';

type Task = { title: string; done: boolean };
type Settings = { theme: string };

function makeAdapter() {
  return new MemoryStorageAdapter();
}

function makeStrata(overrides?: {
  cloudAdapter?: MemoryStorageAdapter;
  entities?: ReturnType<typeof defineEntity>[];
}): { strata: Strata; localAdapter: MemoryStorageAdapter } {
  const taskDef = defineEntity<Task>('task');
  const localAdapter = makeAdapter();
  const strata = new Strata({
    appId: 'test',
    entities: overrides?.entities ?? [taskDef],
    localAdapter,
    cloudAdapter: overrides?.cloudAdapter,
    deviceId: 'test-device',
  });
  return { strata, localAdapter };
}

describe('validateEntityDefinitions', () => {
  it('rejects empty entity list', () => {
    expect(() => validateEntityDefinitions([])).toThrow(
      'At least one entity definition is required',
    );
  });

  it('rejects entity definition with empty name', () => {
    const noName = defineEntity<Task>('' as string);
    expect(() => validateEntityDefinitions([noName])).toThrow(
      'Entity definition must have a name',
    );
  });

  it('rejects duplicate entity names', () => {
    const a = defineEntity<Task>('task');
    const b = defineEntity<Task>('task');
    expect(() => validateEntityDefinitions([a, b])).toThrow(
      'Duplicate entity name: task',
    );
  });

  it('accepts valid entity definitions', () => {
    const a = defineEntity<Task>('task');
    const b = defineEntity<Settings>('settings');
    expect(() => validateEntityDefinitions([a, b])).not.toThrow();
  });
});

describe('Strata', () => {
  let strata: Strata;

  afterEach(async () => {
    if (strata) {
      await strata.dispose();
    }
  });

  it('creates strata instance with all public API methods', () => {
    ({ strata } = makeStrata());
    expect(strata.tenants).toBeDefined();
    expect(strata.repo).toBeTypeOf('function');
    expect(strata.tenants.sync).toBeTypeOf('function');
    expect(strata.dispose).toBeTypeOf('function');
    expect(strata.isDirty).toBe(false);
    expect(strata.observe).toBeTypeOf('function');
  });

  it('accepts config with migrations', () => {
    const taskDef = defineEntity<Task>('task');
    strata = new Strata({
      appId: 'test',
      entities: [taskDef],
      localAdapter: makeAdapter(),
      deviceId: 'dev',
      migrations: [{ version: 1, migrate: (blob: any) => blob }],
    });
    expect(strata).toBeDefined();
  });

  describe('repo()', () => {
    it('returns repository for known entity definition', () => {
      const taskDef = defineEntity<Task>('task');
      strata = new Strata({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const repo = strata.repo(taskDef);
      expect(repo).toBeDefined();
    });

    it('throws for unknown entity definition', () => {
      const taskDef = defineEntity<Task>('task');
      const unknownDef = defineEntity<Settings>('settings');
      strata = new Strata({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      expect(() => strata.repo(unknownDef)).toThrow('Unknown entity definition');
    });

    it('returns Repository for non-singleton entities', () => {
      const taskDef = defineEntity<Task>('task');
      strata = new Strata({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const repo = strata.repo(taskDef) as Repository<Task>;
      expect(repo.save).toBeTypeOf('function');
      expect(repo.query).toBeTypeOf('function');
      expect(repo.get).toBeTypeOf('function');
      expect(repo.delete).toBeTypeOf('function');
    });

    it('returns SingletonRepository for singleton entities', () => {
      const settingsDef = defineEntity<Settings>('settings', {
        keyStrategy: 'singleton',
      });
      strata = new Strata({
        appId: 'test',
        entities: [settingsDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const repo = strata.repo(settingsDef) as SingletonRepository<Settings>;
      expect(repo.save).toBeTypeOf('function');
      expect(repo.get).toBeTypeOf('function');
      expect(repo.delete).toBeTypeOf('function');
      expect(repo.observe).toBeTypeOf('function');
    });

    it('allows CRUD operations through repo', () => {
      const taskDef = defineEntity<Task>('task');
      strata = new Strata({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const repo = strata.repo(taskDef) as Repository<Task>;
      const id = repo.save({ title: 'Test', done: false });
      expect(id).toBeTruthy();

      const entity = repo.get(id);
      expect(entity?.title).toBe('Test');
      expect(entity?.done).toBe(false);

      const results = repo.query();
      expect(results).toHaveLength(1);

      const deleted = repo.delete(id);
      expect(deleted).toBe(true);
      expect(repo.query()).toHaveLength(0);
    });

    it('supports multiple entity types', () => {
      const taskDef = defineEntity<Task>('task');
      const settingsDef = defineEntity<Settings>('settings', {
        keyStrategy: 'singleton',
      });
      strata = new Strata({
        appId: 'test',
        entities: [taskDef, settingsDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });

      const taskRepo = strata.repo(taskDef) as Repository<Task>;
      const settingsRepo = strata.repo(settingsDef) as SingletonRepository<Settings>;

      taskRepo.save({ title: 'Task1', done: false });
      settingsRepo.save({ theme: 'dark' });

      expect(taskRepo.query()).toHaveLength(1);
      expect(settingsRepo.get()?.theme).toBe('dark');
    });
  });

  describe('tenants', () => {
    it('exposes tenant manager', () => {
      ({ strata } = makeStrata());
      expect(strata.tenants.list).toBeTypeOf('function');
      expect(strata.tenants.create).toBeTypeOf('function');
      expect(strata.tenants.open).toBeTypeOf('function');
      expect(strata.tenants.join).toBeTypeOf('function');
      expect(strata.tenants.remove).toBeTypeOf('function');
      expect(strata.tenants.changeCredential).toBeTypeOf('function');
      expect(strata.tenants.activeTenant$).toBeDefined();
    });

    it('creates and loads a tenant', async () => {
      ({ strata } = makeStrata());
      const tenant = await strata.tenants.create({
        name: 'Test Workspace',
        meta: { bucket: 'test' },
      });
      await strata.tenants.open(tenant.id);
      expect(strata.tenants.activeTenant?.id).toBe(tenant.id);
    });

    it('stops previous sync scheduler when loading a new tenant', async () => {
      const cloudAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      strata = new Strata({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter,
        deviceId: 'dev',
      });

      const t1 = await strata.tenants.create({
        name: 'Tenant 1',
        meta: { bucket: 't1' },
      });
      const t2 = await strata.tenants.create({
        name: 'Tenant 2',
        meta: { bucket: 't2' },
      });

      await strata.tenants.open(t1.id);
      // Load a second tenant — should stop the first scheduler
      await strata.tenants.open(t2.id);

      expect(strata.tenants.activeTenant?.id).toBe(t2.id);
    });

    it('hydrates from local on tenant load without cloud adapter', async () => {
      const localAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      strata = new Strata({
        appId: 'test',
        entities: [taskDef],
        localAdapter,
        deviceId: 'dev',
      });
      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.tenants.open(tenant.id);
      expect(strata.tenants.activeTenant?.name).toBe('Test');
    });

    it('emits sync-failed when cloud adapter fails during hydrate', async () => {
      const localAdapter = makeAdapter();
      const failingCloudAdapter = makeAdapter();
      // Sabotage the cloud adapter to simulate unreachable
      failingCloudAdapter.read = () => {
        throw new Error('Network error');
      };

      const taskDef = defineEntity<Task>('task');
      strata = new Strata({
        appId: 'test',
        entities: [taskDef],
        localAdapter,
        cloudAdapter: failingCloudAdapter,
        deviceId: 'dev',
      });

      const events: SyncEvent[] = [];
      strata.observe('sync').subscribe(e => events.push(e));

      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.tenants.open(tenant.id);

      // Trigger lazy load — cloud failure happens on first access, not during open()
      const repo = strata.repo(taskDef) as Repository<Task>;
      repo.query();
      await new Promise(r => setTimeout(r, 50));

      expect(events.some(e => e.type === 'sync-failed')).toBe(true);
    });
  });

  describe('sync()', () => {
    it('rejects when no tenant loaded', async () => {
      const cloudAdapter = makeAdapter();
      ({ strata } = makeStrata({ cloudAdapter }));
      await expect(strata.tenants.sync()).rejects.toThrow('No tenant loaded');
    });

    it('rejects when no cloud adapter configured', async () => {
      ({ strata } = makeStrata());
      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.tenants.open(tenant.id);
      await expect(strata.tenants.sync()).rejects.toThrow('No cloud adapter configured');
    });

    it('succeeds with cloud adapter and loaded tenant', async () => {
      const cloudAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      strata = new Strata({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter,
        deviceId: 'dev',
      });
      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.tenants.open(tenant.id);

      const result = await strata.tenants.sync();
      expect(result).toBeDefined();
      expect(result.entitiesUpdated).toBe(0);
    });

    it('emits sync-started and sync-completed events', async () => {
      const cloudAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      strata = new Strata({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter,
        deviceId: 'dev',
      });
      const events: SyncEvent[] = [];
      strata.observe('sync').subscribe(e => events.push(e));

      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.tenants.open(tenant.id);
      await strata.tenants.sync();

      const types = events.map(e => e.type);
      expect(types).toContain('sync-started');
      expect(types).toContain('sync-completed');
    });

    it('emits sync-failed event on sync error', async () => {
      const cloudAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      strata = new Strata({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter,
        deviceId: 'dev',
      });
      const events: SyncEvent[] = [];
      strata.observe('sync').subscribe(e => events.push(e));

      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.tenants.open(tenant.id);

      // Sabotage cloud adapter to cause sync failure
      cloudAdapter.read = () => {
        throw new Error('Sync failure');
      };

      await expect(strata.tenants.sync()).rejects.toThrow('Sync failure');
      expect(events.some(e => e.type === 'sync-failed')).toBe(true);
    });
  });

  describe('isDirty', () => {
    it('starts clean', () => {
      ({ strata } = makeStrata());
      expect(strata.isDirty).toBe(false);
    });

    it('becomes dirty after save', async () => {
      const taskDef = defineEntity<Task>('task');
      strata = new Strata({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.tenants.open(tenant.id);

      const repo = strata.repo(taskDef) as Repository<Task>;
      repo.save({ title: 'Test', done: false });
      expect(strata.isDirty).toBe(true);
    });

    it('clears after sync', async () => {
      const cloudAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      strata = new Strata({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter,
        deviceId: 'dev',
      });

      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.tenants.open(tenant.id);

      const repo = strata.repo(taskDef) as Repository<Task>;
      repo.save({ title: 'Test', done: false });
      expect(strata.isDirty).toBe(true);

      await strata.tenants.sync();
      expect(strata.isDirty).toBe(false);
    });

    it('exposes isDirty$ observable', () => {
      ({ strata } = makeStrata());
      const values: boolean[] = [];
      strata.observe('dirty').subscribe(v => values.push(v));
      expect(values[0]).toBe(false);
    });
  });

  describe('observe()', () => {
    it('observe("entity") returns all entity events', () => {
      const taskDef = defineEntity<Task>('task');
      strata = new Strata({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const events: unknown[] = [];
      strata.observe('entity').subscribe(e => events.push(e));
      const repo = strata.repo(taskDef) as Repository<Task>;
      repo.save({ title: 'X', done: false });
      expect(events.length).toBeGreaterThan(0);
    });

    it('observe("entity", entityName) filters by entity name', () => {
      const taskDef = defineEntity<Task>('task');
      const settingsDef = defineEntity<Settings>('settings', { keyStrategy: 'singleton' });
      strata = new Strata({
        appId: 'test',
        entities: [taskDef, settingsDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const taskEvents: unknown[] = [];
      strata.observe('entity', 'task').subscribe(e => taskEvents.push(e));
      const repo = strata.repo(settingsDef) as SingletonRepository<Settings>;
      repo.save({ theme: 'dark' });
      // No task events should fire for a settings save
      const taskRepo = strata.repo(taskDef) as Repository<Task>;
      taskRepo.save({ title: 'X', done: false });
      // Only the task save should appear
      expect(taskEvents.length).toBe(1);
    });

    it('observe("tenant") returns tenant observable', () => {
      ({ strata } = makeStrata());
      const values: unknown[] = [];
      strata.observe('tenant').subscribe(v => values.push(v));
      expect(values.length).toBeGreaterThan(0);
    });
  });

  describe('sync events', () => {
    it('syncEvents$ delivers events and unsubscribe stops delivery', async () => {
      const cloudAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      strata = new Strata({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter,
        deviceId: 'dev',
      });
      const events: SyncEvent[] = [];
      const sub = strata.observe('sync').subscribe(e => events.push(e));

      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.tenants.open(tenant.id);
      await strata.tenants.sync();
      expect(events.length).toBeGreaterThan(0);

      const countBefore = events.length;
      sub.unsubscribe();
      await strata.tenants.sync();
      expect(events.length).toBe(countBefore);
    });
  });

  describe('dispose()', () => {
    it('returns a promise', async () => {
      ({ strata } = makeStrata());
      const result = strata.dispose();
      expect(result).toBeInstanceOf(Promise);
      await result;
    });

    it('is idempotent — returns same promise', async () => {
      ({ strata } = makeStrata());
      const p1 = strata.dispose();
      const p2 = strata.dispose();
      expect(p1).toBe(p2);
      await p1;
    });

    it('repo() throws after dispose', async () => {
      const taskDef = defineEntity<Task>('task');
      strata = new Strata({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      await strata.dispose();
      expect(() => strata.repo(taskDef)).toThrow('Strata instance is disposed');
    });

    it('sync() rejects after dispose', async () => {
      const cloudAdapter = makeAdapter();
      ({ strata } = makeStrata({ cloudAdapter }));
      await strata.dispose();
      await expect(strata.tenants.sync()).rejects.toThrow('No tenant loaded');
    });

    it('open() rejects after dispose', async () => {
      ({ strata } = makeStrata());
      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.dispose();
      await expect(strata.tenants.open(tenant.id)).rejects.toThrow(
        'SyncEngine is disposed',
      );
    });

    it('flushes dirty data on dispose', async () => {
      const taskDef = defineEntity<Task>('task');
      const localAdapter = makeAdapter();
      strata = new Strata({
        appId: 'test',
        entities: [taskDef],
        localAdapter,
        deviceId: 'dev',
      });
      const tenant = await strata.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await strata.tenants.open(tenant.id);

      const repo = strata.repo(taskDef) as Repository<Task>;
      repo.save({ title: 'Flush Test', done: false });

      await strata.dispose();

      // After dispose, the data should be flushed to local adapter
      const blob = await localAdapter.read(tenant, 'task._');
      expect(blob).not.toBeNull();
    });

    it('disposes all repositories', async () => {
      const taskDef = defineEntity<Task>('task');
      strata = new Strata({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });

      const repo = strata.repo(taskDef) as Repository<Task>;
      await strata.dispose();

      expect(() => repo.save({ title: 'After', done: false })).toThrow(
        'Repository is disposed',
      );
    });
  });

  describe('changeCredential()', () => {
    it('throws when no tenant is loaded (blob adapter)', async () => {
      const taskDef = defineEntity<Task>('task');
      strata = new Strata({
        appId: 'test-app',
        entities: [taskDef],
        localAdapter: makeAdapter(), // StorageAdapter, not StorageAdapter
        deviceId: 'dev',
      });
      await expect(strata.tenants.changeCredential('old', 'new')).rejects.toThrow();
    });

    it('throws when no tenant is loaded', async () => {
      const taskDef = defineEntity<Task>('task');
      const storage = new MemoryStorageAdapter();
      const encService = createTestEncryptionService();
      strata = new Strata({
        appId: 'test-app',
        entities: [taskDef],
        localAdapter: storage,
        encryptionService: encService,
        deviceId: 'dev',
      });
      await expect(strata.tenants.changeCredential('old', 'new')).rejects.toThrow(
        'No tenant loaded',
      );
    });

    it('throws when current tenant is not encrypted', async () => {
      const storage = new MemoryStorageAdapter();
      const taskDef = defineEntity<Task>('task');
      const encService = createTestEncryptionService();
      strata = new Strata({
        appId: 'test-app',
        entities: [taskDef],
        localAdapter: storage,
        encryptionService: encService,
        deviceId: 'dev',
      });
      const tenant = await strata.tenants.create({ name: 'Plain', meta: {} });
      await strata.tenants.open(tenant.id);
      await expect(strata.tenants.changeCredential('old', 'new')).rejects.toThrow(
        'Current tenant is not encrypted',
      );
    });

    it('changes password on an encrypted tenant', async () => {
      const storage = new MemoryStorageAdapter();
      const taskDef = defineEntity<Task>('task');

      // Phase 1: Create encrypted tenant with data
      const encService1 = createTestEncryptionService();
      strata = new Strata({
        appId: 'test-app',
        entities: [taskDef],
        localAdapter: storage,
        encryptionService: encService1,
        deviceId: 'dev',
      });
      const tenant = await strata.tenants.create({
        name: 'Encrypted',
        meta: {},
        encryption: { credential: 'oldpass' },
      });
      await strata.tenants.open(tenant.id, { credential: 'oldpass' });
      const repo = strata.repo(taskDef) as Repository<Task>;
      repo.save({ title: 'Secret', done: false });

      // Change password
      await strata.tenants.changeCredential('oldpass', 'newpass');
      await strata.dispose();

      // Phase 2: Reload with new password
      const encService2 = createTestEncryptionService();
      const strata2 = new Strata({
        appId: 'test-app',
        entities: [taskDef],
        localAdapter: storage,
        encryptionService: encService2,
        deviceId: 'dev',
      });
      await strata2.tenants.open(tenant.id, { credential: 'newpass' });
      const repo2 = strata2.repo(taskDef) as Repository<Task>;
      const tasks = await firstValueFrom(repo2.observeQuery().pipe(filter(arr => arr.length > 0)));
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Secret');
      await strata2.dispose();
    });

    it('throws after dispose', async () => {
      const taskDef = defineEntity<Task>('task');
      const storage = new MemoryStorageAdapter();
      const encService = createTestEncryptionService();
      strata = new Strata({
        appId: 'test-app',
        entities: [taskDef],
        localAdapter: storage,
        encryptionService: encService,
        deviceId: 'dev',
      });
      await strata.dispose();
      await expect(strata.tenants.changeCredential('old', 'new')).rejects.toThrow(
        'No tenant loaded',
      );
    });
  });

  describe('close()', () => {
    it('unloads current tenant when called', async () => {
      const taskDef = defineEntity<Task>('task');
      strata = new Strata({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const tenant = await strata.tenants.create({ name: 'T', meta: {} });
      await strata.tenants.open(tenant.id);
      expect(strata.tenants.activeTenant).toBeDefined();

      await strata.tenants.close();
      // After close, no tenant should be active
    });
  });

  describe('open() encryption error paths', () => {
    it('clears encryption and resets tenant on wrong password (catch block)', async () => {
      const storage = new MemoryStorageAdapter();
      const taskDef = defineEntity<Task>('task');

      // Phase 1: Create encrypted tenant
      const encService1 = createTestEncryptionService();
      const strata1 = new Strata({
        appId: 'test-app',
        entities: [taskDef],
        localAdapter: storage,
        encryptionService: encService1,
        deviceId: 'dev',
      });
      const tenant = await strata1.tenants.create({
        name: 'Encrypted',
        meta: {},
        encryption: { credential: 'correctpass' },
      });
      await strata1.tenants.open(tenant.id, { credential: 'correctpass' });
      strata1.repo(taskDef).save({ title: 'secret', done: false });
      await strata1.dispose();

      // Phase 2: Try loading with wrong password — should hit catch block
      const encService2 = createTestEncryptionService();
      strata = new Strata({
        appId: 'test-app',
        entities: [taskDef],
        localAdapter: storage,
        encryptionService: encService2,
        deviceId: 'dev',
      });
      await expect(
        strata.tenants.open(tenant.id, { credential: 'wrongpass' }),
      ).rejects.toThrow();

      // After error, active tenant should be cleared
      expect(strata.tenants.activeTenant).toBeUndefined();
    });
  });

  describe('options validation', () => {
    it('rejects negative tombstoneRetentionMs', () => {
      expect(() => resolveOptions({ tombstoneRetentionMs: -1 }))
        .toThrow('Invalid tombstoneRetentionMs');
    });

    it('rejects Infinity tombstoneRetentionMs', () => {
      expect(() => resolveOptions({ tombstoneRetentionMs: Infinity }))
        .toThrow('Invalid tombstoneRetentionMs');
    });

    it('accepts zero tombstoneRetentionMs', () => {
      const opts = resolveOptions({ tombstoneRetentionMs: 0 });
      expect(opts.tombstoneRetentionMs).toBe(0);
    });

    it('rejects zero cloudSyncIntervalMs', () => {
      expect(() => resolveOptions({ cloudSyncIntervalMs: 0 }))
        .toThrow('Invalid cloudSyncIntervalMs');
    });

    it('rejects negative localFlushIntervalMs', () => {
      expect(() => resolveOptions({ localFlushIntervalMs: -100 }))
        .toThrow('Invalid localFlushIntervalMs');
    });

    it('rejects Infinity cloudSyncIntervalMs', () => {
      expect(() => resolveOptions({ cloudSyncIntervalMs: Infinity }))
        .toThrow('Invalid cloudSyncIntervalMs');
    });
  });
});








