import { useTranslation } from 'react-i18next';
import { useRouterState } from '@tanstack/react-router';
import { isHttpClientError } from '@nevo/http-client';
import {
  Alert,
  AppContent,
  Button,
  Typography,
  WorkspaceHeaderIdentity,
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
import { SessionRecoveryNotice, useSessionReturn } from '../../sessions';
import { DocumentEditor } from '../editor/DocumentEditor';
import { useDocumentEditor } from '../editor/DocumentEditorProvider';
import { documentHeaderModel } from '../editor/documentHeaderModel';
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

function useDocument(params: DocumentParams): SecondaryData<DocumentScreenData> {
  const session = useDocumentEditor();
  const { t } = useTranslation();
  const { actions, dirty } = documentHeaderModel(session, t);
  const name = session?.document.filename ?? session?.document.title;
  return {
    status: 'ready',
    data: {
      ...params,
      title: name?.split('/').at(-1) ?? t('specification.documentPreviewTitle'),
      dirty,
      actions,
    },
  };
}

/** The open document: loading and error states, the way back, and the editor. */
export function DocumentPane({ data }: { data: DocumentParams }) {
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
  const closeFailed = tabs.closeFailed && (
    <Alert tone="attention" role="alert" title={t('documents.tabs.closeFailed')} />
  );
  const query = record?.documentId === data.documentId ? record.query : undefined;
  const status = isHttpClientError(query?.error) ? query.error.status : undefined;
  if (!query || query.isPending)
    return (
      <p role="status" className="p-5">
        {t('documents.loadingDocument')}
      </p>
    );
  if (!query.data || status === 401 || status === 403 || status === 404)
    return (
      <Alert
        tone="attention"
        title={status === 403 ? t('documents.noAccess') : t('documents.unavailable')}
      >
        {closeFailed}
        {tabs.tabs.find((tab) => tab.id === data.documentId)?.dirty && (
          <p>{t('documents.tabs.missingHint')}</p>
        )}
        <Button onClick={() => void query.refetch()}>{t('common.retry')}</Button>
      </Alert>
    );
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

/** Marks a document with unsaved edits in a header. */
export function UnsavedMarker() {
  const { t } = useTranslation();
  return (
    <span role="status" className="text-content-muted" title={t('documents.unsaved')}>
      <span aria-hidden="true">•</span>
      <span className="sr-only">{t('documents.unsaved')}</span>
    </span>
  );
}

function DocumentStackHeader({ data }: { data: DocumentScreenData }) {
  return (
    <WorkspaceHeaderIdentity
      headingLevel={2}
      title={data.title}
      status={data.dirty ? <UnsavedMarker /> : undefined}
    />
  );
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
  id: 'demo-active-document-v4',
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
        return { moreActions: translateNow('common.moreActions') };
      },
      component: DocumentPaneScreen,
      preserveOnDataLoss: true,
    },
  },
});
