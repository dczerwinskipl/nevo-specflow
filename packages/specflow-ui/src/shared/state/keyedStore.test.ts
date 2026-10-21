import { describe, expect, it, vi } from 'vitest';
import { createKeyedStore } from './keyedStore';

describe('keyed store', () => {
  it('notifies only the subscribers of the written key', () => {
    const store = createKeyedStore<number>();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe('a', a);
    store.subscribe('b', b);
    store.set('a', 1);
    store.update('a', (current) => (current ?? 0) + 1);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).not.toHaveBeenCalled();
    expect(store.get('a')).toBe(2);
  });
  it('does not notify for an identical value and removes on undefined', () => {
    const store = createKeyedStore<{ n: number }>();
    const listener = vi.fn();
    const value = { n: 1 };
    store.set('a', value);
    store.subscribe('a', listener);
    store.set('a', value);
    store.update('a', (current) => current);
    expect(listener).not.toHaveBeenCalled();
    store.remove('a');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get('a')).toBeUndefined();
  });
  it('stops notifying after unsubscribe', () => {
    const store = createKeyedStore<number>();
    const listener = vi.fn();
    const off = store.subscribe('a', listener);
    off();
    store.set('a', 1);
    expect(listener).not.toHaveBeenCalled();
  });
});
