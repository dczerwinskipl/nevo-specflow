import { useSyncExternalStore } from 'react';
import type { WorkHistoryView } from './workGrouping';

const KEY = 'nevo:work-history:view';
const listeners = new Set<() => void>();
let override: WorkHistoryView | undefined;

function stored(): WorkHistoryView | undefined {
  try {
    const value = window.localStorage.getItem(KEY);

    return value === 'detailed' || value === 'compact' ? value : undefined;
  } catch {
    return undefined;
  }
}

const read = (): WorkHistoryView => override ?? stored() ?? 'compact';

/**
 * How Work history shows a Turn's operations (full-session.md "Work history (L2)"): compact unless
 * the person chose the detailed view, a choice kept in this browser for every Turn.
 */
export function useWorkHistoryView(): readonly [WorkHistoryView, (view: WorkHistoryView) => void] {
  const view = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    read,
    () => 'compact' as const,
  );

  return [
    view,
    (next: WorkHistoryView) => {
      override = next;
      try {
        window.localStorage.setItem(KEY, next);
      } catch {
        // Storage may be unavailable: the choice holds for this page only.
      }

      for (const listener of listeners) {
        listener();
      }
    },
  ] as const;
}

/** Test support: forget a choice made in this page. */
export function resetWorkHistoryView(): void {
  override = undefined;
}
