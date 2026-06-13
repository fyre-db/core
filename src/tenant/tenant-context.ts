import { BehaviorSubject } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';
import type { Observable } from 'rxjs';
import type { Tenant } from './types';
import type { EncryptionKeys } from '@/adapter';

export type TenantSession = {
  readonly tenant: Tenant;
  readonly keys: EncryptionKeys;
};

export class TenantContext {
  private readonly session$ = new BehaviorSubject<TenantSession | null>(null);

  readonly activeTenant$: Observable<Tenant | undefined> = this.session$.pipe(
    map(s => s?.tenant),
    distinctUntilChanged(),
  );

  get activeTenant(): Tenant | undefined {
    return this.session$.getValue()?.tenant;
  }

  getKeys(): EncryptionKeys {
    return this.session$.getValue()?.keys ?? null;
  }

  set(tenant: Tenant, keys: EncryptionKeys): void {
    this.session$.next({ tenant, keys });
  }

  clear(): void {
    this.session$.next(null);
  }
}
