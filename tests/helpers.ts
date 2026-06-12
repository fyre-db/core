import { resolveOptions } from '@/options';
import type { ResolvedStrataOptions } from '@/options';
import { MemoryStorageAdapter, NOOP_ENCRYPTION_SERVICE, InvalidEncryptionKeyError } from '@/adapter';
import type { StorageAdapter, EncryptionService, EncryptionStrategy, EncryptionKeys } from '@/adapter';
import { EncryptedDataAdapter } from '@/persistence';
import type { DataAdapter } from '@/persistence';
import { TenantContext } from '@/tenant';
import { toBase64, fromBase64 } from '@/utils';

// ── Inline crypto helpers (moved from @/utils to @fyre-db/plugins) ──

const IV_LENGTH = 12;
const ENCRYPTION_VERSION = 1;
const PBKDF2_ITERATIONS = 600_000;

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

async function pbkdf2DeriveKeyWithSalt(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await globalThis.crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

async function aesGcmGenerateKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function exportCryptoKey(key: CryptoKey): Promise<string> {
  const raw = await globalThis.crypto.subtle.exportKey('raw', key);
  return toBase64(new Uint8Array(raw));
}

async function importAesGcmKey(base64: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey('raw', fromBase64(base64), { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function aesGcmEncrypt(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(data));
  const result = new Uint8Array(1 + IV_LENGTH + ciphertext.byteLength);
  result[0] = ENCRYPTION_VERSION;
  result.set(iv, 1);
  result.set(new Uint8Array(ciphertext), 1 + IV_LENGTH);
  return result;
}

async function aesGcmDecrypt(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = data.slice(1, 1 + IV_LENGTH);
  const ciphertext = data.slice(1 + IV_LENGTH);
  const plaintext = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(ciphertext));
  return new Uint8Array(plaintext);
}

export const DEFAULT_OPTIONS: ResolvedStrataOptions = resolveOptions();

const sharedContext = new TenantContext();

export function createDataAdapter(): DataAdapter {
  return new EncryptedDataAdapter(new MemoryStorageAdapter(), NOOP_ENCRYPTION_SERVICE, sharedContext);
}

export function wrapAdapter(adapter: StorageAdapter): DataAdapter {
  return new EncryptedDataAdapter(adapter, NOOP_ENCRYPTION_SERVICE, sharedContext);
}

// ── Test encryption helpers (mirrors Pbkdf2EncryptionService + AesGcmEncryptionStrategy) ──

const SALT_LENGTH = 16;

type Pbkdf2Keys = {
  readonly kek: CryptoKey;
  readonly dek: CryptoKey | null;
  readonly salt: Uint8Array;
};

class TestAesGcmStrategy implements EncryptionStrategy<CryptoKey> {
  async encrypt(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
    return aesGcmEncrypt(data, key);
  }
  async decrypt(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
    try { return await aesGcmDecrypt(data, key); }
    catch { throw new InvalidEncryptionKeyError(); }
  }
}

export function createTestEncryptionService(): EncryptionService {
  const strategy = new TestAesGcmStrategy();
  const tenantKey = '__tenants';
  const markerKey = '__strata';

  function castKeys(keys: EncryptionKeys | null): Pbkdf2Keys | null {
    if (keys === null) return null;
    if (typeof keys !== 'object' || !('kek' in (keys as Record<string, unknown>))) {
      throw new Error('Invalid encryption keys');
    }
    return keys as Pbkdf2Keys;
  }

  return {
    targets: ['local'] as const,

    async encrypt(blobKey: string, data: Uint8Array, keys: EncryptionKeys | null): Promise<Uint8Array> {
      if (blobKey === tenantKey) return data;
      const k = castKeys(keys);
      if (!k) return data;
      if (blobKey === markerKey) {
        const ct = await strategy.encrypt(data, k.kek);
        const result = new Uint8Array(SALT_LENGTH + ct.length);
        result.set(k.salt, 0);
        result.set(ct, SALT_LENGTH);
        return result;
      }
      if (!k.dek) throw new Error('DEK not loaded');
      return strategy.encrypt(data, k.dek);
    },

    async decrypt(blobKey: string, data: Uint8Array, keys: EncryptionKeys | null): Promise<Uint8Array> {
      if (blobKey === tenantKey) return data;
      const k = castKeys(keys);
      if (!k) return data;
      if (blobKey === markerKey) return strategy.decrypt(data.slice(SALT_LENGTH), k.kek);
      if (!k.dek) throw new Error('DEK not loaded');
      return strategy.decrypt(data, k.dek);
    },

    async deriveKeys(credential: string, appId: string, rawMarkerBytes?: Uint8Array | null): Promise<EncryptionKeys> {
      const enc = new TextEncoder();
      let salt: Uint8Array;
      if (rawMarkerBytes && rawMarkerBytes.length >= SALT_LENGTH) {
        salt = rawMarkerBytes.slice(0, SALT_LENGTH);
      } else {
        salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
      }
      const appIdBytes = enc.encode(appId);
      const fullSalt = new Uint8Array(salt.length + appIdBytes.length);
      fullSalt.set(salt, 0);
      fullSalt.set(appIdBytes, salt.length);
      const kek = await pbkdf2DeriveKeyWithSalt(credential, fullSalt);
      return { kek, dek: null, salt } satisfies Pbkdf2Keys;
    },

    async generateKeyData(keys: EncryptionKeys): Promise<{ keys: EncryptionKeys; keyData: Record<string, unknown> }> {
      const k = keys as Pbkdf2Keys;
      const dek = await aesGcmGenerateKey();
      const dekBase64 = await exportCryptoKey(dek);
      return { keys: { kek: k.kek, dek, salt: k.salt } satisfies Pbkdf2Keys, keyData: { dek: dekBase64 } };
    },

    async loadKeyData(keys: EncryptionKeys, data: Record<string, unknown>): Promise<EncryptionKeys> {
      const k = keys as Pbkdf2Keys;
      const dek = await importAesGcmKey(data.dek as string);
      return { kek: k.kek, dek, salt: k.salt } satisfies Pbkdf2Keys;
    },

    async rekey(keys: EncryptionKeys, credential: string, appId: string): Promise<{ keys: EncryptionKeys; keyData: Record<string, unknown> }> {
      const k = keys as Pbkdf2Keys;
      if (!k.dek) throw new Error('No DEK loaded');
      const enc = new TextEncoder();
      const newSalt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
      const appIdBytes = enc.encode(appId);
      const fullSalt = new Uint8Array(newSalt.length + appIdBytes.length);
      fullSalt.set(newSalt, 0);
      fullSalt.set(appIdBytes, newSalt.length);
      const newKek = await pbkdf2DeriveKeyWithSalt(credential, fullSalt);
      const dekBase64 = await exportCryptoKey(k.dek);
      return { keys: { kek: newKek, dek: k.dek, salt: newSalt } satisfies Pbkdf2Keys, keyData: { dek: dekBase64 } };
    },
  };
}



