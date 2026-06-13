import { describe, it, expect } from 'vitest';
import {
  createHlc,
  MemoryStorageAdapter,
  defineEntity,
  EventBus,
} from '@/index';

describe('index barrel exports', () => {
  it('exports HLC module', () => {
    expect(createHlc).toBeDefined();
  });

  it('exports adapter module', () => {
    expect(MemoryStorageAdapter).toBeDefined();
  });

  it('exports schema module', () => {
    expect(defineEntity).toBeDefined();
  });

  it('exports reactive module', () => {
    expect(EventBus).toBeDefined();
  });
});



