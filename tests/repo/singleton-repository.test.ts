import { describe, it, expect } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { Store } from '@/store';
import { DEFAULT_OPTIONS } from '../helpers';
import { EventBus } from '@/reactive';
import type { EntityEvent } from '@/reactive';
import { defineEntity } from '@/schema';
import { SingletonRepository } from '@/repo';
import type { Hlc } from '@/hlc';

type Settings = { theme: string; language: string };

function makeHlcRef(): { current: Hlc } {
  return { current: { timestamp: 0, counter: 0, nodeId: 'test-device' } };
}

const SettingsDef = defineEntity<Settings>('settings', { keyStrategy: 'singleton' });

describe('SingletonRepository', () => {
  describe('get', () => {
    it('returns undefined when no entity saved', () => {
      const store = new Store(DEFAULT_OPTIONS);
      const repo = new SingletonRepository(SettingsDef, store, makeHlcRef(), new EventBus<EntityEvent>());
      expect(repo.get()).toBeUndefined();
    });

    it('returns saved entity', () => {
      const store = new Store(DEFAULT_OPTIONS);
      const repo = new SingletonRepository(SettingsDef, store, makeHlcRef(), new EventBus<EntityEvent>());
      repo.save({ theme: 'dark', language: 'en' });
      const entity = repo.get();
      expect(entity).toBeDefined();
      expect(entity!.theme).toBe('dark');
      expect(entity!.language).toBe('en');
    });
  });

  describe('save', () => {
    it('stamps BaseEntity fields', () => {
      const store = new Store(DEFAULT_OPTIONS);
      const repo = new SingletonRepository(SettingsDef, store, makeHlcRef(), new EventBus<EntityEvent>());
      repo.save({ theme: 'dark', language: 'en' });
      const entity = repo.get();
      expect(entity!.id).toBe('settings._.settings');
      expect(entity!.version).toBe(1);
      expect(entity!.createdAt).toBeInstanceOf(Date);
      expect(entity!.updatedAt).toBeInstanceOf(Date);
    });

    it('increments version on subsequent saves', () => {
      const store = new Store(DEFAULT_OPTIONS);
      const repo = new SingletonRepository(SettingsDef, store, makeHlcRef(), new EventBus<EntityEvent>());
      repo.save({ theme: 'dark', language: 'en' });
      repo.save({ theme: 'light', language: 'en' });
      const entity = repo.get();
      expect(entity!.version).toBe(2);
      expect(entity!.theme).toBe('light');
    });

    it('uses deterministic ID (entityName._.entityName)', () => {
      const store = new Store(DEFAULT_OPTIONS);
      const repo = new SingletonRepository(SettingsDef, store, makeHlcRef(), new EventBus<EntityEvent>());
      repo.save({ theme: 'dark', language: 'en' });
      const entity = repo.get();
      expect(entity!.id).toBe('settings._.settings');
    });
  });

  describe('delete', () => {
    it('returns false when nothing to delete', () => {
      const store = new Store(DEFAULT_OPTIONS);
      const repo = new SingletonRepository(SettingsDef, store, makeHlcRef(), new EventBus<EntityEvent>());
      expect(repo.delete()).toBe(false);
    });

    it('returns true and removes entity', () => {
      const store = new Store(DEFAULT_OPTIONS);
      const repo = new SingletonRepository(SettingsDef, store, makeHlcRef(), new EventBus<EntityEvent>());
      repo.save({ theme: 'dark', language: 'en' });
      expect(repo.delete()).toBe(true);
      expect(repo.get()).toBeUndefined();
    });
  });

  describe('observe', () => {
    it('emits current value on subscribe', async () => {
      const store = new Store(DEFAULT_OPTIONS);
      const bus = new EventBus<EntityEvent>();
      const repo = new SingletonRepository(SettingsDef, store, makeHlcRef(), bus);
      repo.save({ theme: 'dark', language: 'en' });

      const value = await firstValueFrom(repo.observe());
      expect(value).toBeDefined();
      expect(value!.theme).toBe('dark');
    });

    it('emits undefined when no entity saved', async () => {
      const store = new Store(DEFAULT_OPTIONS);
      const bus = new EventBus<EntityEvent>();
      const repo = new SingletonRepository(SettingsDef, store, makeHlcRef(), bus);

      const value = await firstValueFrom(repo.observe());
      expect(value).toBeUndefined();
    });

    it('emits updated value on save', async () => {
      const store = new Store(DEFAULT_OPTIONS);
      const bus = new EventBus<EntityEvent>();
      const repo = new SingletonRepository(SettingsDef, store, makeHlcRef(), bus);

      const values: unknown[] = [];
      const sub = repo.observe().subscribe(v => values.push(v));

      repo.save({ theme: 'dark', language: 'en' });
      repo.save({ theme: 'light', language: 'fr' });

      sub.unsubscribe();

      expect(values.length).toBeGreaterThanOrEqual(3);
      expect(values[0]).toBeUndefined();
      const last = values[values.length - 1] as Settings;
      expect(last.theme).toBe('light');
    });
  });
});
