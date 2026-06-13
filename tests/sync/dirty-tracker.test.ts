import { describe, it, expect } from 'vitest';
import { ReactiveFlag } from '@/utils';

describe('ReactiveFlag', () => {
  it('starts with initial value false', () => {
    const tracker = new ReactiveFlag();
    expect(tracker.value).toBe(false);
  });

  it('set() sets value to true', () => {
    const tracker = new ReactiveFlag();
    tracker.set();
    expect(tracker.value).toBe(true);
  });

  it('clear() sets value to false', () => {
    const tracker = new ReactiveFlag();
    tracker.set();
    tracker.clear();
    expect(tracker.value).toBe(false);
  });

  it('value$ emits initial false', () => {
    const tracker = new ReactiveFlag();
    const values: boolean[] = [];
    const sub = tracker.value$.subscribe(v => values.push(v));

    expect(values).toEqual([false]);
    sub.unsubscribe();
  });

  it('value$ emits on state change', () => {
    const tracker = new ReactiveFlag();
    const values: boolean[] = [];
    const sub = tracker.value$.subscribe(v => values.push(v));

    tracker.set();
    tracker.clear();

    expect(values).toEqual([false, true, false]);
    sub.unsubscribe();
  });

  it('value$ uses distinctUntilChanged — no duplicate emissions', () => {
    const tracker = new ReactiveFlag();
    const values: boolean[] = [];
    const sub = tracker.value$.subscribe(v => values.push(v));

    tracker.set();
    tracker.set();
    tracker.set();
    tracker.clear();
    tracker.clear();

    expect(values).toEqual([false, true, false]);
    sub.unsubscribe();
  });
});
