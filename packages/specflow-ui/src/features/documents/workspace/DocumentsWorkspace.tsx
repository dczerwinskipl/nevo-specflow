import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  AppWorkspace,
  AppWorkspaceProvider,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  WorkspaceHeader,
  useWorkspaceCapabilities,
} from '@nevo/ui';
import { applicationLocationHeader } from '../../../app/navigation/ApplicationLocation';
import { useWorkspaceLabels } from '../../../app/navigation/useWorkspaceLabels';
import { useAppServices } from '../../../app/useAppServices';
import { DocumentRouteGuard } from '../editor/DocumentRouteGuard';
import { documentHeaderModel, useDocumentEditor } from '../editor/DocumentEditorProvider';
import { documentRootActions, type DocumentTreeController } from '../explorer/DocumentsExplorer';
import { documentTreeKeys } from '../read-model/queries';
import { DocumentPane, UnsavedMarker } from './DocumentPane';
import { DocumentSession } from './DocumentSession';
import { DocumentsTreePanel } from './DocumentsTreePanel';
import { useDocumentOpening } from './useDocumentOpening';
import { useDocumentTreeOperations } from './useDocumentTreeOperations';

/**
 * The Documents workspace of one specification: the tree in Primary and the open document in
 * Secondary. `DocumentsLayout` renders it for both `documents` and `documents/$documentId`, so a
 * document switch changes only `documentId`; the tree and everything it holds stay mounted.
 */
export function DocumentsWorkspace({
  specId,
  documentId,
}: {
  specId: string;
  documentId?: string;
}) {
  return (
    <AppWorkspaceProvider scopeKey={specId}>
      <DocumentSession specId={specId} documentId={documentId}>
        <Workspace specId={specId} documentId={documentId} />
      </DocumentSession>
    </AppWorkspaceProvider>
  );
}

function Workspace({ specId, documentId }: { specId: string; documentId?: string }) {
  const { t } = useTranslation();
  const workspaceLabels = useWorkspaceLabels();
  const { documentsApi } = useAppServices();
  const { supportsSplit } = useWorkspaceCapabilities();
  const tree = useQuery({
    queryKey: documentTreeKeys.tree(specId),
    queryFn: ({ signal }) => documentsApi.documentTree(specId, signal),
  });
  const editor = useDocumentEditor();
  const documentHeader = documentHeaderModel(editor, t);
  const [demoNotice, setDemoNotice] = useState(false);
  const treeController = useRef<DocumentTreeController>(null);
  const requestRef = useRef<(() => Promise<boolean>) | null>(null);
  const operations = useDocumentTreeOperations({ specId, documentId });
  const opening = useDocumentOpening({ specId, documentId, requestRef });
  const rootActions = documentRootActions(
    treeController,
    tree.data?.capabilities,
    operations.busy,
    t,
  );
  const pane = documentId ? (
    <DocumentPane data={{ specId, documentId }} />
  ) : (
    <EmptyState
      className="border-none"
      title={t('specification.documentIdleTitle')}
      description={t('specification.documentIdleDescription')}
    />
  );
  return (
    <>
      <DocumentRouteGuard specId={specId} documentId={documentId} requestRef={requestRef} />
      <AppWorkspace
        scroll="content"
        fit="available"
        split="secondary"
        labels={{
          ...workspaceLabels,
          backToPrimary: t('documents.backToList'),
          closeSecondary: t('documents.closeDocument'),
        }}
      >
        <AppWorkspace.Primary
          header={applicationLocationHeader({
            title: t('specification.viewDocuments'),
            view: 'documents',
            specId,
            actions: [
              ...rootActions,
              {
                id: 'demo-scope',
                label: t('documents.demo.title'),
                icon: 'info',
                onPress: () => setDemoNotice(true),
              },
            ],
          })}
        >
          <DocumentsTreePanel
            specId={specId}
            documentId={documentId}
            controllerRef={treeController}
            operations={operations}
            requestRef={requestRef}
            onSelect={opening.select}
          />
        </AppWorkspace.Primary>
        {documentId ? (
          <AppWorkspace.Secondary
            open={opening.open}
            onOpenChange={opening.setOpen}
            header={
              <WorkspaceHeader
                actions={documentHeader.actions}
                labels={{ moreActions: t('common.moreActions') }}
                headingLevel={2}
                status={documentHeader.dirty ? <UnsavedMarker /> : undefined}
                title={
                  tree.data?.documents
                    .find((item) => item.id === documentId)
                    ?.path.split('/')
                    .at(-1) ?? t('specification.documentPreviewTitle')
                }
              />
            }
          >
            {pane}
          </AppWorkspace.Secondary>
        ) : supportsSplit ? (
          // Idle placeholder: not dismissible, so closing it cannot bring back a full-width list.
          <AppWorkspace.Secondary
            header={<WorkspaceHeader title={t('specification.documentPreviewTitle')} />}
          >
            {pane}
          </AppWorkspace.Secondary>
        ) : null}
      </AppWorkspace>
      <Dialog open={demoNotice} onOpenChange={setDemoNotice}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('documents.demo.title')}</DialogTitle>
          </DialogHeader>
          <DialogBody>{t('documents.demo.body')}</DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
