import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { DocumentContent } from '@nevo/specflow-contracts/documents';
import {
  Alert,
  AppContent,
  Button,
  defineSecondaryStack,
  useSecondaryNavigation,
  type SecondaryData,
  type WorkspaceHeaderAction,
} from '@nevo/ui';
import { useAppServices } from '../../../app/useAppServices';
import { translateNow } from '../../../i18n/message';
import { taskDocumentScope } from '../api';
import { DocumentEditor } from '../editor/DocumentEditor';
import { DocumentEditorProvider, useDocumentEditor } from '../editor/DocumentEditorProvider';
import { documentHeaderModel } from '../editor/documentHeaderModel';
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
  children,
}: {
  readonly specId: string;
  readonly taskId: string;
  /** False when the Specification is archived (the Task document tree's `writable`). */
  readonly writable: boolean;
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
      >
        {children}
      </DocumentEditorProvider>
    </RecordContext.Provider>
  );
}

interface ScreenData {
  readonly actions: readonly WorkspaceHeaderAction[];
}

function useTaskDocumentScreen(params: TaskDocumentParams): SecondaryData<ScreenData> {
  const { t } = useTranslation();
  const session = useDocumentEditor();
  const record = useContext(RecordContext);
  const navigation = useSecondaryNavigation();
  if (record?.documentId === params.documentId && record.query.isError) {
    return { status: 'ready', data: { actions: [] } };
  }

  if (session?.document.id !== params.documentId) {
    return { status: 'loading' };
  }

  const { actions } = documentHeaderModel(session, t, {
    onCloseTab: () => void navigation.closeTab(`${TAB_PREFIX}${params.documentId}`),
  });

  return { status: 'ready', data: { actions } };
}

function TaskDocumentScreen() {
  const { t } = useTranslation();
  const record = useContext(RecordContext);
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
