import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useKeyedStoreValue } from '../../shared/state/keyedStore';
import { createComposerDraftStore, type ComposerDraftStore } from './composer/composerDraftStore';
import {
  createSessionRecoveryStore,
  type SessionRecovery,
  type SessionRecoveryStore,
} from './recovery/sessionRecoveryStore';
import { createSessionReturnStore, type SessionReturnStore } from './sessionReturnStore';

interface SessionStores {
  composers: ComposerDraftStore;
  recoveries: SessionRecoveryStore;
  returns: SessionReturnStore;
}

const Context = createContext<SessionStores | null>(null);

/** Visit-scoped Session state. Each store is separate, so one never re-renders another's readers. */
export function SessionStateProvider({ children }: { children: ReactNode }) {
  const [stores] = useState<SessionStores>(() => ({
    composers: createComposerDraftStore(),
    recoveries: createSessionRecoveryStore(),
    returns: createSessionReturnStore(),
  }));
  return <Context.Provider value={stores}>{children}</Context.Provider>;
}

function useStores() {
  const stores = useContext(Context);
  if (!stores) throw new Error('SessionStateProvider missing');
  return stores;
}

/** The unsent message of one Session plus its setter. */
export function useComposerDraft(key: string): [string, (message: string) => void] {
  const { composers } = useStores();
  const value = useKeyedStoreValue(composers, key) ?? '';
  const set = useCallback((message: string) => composers.set(key, message), [composers, key]);
  return [value, set];
}

/** The Session still pending allocation after Create (if any) and a function that resolves it. */
export function useSessionRecovery(specId: string) {
  const { recoveries } = useStores();
  const recovery = useKeyedStoreValue(recoveries, specId);
  const resolve = useCallback(() => recoveries.remove(specId), [recoveries, specId]);
  return { recovery, resolve };
}

/** Stable function that records that `specId`'s initial Session still has to be opened. */
export function useRequestSessionRecovery(): (specId: string, recovery: SessionRecovery) => void {
  const { recoveries } = useStores();
  return useCallback((specId, recovery) => recoveries.set(specId, recovery), [recoveries]);
}

/** The Session to return to from Documents of `specId`, if the user came from one. */
export function useSessionReturn(specId: string): string | undefined {
  const { returns } = useStores();
  return useKeyedStoreValue(returns, specId);
}

/** Stable function that remembers the Session a document was opened from. */
export function useRememberSessionReturn(): (specId: string, sessionId: string) => void {
  const { returns } = useStores();
  return useCallback((specId, sessionId) => returns.set(specId, sessionId), [returns]);
}
