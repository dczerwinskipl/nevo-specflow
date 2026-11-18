import { useSyncExternalStore } from 'react';

/*
 * The Requires attention actions whose command is running, by a key the owning module chooses
 * (`SpecificationAttentionAction.pendingKey`). An entry is plain data built outside React, so the
 * module that runs the command marks it here and Requires attention shows that button busy until
 * the module clears it. Only the module that runs a command writes its key.
 */

let pending: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

/** Marks (or clears) a running action; Requires attention re-renders its button. */
export function setAttentionActionPending(key: string, isPending: boolean): void {
  if (pending.has(key) === isPending) {
    return;
  }

  const next = new Set(pending);
  if (isPending) {
    next.add(key);
  } else {
    next.delete(key);
  }

  pending = next;
  for (const listener of listeners) {
    listener();
  }
}

/** Whether an action's command is running now (read in a handler, outside render). */
export function isAttentionActionPending(key: string): boolean {
  return pending.has(key);
}

const snapshot = () => pending;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

/** The running actions, for rendering their buttons busy. */
export function useAttentionActionsPending(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
