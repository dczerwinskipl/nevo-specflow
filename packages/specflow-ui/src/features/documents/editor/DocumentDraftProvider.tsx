import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, index) => id === b[index]);

/**
 * Ids of the spec's documents with unsaved changes. The snapshot keeps its array identity while
 * the set is unchanged, so unrelated draft updates do not re-render the caller.
 */
export function useDirtyDocuments(specId: string): readonly string[] {
  const store = useDocumentDraftStore();
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeSpec(specId, listener),
    [store, specId],
  );
  const read = useMemo(() => {
    let last: readonly string[] = [];
    return () => {
      const next = store.dirtyIds(specId);
      if (sameIds(last, next)) return last;
      last = next;
      return next;
    };
  }, [store, specId]);
  return useSyncExternalStore(subscribe, read, read);
}
