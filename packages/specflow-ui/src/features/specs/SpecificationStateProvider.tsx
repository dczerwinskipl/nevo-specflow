import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import {
  createKeyedStore,
  useKeyedStoreValue,
  type KeyedStore,
} from '../../shared/state/keyedStore';

/** The user's explicit show/hide choice for the Activity history Secondary, by `specId`. */
type HistoryPanelChoiceStore = KeyedStore<boolean>;

interface SpecificationStores {
  historyPanel: HistoryPanelChoiceStore;
}

const Context = createContext<SpecificationStores | null>(null);

const createStores = (): SpecificationStores => ({ historyPanel: createKeyedStore<boolean>() });

/** Visit-scoped (in-memory, never persisted) Specification view state. */
export function SpecificationStateProvider({ children }: { children: ReactNode }) {
  const [stores] = useState(createStores);

  return <Context.Provider value={stores}>{children}</Context.Provider>;
}

/**
 * The user's explicit Activity history choice for one Specification (`undefined` until the user
 * shows or hides it) and its setter. Inside the application it lasts for the visit, so leaving the
 * Overview and coming back keeps it. A standalone surface without the visit provider (a story, a
 * test) keeps the choice for as long as it is mounted.
 */
export function useHistoryPanelChoice(
  specId: string,
): [boolean | undefined, (open: boolean) => void] {
  const visit = useContext(Context);
  const [standalone] = useState(createStores);
  const { historyPanel } = visit ?? standalone;
  const choice = useKeyedStoreValue(historyPanel, specId);
  const set = useCallback(
    (open: boolean) => historyPanel.set(specId, open),
    [historyPanel, specId],
  );

  return [choice, set];
}
