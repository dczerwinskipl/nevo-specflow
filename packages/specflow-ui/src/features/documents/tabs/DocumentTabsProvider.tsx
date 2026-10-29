import type { DocumentContent, DocumentTree } from '@nevo/specflow-contracts/documents';
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
import { documentGuidance, documentReadOnlyReason } from '../catalogue/documentTypePolicy';
import { useDocumentCatalogue } from '../catalogue/useDocumentCatalogue';
import { useApplicationCollection } from '../../../app/navigation/ApplicationLocation';
import { useAppServices } from '../../../app/useAppServices';
import { useDocumentsApi } from '../useDocumentsApi';
import { useDirtyDocuments, useDocumentDraftStore } from '../editor/DocumentDraftProvider';
import { DocumentEditorProvider, useDocumentSaveOwner } from '../editor/DocumentEditorProvider';
import { isDraftDirty } from '../editor/documentDraftStore';
import { UnsavedChangesDialog } from '../editor/UnsavedChangesDialog';
import { documentKeys, documentTreeKeys } from '../read-model/queries';
import { documentTabs, neighbourOf, survivorOf, type DocumentTab } from './documentTabs';

/** The record query of the document on screen: the one place that loads it. */
export interface DocumentRecordState {
  documentId: string;
  query: UseQueryResult<DocumentContent>;
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
  /** Activates the document's tab (opening it); `replace` keeps the history entry (an automatic open). */
  show: (id: string, options?: { replace?: boolean }) => Promise<void>;
  /**
   * Closes one tab after asking about its unsaved changes. Resolves true only when it closed;
   * a failure of the question is a refusal and `closeFailed` tells the user.
   */
  requestClose: (id: string) => Promise<boolean>;
  /** Closes every tab and shows the list. Callers ask about unsaved changes first. */
  closeAll: () => Promise<boolean>;
  /** Closes the tabs of deleted documents and drops their drafts; the user already confirmed. */
  removeTabs: (ids: readonly string[]) => Promise<void>;
  /**
   * A document got a new id (classified, or an unclassified file renamed or moved): its tab keeps
   * its place and, when it is the active one, the route is replaced with the new id.
   */
  follow: (from: string, to: string) => Promise<void>;
  closeFailed: boolean;
  /** A close was refused because another tab's question was still open. */
  closeBusy: boolean;
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
  const { documentApi } = useAppServices();
  const { api: documentsApi } = useDocumentsApi();
  const tree = useQuery({
    queryKey: documentTreeKeys.tree(specId),
    queryFn: ({ signal }) => documentsApi.documentTree(specId, signal),
  });
  const query = useQuery({
    queryKey: documentKeys.detail(specId, documentId ?? ''),
    queryFn: ({ signal }) => documentApi.getDocument(specId, documentId!, signal),
    // A dangling entry has no file to read: its tab shows the missing state from the tree.
    // The tree settles first, so a dangling id is never requested; a tree that failed to load does
    // not hold the document back (it opens, the tree shows its own failure and Retry).
    enabled:
      Boolean(documentId) &&
      !tree.isPending &&
      !tree.data?.dangling.some((entry) => entry.id === documentId),
  });
  const record = useMemo<DocumentRecordState | null>(
    () => (documentId ? { documentId, query } : null),
    [documentId, query],
  );
  const document = query.data && documentId ? query.data : undefined;
  const catalogue = useDocumentCatalogue();
  // Memoised on what it reads, so the editor session is not rebuilt on every render.
  const archetype = tree.data?.archetype;
  const classification = document?.classification;
  const documentType = document?.type;
  const guidance = useMemo(
    () =>
      documentGuidance(catalogue.data, archetype && { archetype }, {
        classification,
        type: documentType,
      }),
    [catalogue.data, archetype, classification, documentType],
  );
  return (
    <RecordContext.Provider value={record}>
      <DocumentEditorProvider
        specId={specId}
        document={document}
        readOnlyReason={document ? documentReadOnlyReason(tree.data, document) : undefined}
        guidance={document ? guidance : undefined}
      >
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
  tree: DocumentTree | undefined;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const collection = useApplicationCollection();
  const store = useDocumentDraftStore();
  const ops = useDocumentSaveOwner();
  const dirty = useDirtyDocuments(specId);
  const record = useDocumentRecord();
  const [closeFailed, setCloseFailed] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  // Every path the tree has shown, so a tab keeps its name when its document disappears. Adjusted
  // while rendering (the tree is the source), not synchronised by an effect.
  const [known, setKnown] = useState<{
    tree?: DocumentTree;
    paths: Readonly<Record<string, string>>;
  }>({ paths: {} });
  if (tree && known.tree !== tree)
    setKnown({
      tree,
      paths: { ...known.paths, ...Object.fromEntries(tree.documents.map((d) => [d.id, d.path])) },
    });
  // The tab whose unsaved-changes question is on screen, and whether its Save failed.
  const [asking, setAsking] = useState<{ id: string; saveFailed: boolean } | null>(null);
  const answer = useRef<((decision: boolean | 'discard') => void) | null>(null);
  // A close is in flight (question, save, navigation): a second one is refused, not queued.
  const closing = useRef(false);
  const mounted = useRef(false);
  const canCloseRef = useRef<(id: string) => Promise<boolean>>(() => Promise.resolve(false));

  const opened = useOpenedItems<OpenedItem>({
    scope: specId,
    canClose: (id) => canCloseRef.current(id),
  });
  const { open: ensureOpen, close: closeNow, closeAll: closeEvery, replace: replaceItem } = opened;
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
    async (id: string, options?: { replace?: boolean }) => {
      const { ids: openIds, documentId: shown } = latest.current;
      if (id === shown) return;
      await goTo(id, options?.replace === true || openIds.includes(id));
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

  const settle = useCallback((allowed: boolean | 'discard') => {
    // The refusal notice belongs to the question it was about: answering ends it.
    setCloseBusy(false);
    const resolve = answer.current;
    answer.current = null;
    setAsking(null);
    resolve?.(allowed);
  }, []);

  useLayoutEffect(() => {
    canCloseRef.current = async (id) => {
      const draft = store.get(specId, id);
      if (draft && isDraftDirty(draft)) {
        // One question at a time, until its tab has left: another close meanwhile is refused, and
        // the user is told.
        if (closing.current) {
          if (mounted.current) setCloseBusy(true);
          return false;
        }
        closing.current = true;
        try {
          const decision = await new Promise<boolean | 'discard'>((resolve) => {
            answer.current = resolve;
            setAsking({ id, saveFailed: false });
          });
          if (!decision) return false;
          const left = await leave(id);
          // The draft goes only once the tab really leaves: a refused navigation keeps the edits.
          if (left && decision === 'discard') store.remove(specId, id);
          return left;
        } finally {
          closing.current = false;
        }
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
      if (closed && mounted.current) {
        setCloseFailed(false);
        setCloseBusy(false);
      }
      return closed;
    } catch {
      // A guard that throws is a refusal; the tab stays open and the user is told.
      if (mounted.current) setCloseFailed(true);
      return false;
    }
  }, []);

  const closeAll = useCallback(async () => {
    await goTo(undefined, true);
    if (routeShows()) return false;
    closeEvery();
    return true;
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

  const follow = useCallback(
    async (from: string, to: string) => {
      const { ids: openIds, documentId: shown } = latest.current;
      if (!openIds.includes(from)) return;
      replaceItem(from, { id: to });
      if (shown === from) await goTo(to, true);
    },
    [replaceItem, goTo],
  );

  const recordGone = isHttpClientError(record?.query.error) && record.query.error.status === 404;
  const tabs = useMemo(
    () =>
      documentTabs({
        ids,
        tree,
        dirty,
        unavailable: recordGone && record ? [record.documentId] : [],
        knownPaths: known.paths,
      }),
    [ids, tree, dirty, recordGone, record, known.paths],
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
      follow,
      closeFailed,
      closeBusy,
      dismissCloseFailed: () => {
        setCloseFailed(false);
        setCloseBusy(false);
      },
    }),
    [
      specId,
      tabs,
      documentId,
      ids,
      show,
      requestClose,
      closeAll,
      removeTabs,
      follow,
      closeFailed,
      closeBusy,
    ],
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
        // A discarded tab leaves no draft behind (removed once it has left): reopening it shows
        // the saved document.
        onDiscard={() => settle('discard')}
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
