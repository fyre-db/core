import { DEFAULT_OPTIONS, createDataAdapter } from '../helpers';
import { describe, it, expect } from 'vitest';
import { TenantListManager } from '@/tenant';
import type { Tenant } from '@/tenant';
import type { DataAdapter } from '@/persistence';

function makeTenant(overrides: Partial<Tenant> & { id: string; name: string }): Tenant {
  const now = new Date('2026-03-23T12:00:00Z');
  return {
    encrypted: false,
    meta: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// Write a tenant-list blob directly in the format TenantListManager reads, so a
// freshly-constructed manager loads/merges it during init().
async function seed(adapter: DataAdapter, tenants: readonly Tenant[]): Promise<void> {
  const entities: Record<string, unknown> = {};
  for (const t of tenants) entities[t.id] = t;
  await adapter.write(undefined, DEFAULT_OPTIONS.tenantKey, {
    [DEFAULT_OPTIONS.tenantKey]: entities,
    deleted: {},
  });
}

// Force the manager's async init() (local load + cloud merge) to settle.
// `add`/`remove` both await the internal init promise; removing a non-existent
// id leaves contents unchanged but guarantees the merge has completed.
async function ready(mgr: TenantListManager): Promise<TenantListManager> {
  await mgr.remove('__never_exists__');
  return mgr;
}

function newManager(local: DataAdapter, cloud?: DataAdapter): TenantListManager {
  return new TenantListManager(local, cloud, DEFAULT_OPTIONS);
}

describe('TenantListManager — local load', () => {
  it('loads existing local tenants on init', async () => {
    const local = createDataAdapter();
    await seed(local, [makeTenant({ id: 't1', name: 'Local 1' })]);

    const mgr = await ready(newManager(local));

    expect(mgr.tenants).toHaveLength(1);
    expect(mgr.tenants[0].id).toBe('t1');
    expect(mgr.tenants[0].name).toBe('Local 1');
  });

  it('returns empty when local has no tenant blob', async () => {
    const local = createDataAdapter();
    const mgr = await ready(newManager(local));
    expect(mgr.tenants).toEqual([]);
  });
});

describe('TenantListManager — cloud merge on init', () => {
  it('merges union by tenant ID across local and cloud', async () => {
    const local = createDataAdapter();
    const cloud = createDataAdapter();
    await seed(local, [makeTenant({ id: 't1', name: 'Local 1' })]);
    await seed(cloud, [makeTenant({ id: 't2', name: 'Cloud 2' })]);

    const mgr = await ready(newManager(local, cloud));

    expect(mgr.tenants).toHaveLength(2);
    expect(mgr.tenants.map(t => t.id).sort()).toEqual(['t1', 't2']);
  });

  it('keeps the entry with the latest updatedAt when cloud is newer', async () => {
    const local = createDataAdapter();
    const cloud = createDataAdapter();
    await seed(local, [makeTenant({ id: 't1', name: 'Old', updatedAt: new Date('2026-03-01T00:00:00Z') })]);
    await seed(cloud, [makeTenant({ id: 't1', name: 'New', updatedAt: new Date('2026-03-23T00:00:00Z') })]);

    const mgr = await ready(newManager(local, cloud));

    expect(mgr.tenants).toHaveLength(1);
    expect(mgr.tenants[0].name).toBe('New');
  });

  it('keeps the local entry when it is newer than cloud', async () => {
    const local = createDataAdapter();
    const cloud = createDataAdapter();
    await seed(local, [makeTenant({ id: 't1', name: 'Local', updatedAt: new Date('2026-03-23T00:00:00Z') })]);
    await seed(cloud, [makeTenant({ id: 't1', name: 'Remote', updatedAt: new Date('2026-03-01T00:00:00Z') })]);

    const mgr = await ready(newManager(local, cloud));

    expect(mgr.tenants).toHaveLength(1);
    expect(mgr.tenants[0].name).toBe('Local');
  });

  it('handles an empty local list', async () => {
    const local = createDataAdapter();
    const cloud = createDataAdapter();
    await seed(cloud, [makeTenant({ id: 't1', name: 'R' })]);

    const mgr = await ready(newManager(local, cloud));
    expect(mgr.tenants).toHaveLength(1);
  });

  it('handles an empty cloud list', async () => {
    const local = createDataAdapter();
    const cloud = createDataAdapter();
    await seed(local, [makeTenant({ id: 't1', name: 'L' })]);

    const mgr = await ready(newManager(local, cloud));
    expect(mgr.tenants).toHaveLength(1);
  });

  it('handles both lists empty', async () => {
    const local = createDataAdapter();
    const cloud = createDataAdapter();
    const mgr = await ready(newManager(local, cloud));
    expect(mgr.tenants).toHaveLength(0);
  });

  it('persists the merged list back to the local adapter', async () => {
    const local = createDataAdapter();
    const cloud = createDataAdapter();
    await seed(local, [makeTenant({ id: 't1', name: 'Local' })]);
    await seed(cloud, [makeTenant({ id: 't2', name: 'Cloud' })]);

    await ready(newManager(local, cloud));

    // A fresh manager reading local only should now see both tenants.
    const reopened = await ready(newManager(local));
    expect(reopened.tenants.map(t => t.id).sort()).toEqual(['t1', 't2']);
  });
});

describe('TenantListManager — add / remove', () => {
  it('appends a tenant and persists it locally', async () => {
    const local = createDataAdapter();
    const mgr = await ready(newManager(local));

    await mgr.add(makeTenant({ id: 't1', name: 'Test' }));
    expect(mgr.tenants).toHaveLength(1);

    const reopened = await ready(newManager(local));
    expect(reopened.tenants).toHaveLength(1);
    expect(reopened.tenants[0].id).toBe('t1');
  });

  it('is idempotent for a duplicate id', async () => {
    const local = createDataAdapter();
    const mgr = await ready(newManager(local));

    await mgr.add(makeTenant({ id: 't1', name: 'First' }));
    await mgr.add(makeTenant({ id: 't1', name: 'Second' }));

    expect(mgr.tenants).toHaveLength(1);
    expect(mgr.tenants[0].name).toBe('First');
  });

  it('removes a tenant by id', async () => {
    const local = createDataAdapter();
    const mgr = await ready(newManager(local));

    await mgr.add(makeTenant({ id: 't1', name: 'Test' }));
    await mgr.remove('t1');

    expect(mgr.tenants).toHaveLength(0);
  });

  it('propagates additions to the cloud adapter', async () => {
    const local = createDataAdapter();
    const cloud = createDataAdapter();
    const mgr = await ready(newManager(local, cloud));

    await mgr.add(makeTenant({ id: 't1', name: 'Test' }));

    // A manager reading the cloud adapter as its local should see the tenant.
    const fromCloud = await ready(newManager(cloud));
    expect(fromCloud.tenants).toHaveLength(1);
    expect(fromCloud.tenants[0].id).toBe('t1');
  });
});

describe('TenantListManager — find', () => {
  it('returns the tenant for a known id', async () => {
    const local = createDataAdapter();
    const mgr = await ready(newManager(local));
    await mgr.add(makeTenant({ id: 't1', name: 'Test' }));

    expect(mgr.find('t1')?.name).toBe('Test');
  });

  it('returns undefined for an unknown id', async () => {
    const local = createDataAdapter();
    const mgr = await ready(newManager(local));
    expect(mgr.find('nope')).toBeUndefined();
  });
});

describe('TenantListManager — name persistence', () => {
  it('persists the tenant name across manager instances', async () => {
    const local = createDataAdapter();
    const mgr = await ready(newManager(local));
    await mgr.add(makeTenant({ id: 'prefs-t1', name: 'My Tenant', meta: { folder: 'test-folder' } }));

    const reopened = await ready(newManager(local));
    expect(reopened.find('prefs-t1')?.name).toBe('My Tenant');
  });
});

describe('TenantListManager — tenants$', () => {
  it('emits the current list to subscribers', async () => {
    const local = createDataAdapter();
    const mgr = await ready(newManager(local));

    const seen: (readonly Tenant[])[] = [];
    const sub = mgr.tenants$.subscribe(list => seen.push(list));
    await mgr.add(makeTenant({ id: 't1', name: 'Test' }));
    sub.unsubscribe();

    const last = seen[seen.length - 1];
    expect(last.map(t => t.id)).toEqual(['t1']);
  });
});

