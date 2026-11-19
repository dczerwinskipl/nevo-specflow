import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import {
  createKeyedStore,
  useKeyedStoreValue,
  type KeyedStore,
} from '../../../shared/state/keyedStore';

const Context = createContext<KeyedStore<boolean> | null>(null);

/**
 * Visit-scoped (in-memory, never persisted) choices of the Full Task's supporting sections: the
 * user's open or collapsed toggle, by Task and section. Leaving a Task and coming back keeps it.
 */
export function SupportSectionStateProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createKeyedStore<boolean>);

  return <Context.Provider value={store}>{children}</Context.Provider>;
}

/**
 * The user's explicit open/collapsed choice for one section of one Task (`undefined` until the
 * user toggles it) and its setter. Outside the application (a story, a test) the section keeps
 * its own choice.
 */
export function useSupportSectionChoice(
  key: string,
): [boolean | undefined, (open: boolean) => void] {
  const visit = useContext(Context);
  const [isolated] = useState(createKeyedStore<boolean>);
  const store = visit ?? isolated;
  const value = useKeyedStoreValue(store, key);
  const set = useCallback((open: boolean) => store.set(key, open), [store, key]);

  return [value, set];
}
