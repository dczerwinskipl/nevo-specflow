import { useSyncExternalStore } from 'react';

/*
 * Actions whose command is running, by a key the module that runs the command chooses. It lets a
 * surface that only shows an action (built as plain data outside React, for example a Requires
 * attention entry's `pendingKey`) render its button busy while another module runs the command.
 * Only the module that runs a command writes its key; it marks it when it sends the command and
 * clears it once the command settled.
 */

let pending: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

/** Marks (or clears) a running action; the surfaces showing it re-render. */
export function setActionPending(key: string, isPending: boolean): void {
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
export function isActionPending(key: string): boolean {
  return pending.has(key);
}

const snapshot = () => pending;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

/** The running actions, for rendering their buttons busy. */
export function usePendingActions(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
