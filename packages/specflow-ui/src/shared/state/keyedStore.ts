import { useCallback, useSyncExternalStore } from 'react';

/**
 * A tiny external store of immutable values by key. Subscribers listen to ONE key, so writing one
 * entry never notifies (or re-renders) readers of another. It is deliberately not a global store:
 * every owning feature creates its own instance in its own provider and passes it by context.
 */
export interface KeyedStore<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  /** Computes the next value from the current one; returning `undefined` removes the entry. */
  update(key: string, next: (current: V | undefined) => V | undefined): void;
  remove(key: string): void;
  subscribe(key: string, listener: () => void): () => void;
}

export function createKeyedStore<V>(): KeyedStore<V> {
  const values = new Map<string, V>();
  const listeners = new Map<string, Set<() => void>>();
  const notify = (key: string) => listeners.get(key)?.forEach((listener) => listener());
  const write = (key: string, value: V | undefined) => {
    const current = values.get(key);
    if (Object.is(current, value)) return;
    if (value === undefined) values.delete(key);
    else values.set(key, value);
    notify(key);
  };
  return {
    get: (key) => values.get(key),
    set: (key, value) => write(key, value),
    update: (key, next) => write(key, next(values.get(key))),
    remove: (key) => write(key, undefined),
    subscribe: (key, listener) => {
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(listener);
      return () => {
        set.delete(listener);
        if (!set.size) listeners.delete(key);
      };
    },
  };
}

/** Subscribes to one entry; re-renders only when that entry changes. */
export function useKeyedStoreValue<V>(store: KeyedStore<V>, key: string): V | undefined {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(key, listener),
    [store, key],
  );
  const read = useCallback(() => store.get(key), [store, key]);
  return useSyncExternalStore(subscribe, read, read);
}
