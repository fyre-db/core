import type { EncryptionService, EncryptionKeys, StorageAdapter } from '@/adapter';
import type { EntityStore } from '@/store';
import type { DataAdapter } from '@/persistence';
import type { ResolvedFyreDbOptions } from '../options';
import type { SyncEngineType, SyncResult, SyncEvent } from '@/sync';
import type { ReactiveFlag } from '@/utils';
import type { EventBus } from '@/reactive';
import { generateId } from '@/utils';
import { partitionBlobKey } from '@/adapter';
import type {
  Tenant,
  ProbeResult,
  CreateTenantOptions,
  JoinTenantOptions,
  TenantManager as TenantManagerType,
} from './types';
import type { TenantContext } from './tenant-context';
import { TenantListManager } from './tenant-list-manager';
import { writeMarkerBlob, readMarkerBlob, validateMarkerBlob } from './marker-blob';
import { TenantError } from './errors';
import { SyncError } from '@/sync/errors';
import { log } from '@/log';

export type TenantManagerDeps = {
  readonly adapter: DataAdapter;
  readonly rawAdapter: StorageAdapter;
  readonly cloudAdapter?: DataAdapter;
  readonly syncEngine: SyncEngineType;
  readonly syncEventBus: EventBus<SyncEvent>;
  readonly store: EntityStore;
  readonly dirtyTracker: ReactiveFlag;
  readonly encryptionService: EncryptionService;
  readonly tenantContext: TenantContext;
  readonly options: ResolvedFyreDbOptions;
  readonly appId: string;
  readonly entityTypes: readonly string[];
  readonly rawCloudAdapter?: StorageAdapter;
};

export class TenantManager implements TenantManagerType {
  private readonly tenantList: TenantListManager;

  readonly activeTenant$;
  readonly tenants$;

  get activeTenant(): Tenant | undefined {
    return this.deps.tenantContext.activeTenant;
  }

  get tenants(): readonly Tenant[] {
    return this.tenantList.tenants;
  }

  constructor(private readonly deps: TenantManagerDeps) {
    this.activeTenant$ = deps.tenantContext.activeTenant$;
    this.tenantList = new TenantListManager(deps.adapter, deps.cloudAdapter, deps.options);
    this.tenants$ = this.tenantList.tenants$;
  }

  // ─── Internals ───────────────────────────────────────────

  private deriveId(meta: Record<string, unknown>): string {
    if (this.deps.rawCloudAdapter?.deriveTenantId) {
      return this.deps.rawCloudAdapter.deriveTenantId(meta);
    }
    return generateId();
  }

  // ─── Cold ops ────────────────────────────────────────────

  async probe(ref: { meta: Record<string, unknown> }): Promise<ProbeResult> {
    const id = this.deriveId(ref.meta);
    const tempTenant: Tenant = {
      id, name: '', encrypted: false, meta: ref.meta,
      createdAt: new Date(), updatedAt: new Date(),
    };

    // Check if marker blob exists using the raw adapter (no deserialization)
    const raw = await this.deps.rawAdapter.read(tempTenant, this.deps.options.markerKey);
    if (!raw) return { exists: false };

    // Try reading through the encrypted adapter to detect encryption
    try {
      const marker = await readMarkerBlob(this.deps.adapter, tempTenant, this.deps.options);
      if (!marker) return { exists: false };
      return { exists: true, encrypted: !!marker.keyData, tenantId: id };
    } catch {
      // Deserialization or decryption failed — marker exists but is encrypted
      return { exists: true, encrypted: true, tenantId: id };
    }
  }

  async create(opts: CreateTenantOptions): Promise<Tenant> {
    return this.register({ ...opts, mode: 'create' });
  }

  async join(opts: JoinTenantOptions): Promise<Tenant> {
    return this.register({ ...opts, mode: 'join' });
  }

  private async register(opts: {
    readonly name: string;
    readonly meta: Record<string, unknown>;
    readonly mode: 'create' | 'join';
    readonly encryption?: { readonly credential: string };
  }): Promise<Tenant> {
    const id = this.deriveId(opts.meta);
    const existing = this.tenantList.find(id);
    if (existing) return existing;

    const probe = await this.probe({ meta: opts.meta });

    if (opts.mode === 'create' && probe.exists) {
      throw new TenantError('Workspace already exists at this location', { kind: 'workspace-exists' });
    }
    if (opts.mode === 'join' && !probe.exists) {
      throw new TenantError('No workspace found at this location', { kind: 'workspace-not-found' });
    }

    const encrypted = opts.mode === 'create'
      ? !!opts.encryption
      : probe.exists ? probe.encrypted : false;

    const now = new Date();
    const tenant: Tenant = {
      id, name: opts.name, encrypted, meta: opts.meta,
      createdAt: now, updatedAt: now,
    };

    // Create-only: encryption setup + marker write
    if (opts.mode === 'create') {
      let keyData: Record<string, unknown> | undefined;
      if (opts.encryption) {
        let keys = await this.deps.encryptionService.deriveKeys(
          opts.encryption.credential, this.deps.appId,
        );
        const result = await this.deps.encryptionService.generateKeyData(keys);
        keys = result.keys;
        keyData = result.keyData;
        this.deps.tenantContext.set(tenant, keys);
      }

      await this.tenantList.add(tenant);

      await writeMarkerBlob(
        this.deps.adapter, tenant, this.deps.entityTypes, this.deps.options, keyData,
      );
      if (this.deps.cloudAdapter) {
        await writeMarkerBlob(
          this.deps.cloudAdapter, tenant, this.deps.entityTypes, this.deps.options, keyData,
        );
      }

      if (opts.encryption) {
        this.deps.tenantContext.clear();
      }
    } else {
      // Join: validate the existing marker's version when it is readable
      // (unencrypted). Encrypted markers can't be read without a credential,
      // so their version is validated after open() decrypts them.
      if (!encrypted) {
        let marker;
        try {
          marker = await readMarkerBlob(this.deps.adapter, tenant, this.deps.options);
        } catch {
          marker = undefined;
        }
        if (marker && !validateMarkerBlob(marker)) {
          throw new TenantError(
            `Incompatible workspace version: ${String(marker.version)}`,
            { kind: 'workspace-incompatible' },
          );
        }
      }
      await this.tenantList.add(tenant);
    }

    log.tenant('%s tenant %s', opts.mode === 'create' ? 'created' : 'joined', id);
    return tenant;
  }

  async remove(tenantId: string, opts?: { purge?: boolean }): Promise<void> {
    const tenant = this.tenantList.find(tenantId);

    // Update list first — safer on crash (leaves orphaned data, not orphaned listing)
    await this.tenantList.remove(tenantId);

    if (opts?.purge && tenant) {
      const marker = await readMarkerBlob(this.deps.adapter, tenant, this.deps.options);
      if (marker?.indexes) {
        for (const [entityName, partitions] of Object.entries(marker.indexes)) {
          for (const partitionKey of Object.keys(partitions)) {
            await this.deps.adapter.delete(tenant, partitionBlobKey(entityName, partitionKey));
          }
        }
      }
      await this.deps.adapter.delete(tenant, this.deps.options.markerKey);
    }

    if (this.deps.tenantContext.activeTenant?.id === tenantId) {
      this.deps.tenantContext.clear();
    }
    log.tenant('%s tenant %s', opts?.purge ? 'deleted' : 'removed', tenantId);
  }

  // ─── Hot ops ─────────────────────────────────────────────

  // Security note: `credential` is a JS string and cannot be zeroed after use.
  // It remains in memory until GC reclaims it. This is a fundamental language
  // limitation. Keeping it as a function parameter minimizes its lifetime.
  async open(tenantId: string, opts?: { credential?: string }): Promise<void> {
    await this.close();

    const tenant = this.tenantList.find(tenantId);
    if (!tenant) {
      throw new TenantError(`Tenant not found: ${tenantId}`, { kind: 'tenant-not-found' });
    }

    let keys: EncryptionKeys = null;

    // Encryption setup
    if (tenant.encrypted) {
      if (!opts?.credential) {
        throw new TenantError('Credential required for encrypted tenant', { kind: 'credential-required' });
      }
      try {
        // Ensure the marker blob is available locally (pull from cloud if needed)
        // so that deriveKeys has the encryption envelope to work with.
        let rawBytes = await this.deps.rawAdapter.read(tenant, this.deps.options.markerKey);
        if (!rawBytes && this.deps.rawCloudAdapter) {
          const cloudBytes = await this.deps.rawCloudAdapter.read(tenant, this.deps.options.markerKey);
          if (cloudBytes) {
            await this.deps.rawAdapter.write(tenant, this.deps.options.markerKey, cloudBytes);
            rawBytes = cloudBytes;
          }
        }
        keys = await this.deps.encryptionService.deriveKeys(opts.credential, this.deps.appId, rawBytes);
        this.deps.tenantContext.set(tenant, keys);
        const marker = await readMarkerBlob(this.deps.adapter, tenant, this.deps.options);
        if (marker?.keyData) {
          keys = await this.deps.encryptionService.loadKeyData(keys, marker.keyData);
        }
        this.deps.tenantContext.set(tenant, keys);
      } catch (err) {
        this.deps.tenantContext.clear();
        throw err;
      }
    } else {
      this.deps.tenantContext.set(tenant, keys);
    }

    // Lazy hydration: skip eager cloud→local and local→memory syncs.
    // Partitions load on demand via SyncEngine.ensurePartition when
    // repositories access data. Periodic syncs filter by loaded partitions.
    const hasCloud = !!this.deps.cloudAdapter;

    // Start scheduler
    this.deps.syncEngine.startScheduler(tenant, hasCloud, this.deps.dirtyTracker);

    log.tenant('tenant %s opened', tenant.id);
  }

  async close(): Promise<void> {
    this.deps.syncEngine.stopScheduler();

    const tenant = this.deps.tenantContext.activeTenant;
    if (tenant) {
      await this.deps.syncEngine.run(tenant, [['memory', 'local']]);
      if (this.deps.cloudAdapter) {
        try {
          await this.deps.syncEngine.run(tenant, [['local', 'cloud']]);
        } catch {
          log.tenant.warn('cloud unreachable — changes saved locally only');
        }
      }
    }
    await this.deps.syncEngine.drain();

    this.deps.store.clear();
    this.deps.dirtyTracker.clear();
    this.deps.tenantContext.clear();

    log.tenant('tenant closed');
  }

  async sync(): Promise<SyncResult> {
    const tenant = this.deps.tenantContext.activeTenant;
    if (!tenant) throw new TenantError('No tenant loaded', { kind: 'no-tenant-loaded' });
    if (!this.deps.cloudAdapter) throw new SyncError('No cloud adapter configured', { kind: 'cloud-not-configured' });

    return this.deps.syncEngine.runCloudCycle(tenant, this.deps.dirtyTracker);
  }

  // Security note: credential strings cannot be zeroed in JS — see open() comment.
  async changeCredential(oldCredential: string, newCredential: string): Promise<void> {
    const tenant = this.deps.tenantContext.activeTenant;
    if (!tenant) throw new TenantError('No tenant loaded', { kind: 'no-tenant-loaded' });
    if (!tenant.encrypted) throw new TenantError('Current tenant is not encrypted', { kind: 'not-encrypted' });

    // Verify old credential by deriving keys and reading marker
    const rawBytes = await this.deps.rawAdapter.read(tenant, this.deps.options.markerKey);
    let keys = await this.deps.encryptionService.deriveKeys(oldCredential, this.deps.appId, rawBytes);
    this.deps.tenantContext.set(tenant, keys);
    const marker = await readMarkerBlob(this.deps.adapter, tenant, this.deps.options);
    if (!marker) throw new TenantError('Failed to read marker blob', { kind: 'workspace-not-found' });
    if (marker.keyData) {
      keys = await this.deps.encryptionService.loadKeyData(keys, marker.keyData);
      this.deps.tenantContext.set(tenant, keys);
    }

    // Snapshot verified old keys so restore is infallible
    const verifiedOldKeys = keys;

    // Rekey with new credential
    const result = await this.deps.encryptionService.rekey(
      keys, newCredential, this.deps.appId,
    );
    this.deps.tenantContext.set(tenant, result.keys);

    try {
      await writeMarkerBlob(
        this.deps.adapter, tenant, marker.entityTypes, this.deps.options, result.keyData,
      );
      if (this.deps.cloudAdapter) {
        await writeMarkerBlob(
          this.deps.cloudAdapter, tenant, marker.entityTypes, this.deps.options, result.keyData,
        );
      }
    } catch (err) {
      // Marker write failed — restore old keys (infallible, no I/O)
      this.deps.tenantContext.set(tenant, verifiedOldKeys);
      throw err;
    }

    log.tenant('encryption credential changed');
  }
}
