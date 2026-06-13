import { describe, it, expect } from 'vitest';
import { NOOP_ENCRYPTION_SERVICE } from '@/adapter';

describe('NOOP_ENCRYPTION_SERVICE', () => {
  it('deriveKeys returns null', async () => {
    const result = await NOOP_ENCRYPTION_SERVICE.deriveKeys('cred', 'app');
    expect(result).toBeNull();
  });

  it('generateKeyData returns keys unchanged', async () => {
    const result = await NOOP_ENCRYPTION_SERVICE.generateKeyData('myKey');
    expect(result).toEqual({ keys: 'myKey' });
  });

  it('loadKeyData returns keys unchanged', async () => {
    const result = await NOOP_ENCRYPTION_SERVICE.loadKeyData('myKey', { dek: 'data' });
    expect(result).toBe('myKey');
  });

  it('rekey returns keys unchanged', async () => {
    const result = await NOOP_ENCRYPTION_SERVICE.rekey('myKey', 'cred', 'app');
    expect(result).toEqual({ keys: 'myKey' });
  });
});
