import { useSyncExternalStore } from 'react';

/**
 * Session-only state of the operations panel: which finished rows the user hid. Kept in memory on purpose (a reload brings everything back): hiding a row is
 * a convenience, never a decision the server or storage should remember.
 */
let dismissed: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => void listeners.delete(listener);
};

export function dismissOperation(operationId: string): void {
  if (dismissed.has(operationId)) {
    return;
  }

  dismissed = new Set([...dismissed, operationId]);
  emit();
}

/** Test helper: a new browser session. */
export function resetOperationsSession(): void {
  dismissed = new Set();
  emit();
}

export function useDismissedOperations(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribe,
    () => dismissed,
    () => dismissed,
  );
}
