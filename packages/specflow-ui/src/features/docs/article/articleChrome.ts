import { createContext, useContext, useSyncExternalStore } from 'react';

/**
 * What the header of an article and its body share, per shown article (`key`): whether the body
 * shows the contents column (then the header has no Contents button) and whether the Contents
 * sheet is open, with the control that opened it. The header and the body are separate components
 * of the workspace (header frame and content), so this small store is their common owner.
 */
export interface ArticleChromeState {
  readonly columnFor: ReadonlySet<string>;
  readonly sheetFor?: string;
}

export interface ArticleChromeStore {
  readonly get: () => ArticleChromeState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly setColumn: (key: string, shown: boolean) => void;
  readonly openSheet: (key: string, opener: HTMLElement | null) => void;
  readonly closeSheet: () => void;
  /** The control that opened the sheet, for focus return; read only when the sheet closes. */
  readonly opener: () => HTMLElement | null;
}

export function createArticleChromeStore(): ArticleChromeStore {
  let state: ArticleChromeState = { columnFor: new Set() };
  let opener: HTMLElement | null = null;
  const listeners = new Set<() => void>();
  const set = (next: ArticleChromeState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  return {
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => void listeners.delete(listener);
    },
    setColumn: (key, shown) => {
      if (state.columnFor.has(key) === shown) {
        return;
      }

      const columnFor = new Set(state.columnFor);
      if (shown) {
        columnFor.add(key);
      } else {
        columnFor.delete(key);
      }

      set({ ...state, columnFor });
    },
    openSheet: (key, control) => {
      opener = control;
      set({ ...state, sheetFor: key });
    },
    closeSheet: () => {
      if (state.sheetFor !== undefined) {
        set({ columnFor: state.columnFor });
      }
    },
    opener: () => opener,
  };
}

export const ArticleChromeContext = createContext<ArticleChromeStore | null>(null);

export function useArticleChrome(): ArticleChromeStore {
  const store = useContext(ArticleChromeContext);
  if (!store) {
    throw new Error('useArticleChrome must be used inside the documentation reader');
  }

  return store;
}

/** One article's view of the store: its column and its sheet. */
export function useArticleChromeOf(key: string) {
  const store = useArticleChrome();
  const column = useSyncExternalStore(
    store.subscribe,
    () => store.get().columnFor.has(key),
    () => false,
  );
  const sheetOpen = useSyncExternalStore(
    store.subscribe,
    () => store.get().sheetFor === key,
    () => false,
  );

  return { store, column, sheetOpen };
}
