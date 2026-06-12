# Encryption

## Overview

fyre-db supports per-tenant encryption. Each tenant can independently opt in to encryption at creation time. When enabled, all entity data is encrypted at rest using AES-256-GCM with keys derived from a user-provided credential.

## Setup

fyre-db defines the `EncryptionService` interface but does not ship concrete implementations. Install `fyre-db/plugins` for the built-in PBKDF2 + AES-GCM implementation:

```bash
npm install @fyre-db/plugins
```

```typescript
import { FyreDb, defineEntity } from '@fyre-db/core';
import { Pbkdf2EncryptionService, AesGcmEncryptionStrategy } from '@fyre-db/plugins';

const encryptionService = new Pbkdf2EncryptionService({
  targets: ['cloud'],  // encrypt cloud storage only (or ['local', 'cloud'] for both)
  strategy: new AesGcmEncryptionStrategy(),
});

const fyredb = new FyreDb({
  appId: 'my-app',
  entities: [taskDef],
  localAdapter: storage,
  deviceId: 'device-1',
  encryptionService,
});
```

## Creating an Encrypted Tenant

```typescript
const tenant = await fyredb.tenants.create({
  name: 'Secure Workspace',
  meta: { folderId: 'secure-folder', space: 'drive' },
  encryption: { credential: 'user-secret' },
});
```

This generates a random Data Encryption Key (DEK) and stores it encrypted inside the `__fyredb` marker blob. All data blobs for this tenant are encrypted with the DEK.

## Opening an Encrypted Tenant

```typescript
await fyredb.tenants.open(tenant.id, { credential: 'user-secret' });
```

The credential is required every time an encrypted tenant is opened. The framework:
1. Reads the raw marker blob bytes
2. Derives the KEK from the credential via PBKDF2
3. Decrypts the marker blob to extract the DEK
4. Sets both keys in the tenant context for subsequent I/O

## Error Handling

```typescript
try {
  await fyredb.tenants.open(tenantId, { credential: 'wrong-password' });
} catch (err) {
  if (err instanceof InvalidEncryptionKeyError) {
    // Wrong credential — prompt user to retry
  }
}
```

| Scenario | Behavior |
|---|---|
| Encrypted tenant, no credential | Throws `Error('Credential required for encrypted tenant')` |
| Encrypted tenant, wrong credential | Throws `InvalidEncryptionKeyError` |
| Unencrypted tenant, no credential | Loads normally |

Import `InvalidEncryptionKeyError` from `fyre-db/core`.

## Changing Credentials

```typescript
await fyredb.tenants.changeCredential('old-password', 'new-password');
```

This re-derives the KEK with the new credential and re-encrypts the marker blob. The DEK (which encrypts all data blobs) is unchanged — no data re-encryption needed.

Requires an active encrypted tenant. The old credential is verified before the change is applied.

## Mixed Tenants

Encrypted and unencrypted tenants coexist on the same fyre-db instance:

```typescript
const secureTenant = await fyredb.tenants.create({
  name: 'Secure',
  meta: {},
  encryption: { credential: 'secret' },
});

const plainTenant = await fyredb.tenants.create({
  name: 'Public',
  meta: {},
});

await fyredb.tenants.open(secureTenant.id, { credential: 'secret' });
// ... encrypted data operations ...

await fyredb.tenants.open(plainTenant.id);
// ... unencrypted data operations ...
```

## How It Works

### Key Hierarchy

```
credential + appId → PBKDF2 (600K iterations, SHA-256) → KEK (AES-256-GCM)
                                                              │
                                              Encrypts/decrypts __fyredb marker blob
                                              Marker blob contains DEK (base64)
                                                              │
                                              DEK encrypts all entity partition blobs
```

### What's Encrypted

| Blob | Encrypted? | Key used |
|---|---|---|
| `__tenants` (tenant list) | Never — always plaintext | — |
| `__fyredb` (marker blob) | Yes (encrypted tenants) | KEK |
| Entity blobs (`task._`, etc.) | Yes (encrypted tenants) | DEK |

### Encrypted Data Format

```
[version: 1 byte] [IV: 12 bytes] [AES-GCM ciphertext + auth tag]
```

The marker blob additionally prefixes the salt:

```
[salt: 16 bytes] [version: 1 byte] [IV: 12 bytes] [AES-GCM ciphertext + auth tag]
```

### Security Notes

- **Credential lifetime:** JavaScript strings are immutable and cannot be zeroed. Credentials persist in memory until garbage collected. This is a fundamental JS limitation. Keep credential references short-lived.
- **PBKDF2 iterations:** 600,000 (meets 2023 OWASP recommendations).
- **Salt:** 16 random bytes, generated at tenant creation, stored as the first bytes of the encrypted marker blob.
- **Error masking:** All decryption errors are reported as `InvalidEncryptionKeyError` to prevent error oracle attacks.
