import { useSyncExternalStore } from 'react';

/** Local (this browser) preference: whether the source editor wraps long lines. */
export const WRAP_LINES_STORAGE_KEY = 'nevo-specflow.documents.wrapLines';

/** The choice is kept per pane class: a narrow pane and a wide one are read differently. */
export type PaneClass = 'narrow' | 'wide';
export type WrapLinesPreference = Readonly<Partial<Record<PaneClass, boolean>>>;

/**
 * Wrapping is on until the reader turns it off for that pane class: a narrow pane must not scroll
 * sideways to read a line, and a wide one starts the way the editor always did.
 */
export function wrapLinesFor(preference: WrapLinesPreference, pane: PaneClass): boolean {
  return preference[pane] ?? true;
}

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: WrapLinesPreference } = { raw: null, value: {} };

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function parse(raw: string | null): WrapLinesPreference {
  if (!raw) {
    return {};
  }

  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) {
      return {};
    }

    const { narrow, wide } = value as Record<string, unknown>;

    return {
      ...(typeof narrow === 'boolean' ? { narrow } : {}),
      ...(typeof wide === 'boolean' ? { wide } : {}),
    };
  } catch {
    return {};
  }
}

// Without a usable storage the choice still applies for this page's lifetime.
let memory: WrapLinesPreference = {};
// The last write did not reach the storage (quota, privacy mode): `memory` is newer than it.
let writeFailed = false;

function read(): WrapLinesPreference {
  const store = storage();
  if (!store || writeFailed) {
    return memory;
  }

  let raw: string | null;
  try {
    raw = store.getItem(WRAP_LINES_STORAGE_KEY);
  } catch {
    return memory;
  }

  if (raw !== cache.raw) {
    cache = { raw, value: parse(raw) };
  }

  return cache.value;
}

/** Stores the choice for one pane class (in this browser; in memory when storage is blocked). */
export function setWrapLines(pane: PaneClass, wrap: boolean): void {
  const next = { ...read(), [pane]: wrap };
  memory = next;
  try {
    storage()?.setItem(WRAP_LINES_STORAGE_KEY, JSON.stringify(next));
    writeFailed = false;
  } catch {
    // Persistence is best effort; `memory` keeps the choice (and wins over the stale storage).
    writeFailed = true;
  }

  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab of the same browser changed it.
  const onStorage = (event: StorageEvent) => {
    if (event.key === WRAP_LINES_STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const empty: WrapLinesPreference = {};

/** The stored preference, re-read when it changes (in this tab or another). */
export function useWrapLinesPreference(): WrapLinesPreference {
  return useSyncExternalStore(subscribe, read, () => empty);
}
