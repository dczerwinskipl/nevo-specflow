import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  createDocumentDraftStore,
  type DocumentDraft,
  type DocumentDraftStore,
} from './documentDraftStore';

const Context = createContext<DocumentDraftStore | null>(null);

/** Creates the visit-scoped document draft store. The context value is stable, so it never re-renders consumers. */
export function DocumentDraftProvider({
  store,
  children,
}: {
  /** Injected by tests and stories that need to observe or pre-seed drafts. */
  store?: DocumentDraftStore;
  children: ReactNode;
}) {
  const [own] = useState(createDocumentDraftStore);
  return <Context.Provider value={store ?? own}>{children}</Context.Provider>;
}

export function useDocumentDraftStore(): DocumentDraftStore {
  const store = useContext(Context);
  if (!store) throw new Error('DocumentDraftProvider missing');
  return store;
}

/** Subscribes to ONE document's draft; updates of other documents do not re-render the caller. */
export function useDocumentDraft(specId: string, documentId: string): DocumentDraft | undefined {
  const store = useDocumentDraftStore();
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(specId, documentId, listener),
    [store, specId, documentId],
  );
  const read = useCallback(() => store.get(specId, documentId), [store, specId, documentId]);
  return useSyncExternalStore(subscribe, read, read);
}
