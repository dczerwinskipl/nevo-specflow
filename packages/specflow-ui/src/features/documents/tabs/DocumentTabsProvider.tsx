import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { isHttpClientError } from '@nevo/http-client';
import { useOpenedItems, type OpenedItem } from '@nevo/ui';
import type { DemoDocumentTree } from '@nevo/specflow-contracts/demo';
import type { SpecificationDocumentResponse } from '@nevo/specflow-contracts/specs/workspace';
import { useApplicationCollection } from '../../../app/navigation/ApplicationLocation';
import { useAppServices } from '../../../app/useAppServices';
import { useDirtyDocuments, useDocumentDraftStore } from '../editor/DocumentDraftProvider';
import { DocumentEditorProvider, useDocumentSaveOps } from '../editor/DocumentEditorProvider';
import { isDraftDirty } from '../editor/documentDraftStore';
import { UnsavedChangesDialog } from '../editor/UnsavedChangesDialog';
import { documentKeys, documentTreeKeys } from '../read-model/queries';
import { documentTabs, neighbourOf, survivorOf, type DocumentTab } from './documentTabs';

/** The record query of the document on screen: the one place that loads it. */
export interface DocumentRecordState {
  documentId: string;
  query: UseQueryResult<SpecificationDocumentResponse>;
}

const RecordContext = createContext<DocumentRecordState | null>(null);

/** Load state of the document on screen (null when the route shows no document). */
export function useDocumentRecord(): DocumentRecordState | null {
  return useContext(RecordContext);
}

/**
 * The opened documents of one visit to a specification. The route owns which tab is active; this
 * state owns which tabs exist, how they are shown and the questions that closing them asks.
 */
export interface DocumentTabs {
  specId: string;
  tabs: readonly DocumentTab[];
  /** The active tab: the document of the route, or null on the bare list. */
  activeId: string | null;
  isOpen: (id: string) => boolean;
  /** Opens a new tab (history push) or switches to the open one (history replace). */
  show: (id: string) => Promise<void>;
  /**
   * Closes one tab after asking about its unsaved changes. Resolves true only when it closed;
   * a failure of the question is a refusal and `closeFailed` tells the user.
   */
  requestClose: (id: string) => Promise<boolean>;
  /** Closes every tab and shows the list. Callers ask about unsaved changes first. */
  closeAll: () => Promise<void>;
  /** Closes the tabs of deleted documents and drops their drafts; the user already confirmed. */
  removeTabs: (ids: readonly string[]) => Promise<void>;
  closeFailed: boolean;
  dismissCloseFailed: () => void;
}

const TabsContext = createContext<DocumentTabs | null>(null);

export function useDocumentTabs(): DocumentTabs {
  const tabs = useContext(TabsContext);
  if (!tabs) throw new Error('DocumentTabsProvider missing');
  return tabs;
}

/**
 * The workspace-level owner of the Documents edit sessions. It loads the document on screen with
 * ONE query and gives the header, the pane and the guards a single edit session; the other open
 * documents live in the draft store and are reached through the save operations and the tabs.
 */
export function DocumentTabsProvider({
  specId,
  documentId,
  children,
}: {
  specId: string;
  documentId?: string;
  children: ReactNode;
}) {
  const { documentApi, documentsApi } = useAppServices();
  const tree = useQuery({
    queryKey: documentTreeKeys.tree(specId),
    queryFn: ({ signal }) => documentsApi.documentTree(specId, signal),
  });
  const query = useQuery({
    queryKey: documentKeys.detail(specId, documentId ?? ''),
    queryFn: ({ signal }) => documentApi.getDocument(specId, documentId!, signal),
    enabled: Boolean(documentId),
  });
  const record = useMemo<DocumentRecordState | null>(
    () => (documentId ? { documentId, query } : null),
    [documentId, query],
  );
  const document = useMemo(
    () =>
      query.data && documentId
        ? {
            ...query.data,
            filename:
              query.data.filename ??
              tree.data?.documents.find((doc) => doc.id === documentId)?.path,
          }
        : undefined,
    [query.data, tree.data, documentId],
  );
  return (
    <RecordContext.Provider value={record}>
      <DocumentEditorProvider specId={specId} document={document}>
        <TabsHost specId={specId} documentId={documentId} tree={tree.data}>
          {children}
        </TabsHost>
      </DocumentEditorProvider>
    </RecordContext.Provider>
  );
}

function TabsHost({
  specId,
  documentId,
  tree,
  children,
}: {
  specId: string;
  documentId?: string;
  tree: DemoDocumentTree | undefined;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const collection = useApplicationCollection();
  const store = useDocumentDraftStore();
  const ops = useDocumentSaveOps();
  const dirty = useDirtyDocuments(specId);
  const record = useDocumentRecord();
  const [closeFailed, setCloseFailed] = useState(false);
  // The tab whose unsaved-changes question is on screen, and whether its Save failed.
  const [asking, setAsking] = useState<{ id: string; saveFailed: boolean } | null>(null);
  const answer = useRef<((allowed: boolean) => void) | null>(null);
  const mounted = useRef(false);
  const canCloseRef = useRef<(id: string) => Promise<boolean>>(() => Promise.resolve(false));

  const opened = useOpenedItems<OpenedItem>({
    scope: specId,
    canClose: (id) => canCloseRef.current(id),
  });
  const { open: ensureOpen, close: closeNow, closeAll: closeEvery } = opened;
  const ids = useMemo(() => opened.items.map((item) => item.id), [opened.items]);
  // Event-time reads: closing outlives the render that started it.
  const latest = useRef({ ids, documentId, requestClose: opened.requestClose });
  useLayoutEffect(() => {
    latest.current = { ids, documentId, requestClose: opened.requestClose };
  });

  // The route is the source of the active tab: a document in the URL always has its tab.
  useEffect(() => {
    if (documentId) ensureOpen({ id: documentId });
  }, [documentId, ensureOpen]);

  const goTo = useCallback(
    (target: string | undefined, replace: boolean) =>
      navigate(
        target
          ? {
              to: '/specs/$specId/documents/$documentId',
              params: { specId, documentId: target },
              search: { collection },
              // Keeps the Session return state of the visit across tab changes.
              state: true,
              replace,
            }
          : {
              to: '/specs/$specId/documents',
              params: { specId },
              search: { collection },
              state: true,
              replace,
            },
      ),
    [navigate, specId, collection],
  );
  /** The router shows this document (read from the router, not from a stale render). */
  const routeShows = useCallback(
    (id?: string) =>
      router.state.matches.some((match) => {
        const shown = (match.params as Record<string, unknown>).documentId;
        return id === undefined ? shown !== undefined : shown === id;
      }),
    [router],
  );

  const show = useCallback(
    async (id: string) => {
      const { ids: openIds, documentId: shown } = latest.current;
      if (id === shown) return;
      await goTo(id, openIds.includes(id));
    },
    [goTo],
  );

  /** Moves the route off a tab that is about to close; false when the navigation did not happen. */
  const leave = useCallback(
    async (id: string) => {
      const { ids: openIds, documentId: shown } = latest.current;
      if (shown !== id) return true;
      await goTo(neighbourOf(openIds, id), true);
      return !routeShows(id);
    },
    [goTo, routeShows],
  );

  const settle = useCallback((allowed: boolean) => {
    const resolve = answer.current;
    answer.current = null;
    setAsking(null);
    resolve?.(allowed);
  }, []);

  useLayoutEffect(() => {
    canCloseRef.current = async (id) => {
      const draft = store.get(specId, id);
      if (draft && isDraftDirty(draft)) {
        // One question at a time: another close meanwhile is refused instead of overwriting it.
        if (answer.current) return false;
        const allowed = await new Promise<boolean>((resolve) => {
          answer.current = resolve;
          setAsking({ id, saveFailed: false });
        });
        if (!allowed) return false;
      }
      return leave(id);
    };
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Nobody can answer once the host is gone: the tab stays open.
      const resolve = answer.current;
      answer.current = null;
      resolve?.(false);
    };
  }, []);

  const requestClose = useCallback(async (id: string) => {
    try {
      const closed = await latest.current.requestClose(id);
      if (closed && mounted.current) setCloseFailed(false);
      return closed;
    } catch {
      // A guard that throws is a refusal; the tab stays open and the user is told.
      if (mounted.current) setCloseFailed(true);
      return false;
    }
  }, []);

  const closeAll = useCallback(async () => {
    await goTo(undefined, true);
    if (routeShows()) return;
    closeEvery();
  }, [goTo, routeShows, closeEvery]);

  const removeTabs = useCallback(
    async (removed: readonly string[]) => {
      const { ids: openIds, documentId: shown } = latest.current;
      for (const id of removed) store.remove(specId, id);
      if (shown && removed.includes(shown)) await goTo(survivorOf(openIds, shown, removed), true);
      for (const id of removed) closeNow(id);
    },
    [store, specId, goTo, closeNow],
  );

  const recordGone = isHttpClientError(record?.query.error) && record.query.error.status === 404;
  const tabs = useMemo(
    () =>
      documentTabs({
        ids,
        tree,
        dirty,
        unavailable: recordGone && record ? [record.documentId] : [],
      }),
    [ids, tree, dirty, recordGone, record],
  );
  const value = useMemo<DocumentTabs>(
    () => ({
      specId,
      tabs,
      activeId: documentId ?? null,
      isOpen: (id) => ids.includes(id),
      show,
      requestClose,
      closeAll,
      removeTabs,
      closeFailed,
      dismissCloseFailed: () => setCloseFailed(false),
    }),
    [specId, tabs, documentId, ids, show, requestClose, closeAll, removeTabs, closeFailed],
  );

  const askedName = tabs.find((tab) => tab.id === asking?.id)?.label ?? asking?.id ?? '';
  return (
    <TabsContext.Provider value={value}>
      {children}
      <UnsavedChangesDialog
        open={asking !== null}
        description={t('documents.dialogs.unsaved.closeDescription', { name: askedName })}
        saveLabel={t('documents.dialogs.unsaved.save')}
        pending={asking ? ops.savingOf(asking.id) : false}
        saveFailed={asking?.saveFailed ?? false}
        onContinue={() => settle(false)}
        onDiscard={() => {
          // A discarded tab leaves no draft behind: reopening it shows the saved document.
          if (asking) store.remove(specId, asking.id);
          settle(true);
        }}
        onSave={() => {
          const target = asking?.id;
          if (!target) return;
          void ops.save(target).then((result) => {
            const draft = store.get(specId, target);
            if (result?.ok && (!draft || !isDraftDirty(draft))) settle(true);
            else if (mounted.current) setAsking({ id: target, saveFailed: true });
          });
        }}
      />
    </TabsContext.Provider>
  );
}
