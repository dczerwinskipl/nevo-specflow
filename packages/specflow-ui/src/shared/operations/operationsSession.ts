import { useCallback, useSyncExternalStore } from 'react';

/**
 * Session-only state of the operations panel: which finished rows the user hid and whether the
 * panel is collapsed. Kept in memory on purpose (a reload brings everything back): hiding a row is
 * a convenience, never a decision the server or storage should remember.
 */
let dismissed: ReadonlySet<string> = new Set();
let collapsed = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export function dismissOperation(operationId: string): void {
  if (dismissed.has(operationId)) return;
  dismissed = new Set([...dismissed, operationId]);
  emit();
}

export function setOperationsCollapsed(value: boolean): void {
  if (collapsed === value) return;
  collapsed = value;
  emit();
}

/** Test helper: a new browser session. */
export function resetOperationsSession(): void {
  dismissed = new Set();
  collapsed = false;
  emit();
}

export function useDismissedOperations(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribe,
    () => dismissed,
    () => dismissed,
  );
}

export function useOperationsCollapsed(): readonly [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => collapsed,
    () => collapsed,
  );
  return [value, useCallback((next: boolean) => setOperationsCollapsed(next), [])];
}
