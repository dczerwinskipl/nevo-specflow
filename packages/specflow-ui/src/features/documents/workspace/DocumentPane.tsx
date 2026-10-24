import { useTranslation } from 'react-i18next';
import { useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { isHttpClientError } from '@nevo/http-client';
import {
  Alert,
  AppContent,
  Button,
  Typography,
  defineSecondaryStack,
  useWorkspaceCapabilities,
  type SecondaryData,
  type WorkspaceHeaderAction,
} from '@nevo/ui';
import {
  ApplicationBackContent,
  ApplicationSessionBack,
  useApplicationCollection,
} from '../../../app/navigation/ApplicationLocation';
import { BackLink } from '../../../app/navigation/LocationLink';
import { translateNow } from '../../../i18n/message';
import { useAppServices } from '../../../app/useAppServices';
import { typeTitle } from '../catalogue/documentTypePolicy';
import { useDocumentCatalogue } from '../catalogue/useDocumentCatalogue';
import { documentTreeKeys } from '../read-model/queries';
import { useDocumentsTreeActions } from './DocumentsTreeActions';
import { SessionRecoveryNotice, useSessionReturn } from '../../sessions';
import { DocumentEditor } from '../editor/DocumentEditor';
import { useDocumentEditor } from '../editor/DocumentEditorProvider';
import { documentHeaderModel } from '../editor/documentHeaderModel';
import { DocumentTabStrip } from '../tabs/DocumentTabStrip';
import { useDocumentRecord, useDocumentTabs } from '../tabs/DocumentTabsProvider';

export interface DocumentParams {
  specId: string;
  documentId: string;
}
interface DocumentScreenData extends DocumentParams {
  title: string;
  dirty: boolean;
  actions: readonly WorkspaceHeaderAction[];
}

/**
 * The stacked screen shows the ACTIVE tab of the workspace, not the document it was opened for:
 * the workspace loads one record and owns the edit session, so a tab switch only changes this data.
 */
function useDocument(params: DocumentParams): SecondaryData<DocumentScreenData> {
  const session = useDocumentEditor();
  const tabs = useDocumentTabs();
  const { t } = useTranslation();
  const documentId = tabs.activeId ?? params.documentId;
  const { actions, dirty } = documentHeaderModel(session, t, {
    onCloseTab: () => void tabs.requestClose(documentId),
  });
  const name = tabs.tabs.find((tab) => tab.id === documentId)?.label ?? session?.document.path;
  return {
    status: 'ready',
    data: {
      ...params,
      documentId,
      title: name?.split('/').at(-1) ?? t('specification.documentPreviewTitle'),
      dirty,
      actions,
    },
  };
}

/**
 * A registry entry whose file is missing (dangling): what happened, how to keep it, and Remove
 * registration (confirmed in the tree's dialog; it closes this tab).
 */
function DanglingDocument({
  entry,
  dirty,
}: {
  entry: { id: string; path: string; type: string; actions: { delete: { available: boolean } } };
  dirty: boolean;
}) {
  const { t } = useTranslation();
  const catalogue = useDocumentCatalogue();
  const actions = useDocumentsTreeActions();
  const name = entry.path.split('/').at(-1) ?? entry.path;
  return (
    <div className="p-4">
      <Alert
        tone="attention"
        title={t('documents.dangling.title', { name })}
        actions={
          actions && entry.actions.delete.available ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => actions.removeRegistration(entry.id)}
            >
              {t('documents.tree.removeRegistration')}
            </Button>
          ) : undefined
        }
      >
        <p>{t('documents.dangling.body', { name, type: typeTitle(catalogue.data, entry.type) })}</p>
        <p className="mt-1 text-content-secondary">{t('documents.dangling.restore')}</p>
        {dirty && <p className="mt-1">{t('documents.tabs.missingHint')}</p>}
      </Alert>
    </div>
  );
}

/** The open document: loading and error states, the way back, and the editor. */
export function DocumentPane({ data }: { data: DocumentParams }) {
  const { documentsApi } = useAppServices();
  const tree = useQuery({
    queryKey: documentTreeKeys.tree(data.specId),
    queryFn: ({ signal }) => documentsApi.documentTree(data.specId, signal),
  });
  const dangling = tree.data?.dangling.find((entry) => entry.id === data.documentId);
  const session = useSessionReturn(data.specId);
  const { supportsSplit } = useWorkspaceCapabilities();
  const collection = useApplicationCollection();
  const { t } = useTranslation();
  const returnTo = useRouterState({
    select: (routerState) => routerState.location.state.specflowDocumentReturnTo,
  });
  // The workspace loads the document on screen once; the pane only reports its state.
  const record = useDocumentRecord();
  const tabs = useDocumentTabs();
  const closeFailed = (tabs.closeFailed || tabs.closeBusy) && (
    <Alert
      tone="attention"
      role="alert"
      title={tabs.closeFailed ? t('documents.tabs.closeFailed') : t('documents.tabs.closeBusy')}
    />
  );
  const query = record?.documentId === data.documentId ? record.query : undefined;
  if (dangling)
    return (
      <AppContent className="h-full w-full">
        {closeFailed}
        <DanglingDocument
          entry={dangling}
          dirty={tabs.tabs.some((tab) => tab.id === dangling.id && tab.dirty)}
        />
      </AppContent>
    );
  const status = isHttpClientError(query?.error) ? query.error.status : undefined;
  if (!query || query.isPending)
    return (
      <p role="status" className="p-5">
        {t('documents.loadingDocument')}
      </p>
    );
  if (!query.data || status === 401 || status === 403 || status === 404) {
    const tab = tabs.tabs.find((candidate) => candidate.id === data.documentId);
    const missing = status === 404;
    // The tab keeps the last known name; before the tree knew it the id is not worth showing.
    const name = tab && tab.label !== tab.id ? tab.label : undefined;
    return (
      <div className="p-4">
        <Alert
          tone="attention"
          title={
            missing
              ? name
                ? t('documents.notFound.titleNamed', { name })
                : t('documents.notFound.title')
              : status === 403
                ? t('documents.noAccess')
                : t('documents.unavailable')
          }
        >
          {closeFailed}
          {tab?.dirty && <p>{t('documents.tabs.missingHint')}</p>}
          {missing ? (
            <Button onClick={() => void tabs.requestClose(data.documentId)}>
              {t('documents.notFound.close')}
            </Button>
          ) : (
            <Button onClick={() => void query.refetch()}>{t('common.retry')}</Button>
          )}
        </Alert>
      </div>
    );
  }
  // A document promoted from the Specification Overview preview returns there on narrow, where
  // the stacked Back would otherwise only reveal the document tree.
  const overviewReturn = !session && !supportsSplit && returnTo === 'overview';
  return (
    <AppContent className="h-full w-full">
      <div className="flex h-full min-h-0 flex-col">
        {session && (
          <div className="shrink-0 px-4 py-3">
            <ApplicationSessionBack
              specId={data.specId}
              sessionId={session}
              collection={collection}
            />
          </div>
        )}
        {overviewReturn && (
          <Typography as="div" variant="body-sm" className="shrink-0 px-4 py-3">
            <BackLink to="/specs/$specId" params={{ specId: data.specId }} search={{ collection }}>
              <ApplicationBackContent>
                {t('applicationNavigation.specificationOverview')}
              </ApplicationBackContent>
            </BackLink>
          </Typography>
        )}
        {closeFailed}
        {!supportsSplit && <SessionRecoveryNotice specId={data.specId} />}
        <DocumentEditor />
      </div>
    </AppContent>
  );
}

/** The narrow header: the switcher `name (N)` opens the list of open documents. */
function DocumentStackHeader() {
  return <DocumentTabStrip variant="switcher" />;
}

function DocumentPaneScreen({ data }: { data: DocumentScreenData }) {
  return <DocumentPane data={data} />;
}

/** The narrow layout shows the open document as a Secondary stack over the tree. */
export const documentStack = defineSecondaryStack<
  DocumentParams,
  DocumentScreenData,
  { document: Record<string, never> }
>({
  id: 'demo-active-document-v5',
  initial: 'document',
  useData: useDocument,
  screens: {
    document: {
      // `title` and `actionLabels` are plain strings of the design-system contract, read at render time.
      get title() {
        return translateNow('specification.documentPreviewTitle');
      },
      header: DocumentStackHeader,
      actions: ({ data }) => data.actions,
      get actionLabels() {
        return {
          moreActions: translateNow('common.moreActions'),
          menuActions: translateNow('documents.menuActions'),
          menuDisplay: translateNow('documents.menuDisplay'),
        };
      },
      // Every action, promoted ones included, is in the menu (the compact row has no direct ones).
      menu: 'complete',
      component: DocumentPaneScreen,
      preserveOnDataLoss: true,
    },
  },
});
