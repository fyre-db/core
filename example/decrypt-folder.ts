#!/usr/bin/env npx tsx
/**
 * Decrypts all encrypted tenant data in place.
 *
 * Usage:
 *   npx tsx decrypt-folder.ts <folder-path> <password> [--app-id <appId>]
 *
 * Example:
 *   npx tsx decrypt-folder.ts .tmp/app-encrypted secret123 --app-id demo
 */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  pbkdf2DeriveKeyWithSalt,
  importAesGcmKey,
  aesGcmDecrypt,
} from '@fyre-db/core';

// ─── Args ────────────────────────────────────────────────

const args = process.argv.slice(2);
const folderPath = args[0];
const credential = args[1];
const appIdFlagIdx = args.indexOf('--app-id');
const appId = appIdFlagIdx !== -1 ? args[appIdFlagIdx + 1] : 'demo';

if (!folderPath || !credential) {
  console.error('Usage: npx tsx decrypt-folder.ts <folder-path> <credential> [--app-id <appId>]');
  process.exit(1);
}

const rootDir = path.resolve(folderPath);

// ─── Helpers ─────────────────────────────────────────────

async function tryDecryptFile(filePath: string, key: CryptoKey): Promise<boolean> {
  const data = await readFile(filePath);
  const bytes = new Uint8Array(data);

  // Check if encrypted: version byte = 1 and has enough bytes for IV + ciphertext
  if (bytes.length < 14 || bytes[0] !== 1) {
    return false; // not encrypted
  }

  try {
    const decrypted = await aesGcmDecrypt(bytes, key);
    await writeFile(filePath, decrypted);
    return true;
  } catch {
    return false; // not encrypted or wrong key
  }
}

// ─── Main ────────────────────────────────────────────────

async function main() {
  console.log(`Decrypting: ${rootDir}`);
  console.log(`App ID: ${appId}\n`);

  const textEncoder = new TextEncoder();
  const SALT_LENGTH = 16;

  // 2. Find all subdirectories containing a __fyredb marker
  const rootEntries = await readdir(rootDir, { withFileTypes: true });
  const tenantDirs: { name: string; dir: string }[] = [];

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) continue;
    const markerPath = path.join(rootDir, entry.name, '__fyredb');
    try {
      const s = await stat(markerPath);
      if (s.isFile()) {
        tenantDirs.push({ name: entry.name, dir: path.join(rootDir, entry.name) });
      }
    } catch {
      // no __fyredb, skip
    }
  }

  if (tenantDirs.length === 0) {
    console.log('No tenant directories with __fyredb found.');
    return;
  }

  console.log(`Found ${tenantDirs.length} tenant dir(s): ${tenantDirs.map(t => t.name).join(', ')}\n`);

  // 3. Process each tenant directory
  for (const { name: tenantId, dir: tenantDir } of tenantDirs) {
    console.log(`── Tenant: ${tenantId} ──`);

    // 3a. aesGcmDecrypt marker blob with KEK to get DEK
    const markerPath = path.join(tenantDir, '__fyredb');
    let dek: CryptoKey;
    try {
      const markerBytes = new Uint8Array(await readFile(markerPath));

      // Skip if marker is not encrypted (starts with '{' = plain JSON)
      // Encrypted markers: [16-byte salt][version=1][IV][ciphertext]
      if (markerBytes.length < SALT_LENGTH + 14 || markerBytes[SALT_LENGTH] !== 1) {
        console.log('  · not encrypted, skipping');
        continue;
      }

      // Extract salt prefix and derive KEK for this tenant
      const salt = markerBytes.slice(0, SALT_LENGTH);
      const appIdBytes = textEncoder.encode(appId);
      const fullSalt = new Uint8Array(SALT_LENGTH + appIdBytes.length);
      fullSalt.set(salt, 0);
      fullSalt.set(appIdBytes, SALT_LENGTH);
      const kek = await pbkdf2DeriveKeyWithSalt(credential, fullSalt);
      console.log('  KEK derived from salt + credential');

      const ciphertext = markerBytes.slice(SALT_LENGTH);
      const decryptedMarker = await aesGcmDecrypt(ciphertext, kek);
      await writeFile(markerPath, decryptedMarker);
      console.log('  ✓ __fyredb decrypted');

      const markerJson = JSON.parse(new TextDecoder().decode(decryptedMarker)) as Record<string, unknown>;
      const system = markerJson['__system'] as Record<string, unknown>;
      const marker = system['marker'] as Record<string, unknown>;
      const keyData = marker['keyData'] as Record<string, unknown> | undefined;

      if (!keyData?.dek) {
        console.log('  ⚠ No keyData.dek in marker — skipping data files');
        continue;
      }

      dek = await importAesGcmKey(keyData.dek);
    } catch (err) {
      console.error(`  ✗ Failed to aesGcmDecrypt marker: ${(err as Error).message}`);
      console.error('    Check your credential and app ID');
      continue;
    }

    // 3b. aesGcmDecrypt all other files with DEK
    const entries = await readdir(tenantDir);
    for (const entry of entries) {
      if (entry === '__fyredb') continue; // already decrypted

      const filePath = path.join(tenantDir, entry);
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) continue;

      const decrypted = await tryDecryptFile(filePath, dek);
      if (decrypted) {
        console.log(`  ✓ ${entry} decrypted`);
      } else {
        console.log(`  · ${entry} (not encrypted)`);
      }
    }

    console.log();
  }

  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

