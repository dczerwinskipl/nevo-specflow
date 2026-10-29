import { useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AppContent, Button, InlineNote, ScrollArea, Separator } from '@nevo/ui';
import { ApplicationContextLine } from '../../../app/navigation/ApplicationLocation';
import { useDocumentsApi } from '../useDocumentsApi';
import { useMessage } from '../../../i18n/message';
import { SessionRecoveryNotice } from '../../sessions';
import { useSpecificationWorkspace } from '../../specs/read-model';
import {
  archetypeTitle,
  closeRefusingIssues,
  readOnlyLine,
  specificationReadOnlyReason,
  typeTitle,
  unmetRequirements,
} from '../catalogue/documentTypePolicy';
import { useDocumentCatalogue } from '../catalogue/useDocumentCatalogue';
import { useDirtyDocuments, useDocumentDraftStore } from '../editor/DocumentDraftProvider';
import { DocumentsExplorer, type DocumentTreeController } from '../explorer/DocumentsExplorer';
import { documentTreeKeys } from '../read-model/queries';
import { CloseIssues } from './CloseIssues';
import { createDiscardConsent } from './discardConsent';
import { ExpectedDocuments } from './ExpectedDocuments';
import type { DocumentTreeOperations } from './useDocumentTreeOperations';

/** The Primary pane: the document tree with its loading and error states. */
export function DocumentsTreePanel({
  specId,
  documentId,
  controllerRef,
  operations,
  requestRef,
  takeDiscardedRef,
  onSelect,
}: {
  specId: string;
  /** The open document, shown as selected. */
  documentId?: string;
  controllerRef: RefObject<DocumentTreeController | null>;
  operations: DocumentTreeOperations;
  /** Asks to leave unsaved edits before a tree operation; resolves false to cancel it. */
  requestRef: RefObject<(() => Promise<boolean>) | null>;
  /** Takes over the drafts the user agreed to discard (removed only once the operation succeeded). */
  takeDiscardedRef?: RefObject<(() => string[]) | null>;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const { api: documentsApi } = useDocumentsApi();
  const cache = useQueryClient();
  const tree = useQuery({
    queryKey: documentTreeKeys.tree(specId),
    queryFn: ({ signal }) => documentsApi.documentTree(specId, signal),
  });
  const catalogue = useDocumentCatalogue();
  const dirtyIds = useDirtyDocuments(specId);
  const specification = useSpecificationWorkspace(specId);
  const data = tree.data;
  const drafts = useDocumentDraftStore();
  // The drafts the user agreed to discard go only once the action is confirmed (see the helper).
  const [consent] = useState(() => createDiscardConsent((id) => drafts.remove(specId, id)));
  // What needs the reader first, and only that: Close refusals, why nothing can be changed, and
  // the types the archetype expects that are missing.
  const issues = data ? closeRefusingIssues(data) : [];
  const readOnly = data ? specificationReadOnlyReason(data) : undefined;
  const unmet = data ? unmetRequirements(data) : [];
  return (
    <AppContent className="h-full w-full">
      {/* The location header is a breadcrumb trail; the page still needs its level-1 heading. */}
      <h1 tabIndex={-1} className="sr-only">
        {t('specification.viewDocuments')}
      </h1>
      <SessionRecoveryNotice specId={specId} />
      <ScrollArea direction="both" className="min-h-0 flex-1" contentClassName="p-2">
        <ApplicationContextLine specId={specId} view="documents" className="mb-2 px-2" />
        {data && (issues.length > 0 || readOnly !== undefined || unmet.length > 0) && (
          // Inside the tree's scroll area: it scrolls away with the tree and costs nothing when empty.
          <div className="mb-3 grid gap-4">
            <CloseIssues issues={issues} />
            {readOnly && (
              <InlineNote className="px-2">{text(readOnlyLine(readOnly, 'tree'))}</InlineNote>
            )}
            <ExpectedDocuments
              requirements={unmet}
              archetype={archetypeTitle(data, catalogue.data)}
              typeTitle={(typeId) => typeTitle(catalogue.data, typeId)}
              canAdd={data.capabilities.createFile.available}
              onAdd={(typeId) => controllerRef.current?.newDocument(typeId)}
            />
            {(issues.length > 0 || unmet.length > 0) && <Separator />}
          </div>
        )}
        {tree.isPending ? (
          <p role="status">{t('documents.loadingDocuments')}</p>
        ) : !tree.data ? (
          <Alert tone="attention" title={t('documents.loadFailed')}>
            <Button onClick={() => void tree.refetch()}>{t('common.retry')}</Button>
          </Alert>
        ) : (
          <DocumentsExplorer
            tree={tree.data}
            catalogue={{
              data: catalogue.data,
              isPending: catalogue.isPending,
              retry: () => void catalogue.refetch(),
            }}
            specificationTitle={specification.data?.title ?? specId}
            onRefresh={operations.refresh}
            dirtyIds={dirtyIds}
            controllerRef={controllerRef}
            active={documentId}
            onSelect={onSelect}
            onAdd={(documents, folders) => consent.after(() => operations.add(documents, folders))}
            onOperate={(operation) =>
              // Before the drafts follow a changed id: the agreed discard is about the old one.
              operations.operate(operation, { onConfirmed: consent.confirm })
            }
            beforeAction={async (options) => {
              consent.begin([]);
              // Create, classify and registration removal keep the drafts of open documents.
              if (!options?.keepDrafts) {
                if (requestRef.current && !(await requestRef.current())) return false;
                consent.begin(takeDiscardedRef?.current?.() ?? []);
              }
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
