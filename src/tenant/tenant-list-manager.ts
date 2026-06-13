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

    // Merge from cloud if available
    if (this.cloud) {
      try {
        const remote = await this.load(this.cloud);
        const merged = this.merge(local, remote);
        this.subject.next(merged);
        await this.save(this.local, merged);
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

  private merge(
    listA: readonly Tenant[],
    listB: readonly Tenant[],
  ): Tenant[] {
    const merged = new Map<string, Tenant>();
    for (const t of listA) merged.set(t.id, t);
    for (const t of listB) {
      const existing = merged.get(t.id);
      if (!existing || new Date(t.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
        merged.set(t.id, t);
      }
    }
    return Array.from(merged.values());
  }
}
