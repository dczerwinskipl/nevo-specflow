import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { DocumentContent } from '@nevo/specflow-contracts/documents';
import {
  Alert,
  AppContent,
  Button,
  defineSecondaryStack,
  useSecondaryLeaveGuard,
  useSecondaryNavigation,
  WorkspaceHeaderIdentity,
  type SecondaryData,
  type WorkspaceHeaderAction,
} from '@nevo/ui';
import { useAppServices } from '../../../app/useAppServices';
import { translateNow } from '../../../i18n/message';
import { taskDocumentScope } from '../api';
import { DocumentEditor } from '../editor/DocumentEditor';
import { DocumentEditorProvider, useDocumentEditor } from '../editor/DocumentEditorProvider';
import { documentHeaderModel } from '../editor/documentHeaderModel';
import { useDocumentDraftStore } from '../editor/DocumentDraftProvider';
import { UnsavedChangesDialog } from '../editor/UnsavedChangesDialog';
import { documentKeys } from '../read-model/queries';

const STACK_ID = 'task-document';
const TAB_PREFIX = `${STACK_ID}:`;

interface TaskDocumentParams {
  readonly documentId: string;
  /** The tab label: the document's file name. */
  readonly name: string;
}

interface TaskDocumentRecord {
  readonly documentId: string;
  readonly query: UseQueryResult<DocumentContent>;
}

const RecordContext = createContext<TaskDocumentRecord | null>(null);

/**
 * The edit session of the Task document shown in the Secondary: one owner above the workspace (as
 * the Documents workspace's tabs provider), so the tab's header actions and its content share one
 * session. The shown document follows the active Secondary tab; the other open documents keep
 * their drafts in the draft store. Drafts and caches are keyed by the Task's documents scope.
 */
export function TaskDocumentEditorHost({
  specId,
  taskId,
  writable,
  onSaved,
  children,
}: {
  readonly specId: string;
  readonly taskId: string;
  /** False when the Specification is archived (the Task document tree's `writable`). */
  readonly writable: boolean;
  /** After a Task document save: what reads it (gates, process artifacts) is refreshed. */
  readonly onSaved?: () => void;
  readonly children: ReactNode;
}) {
  const navigation = useSecondaryNavigation();
  const { documentApi } = useAppServices();
  const scope = taskDocumentScope(specId, taskId);
  const active = navigation.tabs.activeTabId;
  const documentId = active?.startsWith(TAB_PREFIX) ? active.slice(TAB_PREFIX.length) : undefined;
  const query = useQuery({
    queryKey: documentKeys.detail(scope, documentId ?? ''),
    queryFn: ({ signal }) => documentApi.getDocument(scope, documentId!, signal),
    enabled: documentId !== undefined,
  });
  const document = documentId && query.data?.id === documentId ? query.data : undefined;

  return (
    <RecordContext.Provider value={documentId ? { documentId, query } : null}>
      <DocumentEditorProvider
        specId={scope}
        document={document}
        readOnlyReason={writable ? undefined : 'archived'}
        onSaved={onSaved}
      >
        {children}
      </DocumentEditorProvider>
    </RecordContext.Provider>
  );
}

interface ScreenData {
  readonly name: string;
  readonly dirty: boolean;
  readonly actions: readonly WorkspaceHeaderAction[];
}

function useTaskDocumentScreen(params: TaskDocumentParams): SecondaryData<ScreenData> {
  const { t } = useTranslation();
  const session = useDocumentEditor();
  const record = useContext(RecordContext);
  const navigation = useSecondaryNavigation();
  if (record?.documentId === params.documentId && record.query.isError) {
    return { status: 'ready', data: { name: params.name, dirty: false, actions: [] } };
  }

  if (session?.document.id !== params.documentId) {
    return { status: 'loading' };
  }

  // Closing the tab goes through the screen's leave guard, which asks about unsaved changes.
  const { actions, dirty } = documentHeaderModel(session, t, {
    onCloseTab: () => void navigation.closeTab(`${TAB_PREFIX}${params.documentId}`),
  });

  return { status: 'ready', data: { name: params.name, dirty, actions } };
}

/**
 * Leaving the document with unsaved edits (closing its tab, switching tabs, closing the Secondary,
 * a route change) asks first, as the Documents tabs do: save, discard or keep editing. A discard
 * removes the draft only once the document has really been left.
 */
function useUnsavedGuard(name: string) {
  const { t } = useTranslation();
  const session = useDocumentEditor();
  const store = useDocumentDraftStore();
  const [asking, setAsking] = useState<{ saveFailed: boolean } | null>(null);
  const answer = useRef<((decision: boolean) => void) | null>(null);
  const dirty = session?.dirty === true;
  const latest = useRef(session);
  useLayoutEffect(() => {
    latest.current = session;
  });
  // The draft a Discard gave up: removed when the screen is really left (it unmounts). A leave that
  // is refused after the answer keeps the screen, and the next question clears the mark.
  const discarded = useRef<{ specId: string; documentId: string } | null>(null);
  useEffect(
    () => () => {
      const draft = discarded.current;
      if (draft) {
        // After the whole subtree has unmounted: the editor below records its view state into the
        // draft while it unmounts, which would otherwise bring the discarded draft back.
        queueMicrotask(() => store.remove(draft.specId, draft.documentId));
      }
    },
    [store],
  );
  const guard = useCallback(() => {
    if (!dirty) {
      return true;
    }

    discarded.current = null;

    return new Promise<boolean>((resolve) => {
      answer.current = resolve;
      setAsking({ saveFailed: false });
    });
  }, [dirty]);
  useSecondaryLeaveGuard(guard);
  const settle = (decision: boolean) => {
    setAsking(null);
    answer.current?.(decision);
    answer.current = null;
  };

  return (
    <UnsavedChangesDialog
      open={asking !== null}
      description={t('documents.dialogs.unsaved.closeDescription', { name })}
      saveLabel={t('documents.dialogs.unsaved.save')}
      pending={session?.saving === true}
      saveFailed={asking?.saveFailed ?? false}
      onContinue={() => settle(false)}
      onDiscard={() => {
        const open = latest.current;
        discarded.current = open ? { specId: open.specId, documentId: open.document.id } : null;
        settle(true);
      }}
      onSave={() => {
        void latest.current?.save().then((saved) => {
          if (saved) {
            settle(true);
          } else {
            setAsking({ saveFailed: true });
          }
        });
      }}
    />
  );
}

/** The document's file name, as its tab is named, and whether it has unsaved changes. */
function TaskDocumentHeader({ data }: { data: ScreenData }) {
  const { t } = useTranslation();

  return (
    <WorkspaceHeaderIdentity
      as="h2"
      headingLevel={2}
      title={data.name}
      status={
        data.dirty ? (
          <span className="text-body-sm text-content-muted">{t('documents.tabs.statusDirty')}</span>
        ) : undefined
      }
    />
  );
}

function TaskDocumentScreen({ data }: { data: ScreenData }) {
  const { t } = useTranslation();
  const record = useContext(RecordContext);
  const unsaved = useUnsavedGuard(data.name);
  if (record?.query.isError) {
    return (
      <div className="p-4">
        <Alert
          role="alert"
          tone="attention"
          title={t('documents.unavailable')}
          actions={
            <Button size="sm" variant="secondary" onClick={() => void record.query.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <AppContent className="h-full w-full">
      <div className="flex h-full min-h-0 flex-col">
        <DocumentEditor />
      </div>
      {unsaved}
    </AppContent>
  );
}

/**
 * A Task document as a Secondary root tab (one tab per document; several open side by side on the
 * tab rail). On Narrow the Secondary is a pushed page with Back. Open it with
 * `useSecondaryNavigation().openTab(taskDocumentStack, { documentId, name })` below a
 * {@link TaskDocumentEditorHost}.
 */
export const taskDocumentStack = defineSecondaryStack<
  TaskDocumentParams,
  ScreenData,
  { document: Record<never, never> }
>({
  id: STACK_ID,
  initial: 'document',
  instanceId: (params) => params.documentId,
  tabLabel: (params) => params.name,
  useData: useTaskDocumentScreen,
  screens: {
    document: {
      get title() {
        return translateNow('specification.documentPreviewTitle');
      },
      // The document's file name, as its tab is named (the Documents tab rail names files the same).
      header: TaskDocumentHeader,
      actions: ({ data }) => data.actions,
      get actionLabels() {
        return {
          moreActions: translateNow('common.moreActions'),
          menuActions: translateNow('documents.menuActions'),
          menuDisplay: translateNow('documents.menuDisplay'),
        };
      },
      menu: 'complete',
      component: TaskDocumentScreen,
      preserveOnDataLoss: true,
    },
  },
});
