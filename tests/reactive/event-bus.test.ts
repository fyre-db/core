import { describe, it, expect } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { take, toArray, filter } from 'rxjs/operators';
import { EventBus } from '@/reactive';
import type { EntityEvent } from '@/reactive';

function makeEvent(entityName: string) {
  return { entityName, source: 'user' as const, updates: [] as string[], deletes: [] as string[] };
}

describe('EventBus', () => {
  it('emit delivers events via all$', async () => {
    const bus = new EventBus<EntityEvent>();
    const promise = firstValueFrom(bus.all$);
    bus.emit(makeEvent('transaction'));
    const event = await promise;
    expect(event).toEqual(makeEvent('transaction'));
  });

  it('all$ can be filtered by entity name', async () => {
    const bus = new EventBus<EntityEvent>();
    const promise = firstValueFrom(bus.all$.pipe(filter(e => e.entityName === 'task')));
    bus.emit(makeEvent('transaction'));
    bus.emit(makeEvent('task'));
    const event = await promise;
    expect(event.entityName).toBe('task');
  });

  it('all$ receives events for all entities', async () => {
    const bus = new EventBus<EntityEvent>();
    const promise = firstValueFrom(bus.all$.pipe(take(2), toArray()));
    bus.emit(makeEvent('a'));
    bus.emit(makeEvent('b'));
    const events = await promise;
    expect(events).toHaveLength(2);
    expect(events[0].entityName).toBe('a');
    expect(events[1].entityName).toBe('b');
  });

  it('emit with no subscribers is safe', () => {
    const bus = new EventBus<EntityEvent>();
    expect(() => bus.emit(makeEvent('transaction'))).not.toThrow();
  });

  it('dispose completes all streams', async () => {
    const bus = new EventBus<EntityEvent>();
    let completed = false;
    bus.all$.subscribe({ complete: () => { completed = true; } });
    bus.dispose();
    expect(completed).toBe(true);
  });

  it('event carries updates and deletes', async () => {
    const bus = new EventBus<EntityEvent>();
    const promise = firstValueFrom(bus.all$);
    bus.emit({ entityName: 'task', source: 'user', updates: ['id1', 'id2'], deletes: [] });
    const event = await promise;
    expect(event.updates).toEqual(['id1', 'id2']);
    expect(event.deletes).toEqual([]);
  });

  it('event carries source field', async () => {
    const bus = new EventBus<EntityEvent>();
    const promise = firstValueFrom(bus.all$);
    bus.emit({ entityName: 'task', source: 'sync', updates: [], deletes: ['id1'] });
    const event = await promise;
    expect(event.source).toBe('sync');
    expect(event.deletes).toEqual(['id1']);
  });
});
