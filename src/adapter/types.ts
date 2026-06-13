import type { Tenant } from '@/tenant';

export type { Tenant } from '@/tenant';

export type StorageAdapter = {
  read(tenant: Tenant | undefined, key: string): Promise<Uint8Array | null>;
  write(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<void>;
  delete(tenant: Tenant | undefined, key: string): Promise<boolean>;
  deriveTenantId?(meta: Record<string, unknown>): string;
};

 
export type EncryptionStrategy<TKey = string> = {
  encrypt(data: Uint8Array, key: TKey): Promise<Uint8Array>;
  decrypt(data: Uint8Array, key: TKey): Promise<Uint8Array>;
};

export type EncryptionKeys = unknown;

export type EncryptionService = {
  readonly targets: ReadonlyArray<'local' | 'cloud'>;
  encrypt(blobKey: string, data: Uint8Array, keys: EncryptionKeys): Promise<Uint8Array>;
  decrypt(blobKey: string, data: Uint8Array, keys: EncryptionKeys): Promise<Uint8Array>;
  deriveKeys(credential: string, appId: string, rawMarkerBytes?: Uint8Array | null): Promise<EncryptionKeys>;
  generateKeyData(keys: EncryptionKeys): Promise<{ keys: EncryptionKeys; keyData?: Record<string, unknown> }>;
  loadKeyData(keys: EncryptionKeys, data: Record<string, unknown>): Promise<EncryptionKeys>;
  rekey(keys: EncryptionKeys, credential: string, appId: string): Promise<{ keys: EncryptionKeys; keyData?: Record<string, unknown> }>;
};

export const NOOP_ENCRYPTION_SERVICE: EncryptionService = {
  targets: [],
  encrypt: (_blobKey, data) => Promise.resolve(data),
  decrypt: (_blobKey, data) => Promise.resolve(data),
  deriveKeys: (_credential, _appId, _rawMarkerBytes?) => Promise.resolve(null),
  generateKeyData: (keys) => Promise.resolve({ keys }),
  loadKeyData: (keys) => Promise.resolve(keys),
  rekey: (keys) => Promise.resolve({ keys }),
};

import { FyreDbError } from '@/errors';

export class InvalidEncryptionKeyError extends FyreDbError {
  constructor(message = 'Invalid encryption key') {
    super(message, { kind: 'invalid-key', retryable: false });
    this.name = 'InvalidEncryptionKeyError';
  }
}

