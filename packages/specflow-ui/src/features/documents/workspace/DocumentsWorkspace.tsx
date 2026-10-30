import { useEffect, useRef, useState } from 'react';
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
  WorkspaceHeader,
  getItemTabId,
  getItemTabPanelId,
  useWorkspaceCapabilities,
} from '@nevo/ui';
import { applicationLocationHeader } from '../../../app/navigation/ApplicationLocation';
import { useWorkspaceLabels } from '../../../app/navigation/useWorkspaceLabels';
import { useDocumentsApi } from '../useDocumentsApi';
import { DocumentRouteGuard } from '../editor/DocumentRouteGuard';
import { useDocumentEditor } from '../editor/DocumentEditorProvider';
import { documentHeaderModel } from '../editor/documentHeaderModel';
import { documentRootActions, type DocumentTreeController } from '../explorer/DocumentsExplorer';
import { documentTreeKeys } from '../read-model/queries';
import { DocumentTabStrip, documentTabsScope } from '../tabs/DocumentTabStrip';
import { DocumentTabsProvider, useDocumentTabs } from '../tabs/DocumentTabsProvider';
import { DocumentPane } from './DocumentPane';
import { DocumentsEmptyState } from './DocumentsEmptyState';
import {
  DocumentsTreeActionsContext,
  assignTypeFor,
  type DocumentsTreeActions,
} from './DocumentsTreeActions';
import { DocumentsTreePanel } from './DocumentsTreePanel';
import { startDocument } from './startDocument';
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
      <DocumentTabsProvider specId={specId} documentId={documentId}>
        <Workspace specId={specId} documentId={documentId} />
      </DocumentTabsProvider>
    </AppWorkspaceProvider>
  );
}

function Workspace({ specId, documentId }: { specId: string; documentId?: string }) {
  const { t } = useTranslation();
  const workspaceLabels = useWorkspaceLabels();
  const { api: documentsApi } = useDocumentsApi();
  const { supportsSplit, measured } = useWorkspaceCapabilities();
  const tree = useQuery({
    queryKey: documentTreeKeys.tree(specId),
    queryFn: ({ signal }) => documentsApi.documentTree(specId, signal),
  });
  const editor = useDocumentEditor();
  const tabs = useDocumentTabs();
  const [demoNotice, setDemoNotice] = useState(false);
  const treeController = useRef<DocumentTreeController>(null);
  // Stable: the callbacks read the controller only when the user acts.
  const [treeActions] = useState<DocumentsTreeActions>(() => ({
    assignType: (id) => treeController.current?.assignType(id),
    removeRegistration: (id) => treeController.current?.removeRegistration(id),
  }));
  const documentHeader = documentHeaderModel(editor, t, {
    onCloseTab: documentId ? () => void tabs.requestClose(documentId) : undefined,
    onAssignType: assignTypeFor(treeActions, tree.data, documentId),
  });
  const requestRef = useRef<(() => Promise<boolean>) | null>(null);
  const commitRef = useRef<(() => void) | null>(null);
  const takeDiscardedRef = useRef<(() => string[]) | null>(null);
  const operations = useDocumentTreeOperations({ specId });
  const opening = useDocumentOpening({ specId, documentId, requestRef, commitRef });
  // Once per visit (this screen's mount), as soon as the tree and the layout are known: the main
  // file opens when nothing is chosen. Decided once, so closing it never reopens it in this visit.
  const startDecided = useRef(false);
  const { show } = tabs;
  const openTabCount = tabs.tabs.length;
  useEffect(() => {
    if (startDecided.current || !tree.data || !measured) {
      return;
    }

    startDecided.current = true;
    const start = startDocument({
      tree: tree.data,
      documentId,
      openTabs: openTabCount,
    });
    if (start) {
      // Split: replaces the entry, so Back leaves the screen instead of returning to an empty
      // document area. Stacked: pushes it, so Back returns to the tree, the visit's useful first
      // view there.
      void show(start, { replace: supportsSplit });
    }
  }, [tree.data, measured, supportsSplit, documentId, openTabCount, show]);
  const rootActions = documentRootActions(
    treeController,
    tree.data?.capabilities,
    operations.busy,
    t,
  );
  const pane = documentId ? (
    <div
      role="tabpanel"
      id={getItemTabPanelId(documentTabsScope, documentId)}
      aria-labelledby={getItemTabId(documentTabsScope, documentId)}
      className="h-full min-h-0 w-full"
    >
      <DocumentPane data={{ specId, documentId }} />
    </div>
  ) : (
    <DocumentsEmptyState
      // The start actions the Specification allows; a running operation only disables them.
      actions={rootActions.filter((action) => {
        const capabilities = tree.data?.capabilities;
        if (action.id === 'documents-new-file') {
          return capabilities?.createFile.available === true;
        }

        if (action.id === 'documents-upload') {
          return capabilities?.import.available === true;
        }

        return false;
      })}
    />
  );

  return (
    <DocumentsTreeActionsContext.Provider value={treeActions}>
      <DocumentRouteGuard
        specId={specId}
        requestRef={requestRef}
        commitRef={commitRef}
        takeDiscardedRef={takeDiscardedRef}
      />
      <AppWorkspace
        scroll="content"
        fit="available"
        // Back already leaves the stacked document; its own close would repeat it.
        stackedSecondaryClose="hide"
        // The tree stops growing at 360 px; the document gets the rest on wide screens.
        primaryMaxPx={360}
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
              // What the demo emulates; a project Runtime has nothing to explain here.
              ...(documentsApi.emulated
                ? [
                    {
                      id: 'demo-scope',
                      label: t('documents.demo.title'),
                      icon: 'info' as const,
                      onPress: () => setDemoNotice(true),
                    },
                  ]
                : []),
            ],
          })}
        >
          <DocumentsTreePanel
            specId={specId}
            documentId={documentId}
            controllerRef={treeController}
            operations={operations}
            requestRef={requestRef}
            takeDiscardedRef={takeDiscardedRef}
            onSelect={opening.select}
          />
        </AppWorkspace.Primary>
        {documentId || tabs.tabs.length > 0 ? (
          <AppWorkspace.Secondary
            open
            // The region's close closes every tab, asking once about the unsaved documents.
            onOpenChange={(next) => {
              if (!next) {
                opening.closeAll();
              }
            }}
            header={
              <WorkspaceHeader
                actions={documentHeader.actions}
                menu="complete"
                labels={{
                  moreActions: t('common.moreActions'),
                  menuActions: t('documents.menuActions'),
                  menuDisplay: t('documents.menuDisplay'),
                }}
                headingLevel={2}
                // The tab label: the file name, also for a missing (dangling) document.
                title={
                  tabs.tabs.find((tab) => tab.id === documentId)?.label ??
                  t('specification.documentPreviewTitle')
                }
                identityContent={<DocumentTabStrip />}
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
    </DocumentsTreeActionsContext.Provider>
  );
}
