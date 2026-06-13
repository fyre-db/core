import { mkdir, readFile, writeFile, unlink, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorageAdapter, Tenant } from '@fyre-db/core';

// ─── __dirname for ESM ───────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TMP_DIR = path.join(__dirname, '.tmp');

export function tmpDirFor(exampleName: string): string {
  return path.join(TMP_DIR, exampleName);
}

export async function cleanTmpDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export async function printTree(dir: string, indent = ''): Promise<void> {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    console.log(`${indent}${entry.isDirectory() ? '📁' : '📄'} ${entry.name}`);
    if (entry.isDirectory()) {
      await printTree(path.join(dir, entry.name), indent + '  ');
    }
  }
}

export class FsStorageAdapter implements StorageAdapter {

  constructor(private readonly rootDir: string) {}

  private resolvePath(tenant: Tenant | undefined, key: string): string {
    return tenant
      ? path.join(this.rootDir, tenant.id, key)
      : path.join(this.rootDir, key);
  }

  async read(tenant: Tenant | undefined, key: string): Promise<Uint8Array | null> {
    try {
      return await readFile(this.resolvePath(tenant, key));
    } catch {
      return null;
    }
  }

  async write(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<void> {
    const filePath = this.resolvePath(tenant, key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }

  async delete(tenant: Tenant | undefined, key: string): Promise<boolean> {
    try {
      await unlink(this.resolvePath(tenant, key));
      return true;
    } catch {
      return false;
    }
  }
}

