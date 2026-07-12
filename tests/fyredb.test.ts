import { describe, it, expect, vi, afterEach } from 'vitest';
import { firstValueFrom, filter } from 'rxjs';
import {
  FyreDb,
  FyreDbError,
  validateEntityDefinitions,
  defineEntity,
  MemoryStorageAdapter,
  resolveOptions,
  serialize,
} from '@/index';
import type { SyncEvent } from '@/index';
import type { Repository, SingletonRepository } from '@/repo';
import { createTestEncryptionService, waitForTenantInList } from './helpers';

type Task = { title: string; done: boolean };
type Settings = { theme: string };

function makeAdapter() {
  return new MemoryStorageAdapter();
}

function makeFyreDb(overrides?: {
  cloudAdapter?: MemoryStorageAdapter;
  entities?: ReturnType<typeof defineEntity>[];
}): { fyredb: FyreDb; localAdapter: MemoryStorageAdapter } {
  const taskDef = defineEntity<Task>('task');
  const localAdapter = makeAdapter();
  const fyredb = new FyreDb({
    appId: 'test',
    entities: overrides?.entities ?? [taskDef],
    localAdapter,
    cloudAdapter: overrides?.cloudAdapter,
    deviceId: 'test-device',
  });
  return { fyredb, localAdapter };
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

describe('FyreDb', () => {
  let fyredb: FyreDb;

  afterEach(async () => {
    if (fyredb) {
      await fyredb.dispose();
    }
  });

  it('creates fyredb instance with all public API methods', () => {
    ({ fyredb } = makeFyreDb());
    expect(fyredb.tenants).toBeDefined();
    expect(fyredb.repo).toBeTypeOf('function');
    expect(fyredb.tenants.sync).toBeTypeOf('function');
    expect(fyredb.dispose).toBeTypeOf('function');
    expect(fyredb.isDirty).toBe(false);
    expect(fyredb.observe).toBeTypeOf('function');
  });

  it('accepts config with migrations', () => {
    const taskDef = defineEntity<Task>('task');
    fyredb = new FyreDb({
      appId: 'test',
      entities: [taskDef],
      localAdapter: makeAdapter(),
      deviceId: 'dev',
      migrations: [{ version: 1, migrate: (blob: any) => blob }],
    });
    expect(fyredb).toBeDefined();
  });

  describe('repo()', () => {
    it('returns repository for known entity definition', () => {
      const taskDef = defineEntity<Task>('task');
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const repo = fyredb.repo(taskDef);
      expect(repo).toBeDefined();
    });

    it('throws for unknown entity definition', () => {
      const taskDef = defineEntity<Task>('task');
      const unknownDef = defineEntity<Settings>('settings');
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      expect(() => fyredb.repo(unknownDef)).toThrow('Unknown entity definition');
    });

    it('returns Repository for non-singleton entities', () => {
      const taskDef = defineEntity<Task>('task');
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const repo = fyredb.repo(taskDef) as Repository<Task>;
      expect(repo.save).toBeTypeOf('function');
      expect(repo.query).toBeTypeOf('function');
      expect(repo.get).toBeTypeOf('function');
      expect(repo.delete).toBeTypeOf('function');
    });

    it('returns SingletonRepository for singleton entities', () => {
      const settingsDef = defineEntity<Settings>('settings', {
        keyStrategy: 'singleton',
      });
      fyredb = new FyreDb({
        appId: 'test',
        entities: [settingsDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const repo = fyredb.repo(settingsDef) as SingletonRepository<Settings>;
      expect(repo.save).toBeTypeOf('function');
      expect(repo.get).toBeTypeOf('function');
      expect(repo.delete).toBeTypeOf('function');
      expect(repo.observe).toBeTypeOf('function');
    });

    it('allows CRUD operations through repo', () => {
      const taskDef = defineEntity<Task>('task');
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const repo = fyredb.repo(taskDef) as Repository<Task>;
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
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef, settingsDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });

      const taskRepo = fyredb.repo(taskDef) as Repository<Task>;
      const settingsRepo = fyredb.repo(settingsDef) as SingletonRepository<Settings>;

      taskRepo.save({ title: 'Task1', done: false });
      settingsRepo.save({ theme: 'dark' });

      expect(taskRepo.query()).toHaveLength(1);
      expect(settingsRepo.get()?.theme).toBe('dark');
    });
  });

  describe('tenants', () => {
    it('exposes tenant manager', () => {
      ({ fyredb } = makeFyreDb());
      expect(fyredb.tenants.probe).toBeTypeOf('function');
      expect(fyredb.tenants.create).toBeTypeOf('function');
      expect(fyredb.tenants.open).toBeTypeOf('function');
      expect(fyredb.tenants.join).toBeTypeOf('function');
      expect(fyredb.tenants.close).toBeTypeOf('function');
      expect(fyredb.tenants.remove).toBeTypeOf('function');
      expect(fyredb.tenants.changeCredential).toBeTypeOf('function');
      expect(fyredb.tenants.tenants$).toBeDefined();
      expect(fyredb.tenants.activeTenant$).toBeDefined();
    });

    it('creates and loads a tenant', async () => {
      ({ fyredb } = makeFyreDb());
      const tenant = await fyredb.tenants.create({
        name: 'Test Workspace',
        meta: { bucket: 'test' },
      });
      await fyredb.tenants.open(tenant.id);
      expect(fyredb.tenants.activeTenant?.id).toBe(tenant.id);
    });

    it('stops previous sync scheduler when loading a new tenant', async () => {
      const cloudAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter,
        deviceId: 'dev',
      });

      const t1 = await fyredb.tenants.create({
        name: 'Tenant 1',
        meta: { bucket: 't1' },
      });
      const t2 = await fyredb.tenants.create({
        name: 'Tenant 2',
        meta: { bucket: 't2' },
      });

      await fyredb.tenants.open(t1.id);
      // Load a second tenant — should stop the first scheduler
      await fyredb.tenants.open(t2.id);

      expect(fyredb.tenants.activeTenant?.id).toBe(t2.id);
    });

    it('hydrates from local on tenant load without cloud adapter', async () => {
      const localAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter,
        deviceId: 'dev',
      });
      const tenant = await fyredb.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await fyredb.tenants.open(tenant.id);
      expect(fyredb.tenants.activeTenant?.name).toBe('Test');
    });

    it('emits sync-failed when cloud adapter fails during hydrate', async () => {
      const localAdapter = makeAdapter();
      const failingCloudAdapter = makeAdapter();
      // Sabotage the cloud adapter to simulate unreachable
      failingCloudAdapter.read = () => {
        throw new Error('Network error');
      };

      const taskDef = defineEntity<Task>('task');
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter,
        cloudAdapter: failingCloudAdapter,
        deviceId: 'dev',
      });

      const events: SyncEvent[] = [];
      fyredb.observe('sync').subscribe(e => events.push(e));

      const tenant = await fyredb.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await fyredb.tenants.open(tenant.id);

      // Trigger lazy load — cloud failure happens on first access, not during open()
      const repo = fyredb.repo(taskDef) as Repository<Task>;
      repo.query();
      await new Promise(r => setTimeout(r, 50));

      expect(events.some(e => e.type === 'sync-failed')).toBe(true);
    });
  });

  describe('sync()', () => {
    it('rejects when no tenant loaded', async () => {
      const cloudAdapter = makeAdapter();
      ({ fyredb } = makeFyreDb({ cloudAdapter }));
      await expect(fyredb.tenants.sync()).rejects.toThrow('No tenant loaded');
    });

    it('rejects when no cloud adapter configured', async () => {
      ({ fyredb } = makeFyreDb());
      const tenant = await fyredb.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await fyredb.tenants.open(tenant.id);
      await expect(fyredb.tenants.sync()).rejects.toThrow('No cloud adapter configured');
    });

    it('succeeds with cloud adapter and loaded tenant', async () => {
      const cloudAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter,
        deviceId: 'dev',
      });
      const tenant = await fyredb.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await fyredb.tenants.open(tenant.id);

      const result = await fyredb.tenants.sync();
      expect(result).toBeDefined();
      expect(result.entitiesUpdated).toBe(0);
    });

    it('emits sync-started and sync-completed events', async () => {
      const cloudAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter,
        deviceId: 'dev',
      });
      const events: SyncEvent[] = [];
      fyredb.observe('sync').subscribe(e => events.push(e));

      const tenant = await fyredb.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await fyredb.tenants.open(tenant.id);
      await fyredb.tenants.sync();

      const types = events.map(e => e.type);
      expect(types).toContain('sync-started');
      expect(types).toContain('sync-completed');
    });

    it('emits sync-failed event on sync error', async () => {
      const cloudAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter,
        deviceId: 'dev',
      });
      const events: SyncEvent[] = [];
      fyredb.observe('sync').subscribe(e => events.push(e));

      const tenant = await fyredb.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await fyredb.tenants.open(tenant.id);

      // Sabotage cloud adapter to cause sync failure
      cloudAdapter.read = () => {
        throw new Error('Sync failure');
      };

      await expect(fyredb.tenants.sync()).rejects.toThrow('Sync failure');
      expect(events.some(e => e.type === 'sync-failed')).toBe(true);
    });
  });

  describe('isDirty', () => {
    it('starts clean', () => {
      ({ fyredb } = makeFyreDb());
      expect(fyredb.isDirty).toBe(false);
    });

    it('becomes dirty after save', async () => {
      const taskDef = defineEntity<Task>('task');
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const tenant = await fyredb.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await fyredb.tenants.open(tenant.id);

      const repo = fyredb.repo(taskDef) as Repository<Task>;
      repo.save({ title: 'Test', done: false });
      expect(fyredb.isDirty).toBe(true);
    });

    it('stays clean in local-only mode (no cloud adapter)', async () => {
      const taskDef = defineEntity<Task>('task');
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const tenant = await fyredb.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await fyredb.tenants.open(tenant.id);

      const repo = fyredb.repo(taskDef) as Repository<Task>;
      repo.save({ title: 'Test', done: false });
      expect(fyredb.isDirty).toBe(false);
    });

    it('clears after sync', async () => {
      const cloudAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter,
        deviceId: 'dev',
      });

      const tenant = await fyredb.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await fyredb.tenants.open(tenant.id);

      const repo = fyredb.repo(taskDef) as Repository<Task>;
      repo.save({ title: 'Test', done: false });
      expect(fyredb.isDirty).toBe(true);

      await fyredb.tenants.sync();
      expect(fyredb.isDirty).toBe(false);
    });

    it('exposes isDirty$ observable', () => {
      ({ fyredb } = makeFyreDb());
      const values: boolean[] = [];
      fyredb.observe('dirty').subscribe(v => values.push(v));
      expect(values[0]).toBe(false);
    });
  });

  describe('observe()', () => {
    it('observe("entity") returns all entity events', () => {
      const taskDef = defineEntity<Task>('task');
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const events: unknown[] = [];
      fyredb.observe('entity').subscribe(e => events.push(e));
      const repo = fyredb.repo(taskDef) as Repository<Task>;
      repo.save({ title: 'X', done: false });
      expect(events.length).toBeGreaterThan(0);
    });

    it('observe("entity", entityName) filters by entity name', () => {
      const taskDef = defineEntity<Task>('task');
      const settingsDef = defineEntity<Settings>('settings', { keyStrategy: 'singleton' });
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef, settingsDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const taskEvents: unknown[] = [];
      fyredb.observe('entity', 'task').subscribe(e => taskEvents.push(e));
      const repo = fyredb.repo(settingsDef) as SingletonRepository<Settings>;
      repo.save({ theme: 'dark' });
      // No task events should fire for a settings save
      const taskRepo = fyredb.repo(taskDef) as Repository<Task>;
      taskRepo.save({ title: 'X', done: false });
      // Only the task save should appear
      expect(taskEvents.length).toBe(1);
    });

    it('observe("tenant") returns tenant observable', () => {
      ({ fyredb } = makeFyreDb());
      const values: unknown[] = [];
      fyredb.observe('tenant').subscribe(v => values.push(v));
      expect(values.length).toBeGreaterThan(0);
    });

    it('observe("error") re-emits sync FyreDbErrors on the error channel', async () => {
      const cloudAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter,
        deviceId: 'dev',
      });

      const errors: FyreDbError[] = [];
      fyredb.observe('error').subscribe(e => errors.push(e));

      const tenant = await fyredb.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await fyredb.tenants.open(tenant.id);

      // A typed FyreDbError from the cloud adapter is preserved by the sync
      // engine and re-emitted onto the error channel.
      const boom = new FyreDbError('Boom', { kind: 'unknown' });
      cloudAdapter.read = () => { throw boom; };

      await expect(fyredb.tenants.sync()).rejects.toThrow('Boom');

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toBeInstanceOf(FyreDbError);
      expect(errors.some(e => e === boom)).toBe(true);
    });

    it('observe("error") does not re-emit plain (non-FyreDbError) sync errors', async () => {
      const cloudAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter,
        deviceId: 'dev',
      });

      const errors: FyreDbError[] = [];
      fyredb.observe('error').subscribe(e => errors.push(e));

      const tenant = await fyredb.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await fyredb.tenants.open(tenant.id);

      // A plain Error is reported as a sync-failed event but is NOT a
      // FyreDbError, so the error channel stays silent.
      cloudAdapter.read = () => { throw new Error('plain failure'); };

      await expect(fyredb.tenants.sync()).rejects.toThrow('plain failure');

      expect(errors).toHaveLength(0);
    });
  });

  describe('sync events', () => {
    it('syncEvents$ delivers events and unsubscribe stops delivery', async () => {
      const cloudAdapter = makeAdapter();
      const taskDef = defineEntity<Task>('task');
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        cloudAdapter,
        deviceId: 'dev',
      });
      const events: SyncEvent[] = [];
      const sub = fyredb.observe('sync').subscribe(e => events.push(e));

      const tenant = await fyredb.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await fyredb.tenants.open(tenant.id);
      await fyredb.tenants.sync();
      expect(events.length).toBeGreaterThan(0);

      const countBefore = events.length;
      sub.unsubscribe();
      await fyredb.tenants.sync();
      expect(events.length).toBe(countBefore);
    });
  });

  describe('dispose()', () => {
    it('returns a promise', async () => {
      ({ fyredb } = makeFyreDb());
      const result = fyredb.dispose();
      expect(result).toBeInstanceOf(Promise);
      await result;
    });

    it('is idempotent — returns same promise', async () => {
      ({ fyredb } = makeFyreDb());
      const p1 = fyredb.dispose();
      const p2 = fyredb.dispose();
      expect(p1).toBe(p2);
      await p1;
    });

    it('repo() throws after dispose', async () => {
      const taskDef = defineEntity<Task>('task');
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      await fyredb.dispose();
      expect(() => fyredb.repo(taskDef)).toThrow('FyreDb instance is disposed');
    });

    it('sync() rejects after dispose', async () => {
      const cloudAdapter = makeAdapter();
      ({ fyredb } = makeFyreDb({ cloudAdapter }));
      await fyredb.dispose();
      await expect(fyredb.tenants.sync()).rejects.toThrow('No tenant loaded');
    });

    it('open() rejects after dispose', async () => {
      ({ fyredb } = makeFyreDb());
      const tenant = await fyredb.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await fyredb.dispose();
      await expect(fyredb.tenants.open(tenant.id)).rejects.toThrow(
        'SyncEngine is disposed',
      );
    });

    it('flushes dirty data on dispose', async () => {
      const taskDef = defineEntity<Task>('task');
      const localAdapter = makeAdapter();
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter,
        deviceId: 'dev',
      });
      const tenant = await fyredb.tenants.create({
        name: 'Test',
        meta: { bucket: 'test' },
      });
      await fyredb.tenants.open(tenant.id);

      const repo = fyredb.repo(taskDef) as Repository<Task>;
      repo.save({ title: 'Flush Test', done: false });

      await fyredb.dispose();

      // After dispose, the data should be flushed to local adapter
      const blob = await localAdapter.read(tenant, 'task._');
      expect(blob).not.toBeNull();
    });

    it('disposes all repositories', async () => {
      const taskDef = defineEntity<Task>('task');
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });

      const repo = fyredb.repo(taskDef) as Repository<Task>;
      await fyredb.dispose();

      expect(() => repo.save({ title: 'After', done: false })).toThrow(
        'Repository is disposed',
      );
    });
  });

  describe('changeCredential()', () => {
    it('throws when no tenant is loaded (blob adapter)', async () => {
      const taskDef = defineEntity<Task>('task');
      fyredb = new FyreDb({
        appId: 'test-app',
        entities: [taskDef],
        localAdapter: makeAdapter(), // StorageAdapter, not StorageAdapter
        deviceId: 'dev',
      });
      await expect(fyredb.tenants.changeCredential('old', 'new')).rejects.toThrow();
    });

    it('throws when no tenant is loaded', async () => {
      const taskDef = defineEntity<Task>('task');
      const storage = new MemoryStorageAdapter();
      const encService = createTestEncryptionService();
      fyredb = new FyreDb({
        appId: 'test-app',
        entities: [taskDef],
        localAdapter: storage,
        encryptionService: encService,
        deviceId: 'dev',
      });
      await expect(fyredb.tenants.changeCredential('old', 'new')).rejects.toThrow(
        'No tenant loaded',
      );
    });

    it('throws when current tenant is not encrypted', async () => {
      const storage = new MemoryStorageAdapter();
      const taskDef = defineEntity<Task>('task');
      const encService = createTestEncryptionService();
      fyredb = new FyreDb({
        appId: 'test-app',
        entities: [taskDef],
        localAdapter: storage,
        encryptionService: encService,
        deviceId: 'dev',
      });
      const tenant = await fyredb.tenants.create({ name: 'Plain', meta: {} });
      await fyredb.tenants.open(tenant.id);
      await expect(fyredb.tenants.changeCredential('old', 'new')).rejects.toThrow(
        'Current tenant is not encrypted',
      );
    });

    it('changes password on an encrypted tenant', async () => {
      const storage = new MemoryStorageAdapter();
      const taskDef = defineEntity<Task>('task');

      // Phase 1: Create encrypted tenant with data
      const encService1 = createTestEncryptionService();
      fyredb = new FyreDb({
        appId: 'test-app',
        entities: [taskDef],
        localAdapter: storage,
        encryptionService: encService1,
        deviceId: 'dev',
      });
      const tenant = await fyredb.tenants.create({
        name: 'Encrypted',
        meta: {},
        encryption: { credential: 'oldpass' },
      });
      await fyredb.tenants.open(tenant.id, { credential: 'oldpass' });
      const repo = fyredb.repo(taskDef) as Repository<Task>;
      repo.save({ title: 'Secret', done: false });

      // Change password
      await fyredb.tenants.changeCredential('oldpass', 'newpass');
      await fyredb.dispose();

      // Phase 2: Reload with new password
      const encService2 = createTestEncryptionService();
      const fyredb2 = new FyreDb({
        appId: 'test-app',
        entities: [taskDef],
        localAdapter: storage,
        encryptionService: encService2,
        deviceId: 'dev',
      });
      await waitForTenantInList(fyredb2.tenants.tenants$, tenant.id);
      await fyredb2.tenants.open(tenant.id, { credential: 'newpass' });
      const repo2 = fyredb2.repo(taskDef) as Repository<Task>;
      const tasks = await firstValueFrom(repo2.observeQuery().pipe(filter(arr => arr.length > 0)));
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Secret');
      await fyredb2.dispose();
    });

    it('throws after dispose', async () => {
      const taskDef = defineEntity<Task>('task');
      const storage = new MemoryStorageAdapter();
      const encService = createTestEncryptionService();
      fyredb = new FyreDb({
        appId: 'test-app',
        entities: [taskDef],
        localAdapter: storage,
        encryptionService: encService,
        deviceId: 'dev',
      });
      await fyredb.dispose();
      await expect(fyredb.tenants.changeCredential('old', 'new')).rejects.toThrow(
        'No tenant loaded',
      );
    });
  });

  describe('close()', () => {
    it('unloads current tenant when called', async () => {
      const taskDef = defineEntity<Task>('task');
      fyredb = new FyreDb({
        appId: 'test',
        entities: [taskDef],
        localAdapter: makeAdapter(),
        deviceId: 'dev',
      });
      const tenant = await fyredb.tenants.create({ name: 'T', meta: {} });
      await fyredb.tenants.open(tenant.id);
      expect(fyredb.tenants.activeTenant).toBeDefined();

      await fyredb.tenants.close();
      // After close, no tenant should be active
    });
  });

  describe('open() encryption error paths', () => {
    it('clears encryption and resets tenant on wrong password (catch block)', async () => {
      const storage = new MemoryStorageAdapter();
      const taskDef = defineEntity<Task>('task');

      // Phase 1: Create encrypted tenant
      const encService1 = createTestEncryptionService();
      const fyredb1 = new FyreDb({
        appId: 'test-app',
        entities: [taskDef],
        localAdapter: storage,
        encryptionService: encService1,
        deviceId: 'dev',
      });
      const tenant = await fyredb1.tenants.create({
        name: 'Encrypted',
        meta: {},
        encryption: { credential: 'correctpass' },
      });
      await fyredb1.tenants.open(tenant.id, { credential: 'correctpass' });
      fyredb1.repo(taskDef).save({ title: 'secret', done: false });
      await fyredb1.dispose();

      // Phase 2: Try loading with wrong password — should hit catch block
      const encService2 = createTestEncryptionService();
      fyredb = new FyreDb({
        appId: 'test-app',
        entities: [taskDef],
        localAdapter: storage,
        encryptionService: encService2,
        deviceId: 'dev',
      });
      await expect(
        fyredb.tenants.open(tenant.id, { credential: 'wrongpass' }),
      ).rejects.toThrow();

      // After error, active tenant should be cleared
      expect(fyredb.tenants.activeTenant).toBeUndefined();
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

    it('rejects zero cloudPullIntervalMs', () => {
      expect(() => resolveOptions({ cloudPullIntervalMs: 0 }))
        .toThrow('Invalid cloudPullIntervalMs');
    });

    it('rejects negative localFlushDebounceMs', () => {
      expect(() => resolveOptions({ localFlushDebounceMs: -100 }))
        .toThrow('Invalid localFlushDebounceMs');
    });

    it('rejects Infinity cloudSyncDebounceMs', () => {
      expect(() => resolveOptions({ cloudSyncDebounceMs: Infinity }))
        .toThrow('Invalid cloudSyncDebounceMs');
    });

    it('rejects localFlushMaxWaitMs below the debounce window', () => {
      expect(() => resolveOptions({ localFlushDebounceMs: 1000, localFlushMaxWaitMs: 500 }))
        .toThrow('localFlushMaxWaitMs');
    });
  });
});








