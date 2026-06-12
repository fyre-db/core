import {
  Strata,
  defineEntity,
} from '@fyre-db/core';
import { Pbkdf2EncryptionService, AesGcmEncryptionStrategy, InvalidEncryptionKeyError } from '@fyre-db/plugins';
import { FsStorageAdapter, tmpDirFor, cleanTmpDir, printTree } from './common';

type Note = { title: string; body: string };
const NoteDef = defineEntity<Note>('note');

async function main() {
  const tmpDir = tmpDirFor('app-encrypted');
  await cleanTmpDir(tmpDir);

  const storage = new FsStorageAdapter(tmpDir);
  const encryptionService = new Pbkdf2EncryptionService({
    targets: ['local'],
    strategy: new AesGcmEncryptionStrategy(),
  });
  const strata = new Strata({
    appId: 'demo',
    entities: [NoteDef],
    localAdapter: storage,
    encryptionService,
    deviceId: 'device-1',
  });

  // 1. Create an encrypted tenant
  const encrypted = await strata.tenants.create({
    name: 'Secure',
    meta: {},
    encryption: { credential: 'secret123' },
  });
  console.log('Created encrypted tenant:', encrypted.id);

  // 2. Create an unencrypted tenant
  const unencrypted = await strata.tenants.create({
    name: 'Public',
    meta: {},
  });
  console.log('Created unencrypted tenant:', unencrypted.id);

  // 3. Open encrypted tenant with password, save notes, query
  await strata.tenants.open(encrypted.id, { credential: 'secret123' });
  const repo = strata.repo(NoteDef);
  repo.save({ title: 'Secret Note', body: 'Eyes only' });
  repo.save({ title: 'Another Secret', body: 'Classified' });
  const secureNotes = repo.query();
  console.log('\n--- Encrypted tenant notes ---');
  for (const n of secureNotes) {
    console.log(`  [${n.title}] ${n.body}`);
  }

  // 4. Switch to unencrypted tenant (no password needed)
  await strata.tenants.open(unencrypted.id);
  const pubRepo = strata.repo(NoteDef);
  pubRepo.save({ title: 'Public Note', body: 'Visible to all' });
  const publicNotes = pubRepo.query();
  console.log('\n--- Unencrypted tenant notes ---');
  for (const n of publicNotes) {
    console.log(`  [${n.title}] ${n.body}`);
  }

  // 5. Try opening encrypted tenant WITHOUT password
  try {
    await strata.tenants.open(encrypted.id);
  } catch {
    console.log('\nPassword required');
  }

  // 6. Try opening with WRONG password
  try {
    await strata.tenants.open(encrypted.id, { credential: 'wrongpass' });
  } catch (err) {
    if (err instanceof InvalidEncryptionKeyError) {
      console.log('Wrong password');
    } else {
      throw err;
    }
  }

  await strata.dispose();

  // Show what's on disk
  console.log('\n--- Files on disk ---');
  await printTree(tmpDir);

  console.log('\nDone.');
}

main();

