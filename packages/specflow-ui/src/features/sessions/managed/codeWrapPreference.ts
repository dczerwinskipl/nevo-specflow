import { useSyncExternalStore } from 'react';

const KEY = 'nevo:tool-detail:wrap-lines';
/** Below the split width a tool's code reads wrapped unless the person chose otherwise. */
const NARROW = '(max-width: 839px)';
const listeners = new Set<() => void>();

function stored(): boolean | undefined {
  try {
    const value = window.localStorage.getItem(KEY);

    return value === null ? undefined : value === 'true';
  } catch {
    return undefined;
  }
}

function narrow(): boolean {
  try {
    return window.matchMedia(NARROW).matches;
  } catch {
    return false;
  }
}

let override: boolean | undefined;
const read = () => override ?? stored() ?? narrow();

/**
 * Whether a tool detail's code blocks wrap their lines: the person's own choice, kept in this
 * browser, else on for a narrow screen. One choice for every block, so toggling one toggles all.
 */
export function useCodeWrapPreference(): readonly [boolean, (wrap: boolean) => void] {
  const wrap = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    read,
    () => false,
  );

  return [
    wrap,
    (next: boolean) => {
      override = next;
      try {
        window.localStorage.setItem(KEY, String(next));
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
export function resetCodeWrapPreference(): void {
  override = undefined;
}
