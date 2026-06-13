import { FyreDbError } from '@/errors';

export type SyncErrorKind =
  | 'cloud-not-configured'
  | 'sync-failed';

export class SyncError extends FyreDbError {
  constructor(message: string, options: {
    readonly kind: SyncErrorKind;
    readonly retryable?: boolean;
    readonly cause?: Error;
  }) {
    super(message, { kind: options.kind, retryable: options.retryable, cause: options.cause });
    this.name = 'SyncError';
  }
}
