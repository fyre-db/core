import { BehaviorSubject, type Observable } from 'rxjs';
import type { DataAdapter } from '@/persistence';
import type { PartitionBlob } from '@/persistence';
import type { ResolvedFyreDbOptions } from '../options';
import type { Tenant } from './types';
import { log } from '@/log';

export class TenantListManager {
  private readonly local: DataAdapter;
  private readonly cloud: DataAdapter | undefined;
  private readonly options: ResolvedFyreDbOptions;
  private readonly subject = new BehaviorSubject<readonly Tenant[]>([]);
  private initPromise: Promise<void> | null = null;

  readonly tenants$: Observable<readonly Tenant[]> = this.subject.asObservable();

  get tenants(): readonly Tenant[] {
    return this.subject.getValue();
  }

  constructor(
    localAdapter: DataAdapter,
    cloudAdapter: DataAdapter | undefined,
    options: ResolvedFyreDbOptions,
  ) {
    this.local = localAdapter;
    this.cloud = cloudAdapter;
    this.options = options;
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {

    // Load local immediately
    const local = await this.load(this.local);
    this.subject.next(local);

    // Reconcile with cloud if available. Cloud is AUTHORITATIVE: a tenant that
    // exists locally but is absent from cloud was deleted on another device, so
    // it must be dropped (a plain union would resurrect it — the ghost-tenant
    // bug). The sole exception is a tenant created locally while cloud was
    // unreachable: it hasn't been pushed yet, so we keep it. We detect that as a
    // local-only tenant created after the newest cloud tenant's timestamp.
    if (this.cloud) {
      try {
        const remote = await this.load(this.cloud);
        const reconciled = this.reconcile(local, remote);
        this.subject.next(reconciled);
        await this.save(this.local, reconciled);
      } catch {
        log.tenant.warn('cloud unreachable — using local tenant list');
      }
    }
  }

  find(id: string): Tenant | undefined {
    return this.tenants.find(t => t.id === id);
  }

  async add(tenant: Tenant): Promise<void> {
    await this.initPromise;
    const existing = this.find(tenant.id);
    if (existing) return;

    const updated = [...this.tenants, tenant];
    this.subject.next(updated);
    await this.persist(updated);
  }

  async remove(tenantId: string): Promise<void> {
    await this.initPromise;
    const updated = this.tenants.filter(t => t.id !== tenantId);
    this.subject.next(updated);
    await this.persist(updated);
  }

  // ─── Internals ───────────────────────────────────────────

  private async persist(tenants: readonly Tenant[]): Promise<void> {
    await this.save(this.local, tenants);
    if (this.cloud) {
      try {
        await this.save(this.cloud, tenants);
      } catch {
        log.tenant.warn('cloud unreachable — tenant list saved locally only');
      }
    }
  }

  private async load(adapter: DataAdapter): Promise<Tenant[]> {
    const blob = await adapter.read(undefined, this.options.tenantKey);
    if (!blob) return [];
    const entities = blob[this.options.tenantKey] as Record<string, unknown> | undefined;
    if (!entities) return [];
    return Object.values(entities) as Tenant[];
  }

  private async save(adapter: DataAdapter, tenants: readonly Tenant[]): Promise<void> {
    const entities: Record<string, unknown> = {};
    for (const tenant of tenants) {
      entities[tenant.id] = tenant;
    }
    const blob: PartitionBlob = {
      [this.options.tenantKey]: entities,
      deleted: {},
    };
    await adapter.write(undefined, this.options.tenantKey, blob);
  }

  /**
   * Reconcile the local list against the authoritative cloud list.
   *
   * The cloud snapshot is the source of truth for membership: any tenant it
   * omits is treated as deleted-elsewhere and removed locally. For tenants it
   * contains, the newer `updatedAt` wins (LWW) so edits propagate both ways.
   *
   * The one thing we must NOT drop is a tenant created locally while offline
   * that never reached the cloud. We keep such a tenant only when it is
   * local-only AND newer than the freshest cloud tenant — i.e. it plausibly
   * post-dates the cloud snapshot rather than having been deleted from it.
   */
  private reconcile(
    local: readonly Tenant[],
    remote: readonly Tenant[],
  ): Tenant[] {
    const result = new Map<string, Tenant>();

    // Cloud is authoritative: start from the remote snapshot.
    for (const t of remote) result.set(t.id, t);

    // Apply local edits that are newer than cloud (LWW) for tenants cloud knows.
    const localById = new Map(local.map(t => [t.id, t]));
    for (const [id, remoteTenant] of result) {
      const localTenant = localById.get(id);
      if (localTenant && this.time(localTenant.updatedAt) > this.time(remoteTenant.updatedAt)) {
        result.set(id, localTenant);
      }
    }

    // Preserve local-only tenants that are newer than the cloud snapshot
    // (unsynced offline creations), but drop older local-only ones (deletions).
    const newestRemote = remote.reduce((max, t) => Math.max(max, this.time(t.updatedAt)), 0);
    for (const t of local) {
      if (result.has(t.id)) continue;
      if (this.time(t.createdAt) > newestRemote) result.set(t.id, t);
    }

    return Array.from(result.values());
  }

  private time(d: Date | string): number {
    return new Date(d).getTime();
  }
}
