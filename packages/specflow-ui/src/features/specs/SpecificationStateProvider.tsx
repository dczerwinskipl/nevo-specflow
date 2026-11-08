import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import {
  createKeyedStore,
  useKeyedStoreValue,
  type KeyedStore,
} from '../../shared/state/keyedStore';

interface SpecificationStores {
  /** The user's explicit show/hide choice for the Activity history Secondary, by `specId`. */
  historyPanel: KeyedStore<boolean>;
  /** Whether Overview's Documents list shows every document ("show all"), by `specId`. */
  documentsExpanded: KeyedStore<boolean>;
}

const Context = createContext<SpecificationStores | null>(null);

const createStores = (): SpecificationStores => ({
  historyPanel: createKeyedStore<boolean>(),
  documentsExpanded: createKeyedStore<boolean>(),
});

/** Visit-scoped (in-memory, never persisted) Specification view state. */
export function SpecificationStateProvider({ children }: { children: ReactNode }) {
  const [stores] = useState(createStores);

  return <Context.Provider value={stores}>{children}</Context.Provider>;
}

/**
 * Gives a Specification surface rendered outside the application (a story, a test) its own
 * Specification view state, so its sections keep it when they remount. Inside the application the
 * visit's provider is used.
 */
export function EnsureSpecificationState({ children }: { children: ReactNode }) {
  return useContext(Context) ? (
    children
  ) : (
    <SpecificationStateProvider>{children}</SpecificationStateProvider>
  );
}

function useEntry(
  pick: (stores: SpecificationStores) => KeyedStore<boolean>,
  specId: string,
): [boolean | undefined, (value: boolean) => void] {
  const visit = useContext(Context);
  // A section rendered on its own, without any Specification surface around it.
  const [isolated] = useState(createStores);
  const store = pick(visit ?? isolated);
  const value = useKeyedStoreValue(store, specId);
  const set = useCallback((next: boolean) => store.set(specId, next), [store, specId]);

  return [value, set];
}

/**
 * The user's explicit Activity history choice for one Specification (`undefined` until the user
 * shows or hides it) and its setter. It lasts for the visit, so leaving the Overview and coming back
 * keeps it.
 */
export function useHistoryPanelChoice(
  specId: string,
): [boolean | undefined, (open: boolean) => void] {
  return useEntry((stores) => stores.historyPanel, specId);
}

/**
 * Whether Overview's Documents list is expanded for one Specification. Kept outside the section, so
 * it survives the section remounting when Overview changes its column arrangement.
 */
export function useDocumentsSummaryExpanded(
  specId: string,
): [boolean, (expanded: boolean) => void] {
  const [expanded, set] = useEntry((stores) => stores.documentsExpanded, specId);

  return [expanded ?? false, set];
}
