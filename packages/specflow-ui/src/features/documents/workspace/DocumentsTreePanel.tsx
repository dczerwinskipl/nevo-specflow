import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AppContent, Button, ScrollArea } from '@nevo/ui';
import { ApplicationContextLine } from '../../../app/navigation/ApplicationLocation';
import { useAppServices } from '../../../app/useAppServices';
import { SessionRecoveryNotice } from '../../sessions';
import { DocumentsExplorer, type DocumentTreeController } from '../explorer/DocumentsExplorer';
import { documentTreeKeys } from '../read-model/queries';
import type { DocumentTreeOperations } from './useDocumentTreeOperations';

/** The Primary pane: the document tree with its loading and error states. */
export function DocumentsTreePanel({
  specId,
  documentId,
  controllerRef,
  operations,
  requestRef,
  onSelect,
}: {
  specId: string;
  /** The open document, shown as selected. */
  documentId?: string;
  controllerRef: RefObject<DocumentTreeController | null>;
  operations: DocumentTreeOperations;
  /** Asks to leave unsaved edits before a tree operation; resolves false to cancel it. */
  requestRef: RefObject<(() => Promise<boolean>) | null>;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { documentsApi } = useAppServices();
  const cache = useQueryClient();
  const tree = useQuery({
    queryKey: documentTreeKeys.tree(specId),
    queryFn: ({ signal }) => documentsApi.documentTree(specId, signal),
  });
  return (
    <AppContent className="h-full w-full">
      {/* The location header is a breadcrumb trail; the page still needs its level-1 heading. */}
      <h1 tabIndex={-1} className="sr-only">
        {t('specification.viewDocuments')}
      </h1>
      <SessionRecoveryNotice specId={specId} />
      <ScrollArea direction="both" className="min-h-0 flex-1" contentClassName="p-2">
        <ApplicationContextLine specId={specId} view="documents" className="mb-2 px-2" />
        {tree.isPending ? (
          <p role="status">{t('documents.loadingDocuments')}</p>
        ) : !tree.data ? (
          <Alert tone="attention" title={t('documents.loadFailed')}>
            <Button onClick={() => void tree.refetch()}>{t('common.retry')}</Button>
          </Alert>
        ) : (
          <DocumentsExplorer
            tree={tree.data}
            controllerRef={controllerRef}
            active={documentId}
            onSelect={onSelect}
            onAdd={operations.add}
            onOperate={operations.operate}
            beforeAction={async () => {
              if (requestRef.current && !(await requestRef.current())) return false;
              const snapshot = await documentsApi.documentTree(specId);
              cache.setQueryData(documentTreeKeys.tree(specId), snapshot);
              return snapshot;
            }}
            onBusyChange={operations.setBusy}
          />
        )}
      </ScrollArea>
    </AppContent>
  );
}
