import { FyreDbError } from '@/errors';

export type TenantErrorKind =
  | 'tenant-not-found'
  | 'credential-required'
  | 'workspace-not-found'
  | 'workspace-exists'
  | 'workspace-incompatible'
  | 'no-tenant-loaded'
  | 'not-encrypted';

export class TenantError extends FyreDbError {
  constructor(message: string, options: {
    readonly kind: TenantErrorKind;
    readonly cause?: Error;
  }) {
    super(message, { kind: options.kind, retryable: false, cause: options.cause });
    this.name = 'TenantError';
  }
}
