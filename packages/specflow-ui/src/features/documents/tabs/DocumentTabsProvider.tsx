import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { SpecificationDocumentResponse } from '@nevo/specflow-contracts/specs/workspace';
import { useAppServices } from '../../../app/useAppServices';
import { DocumentEditorProvider } from '../editor/DocumentEditorProvider';
import { documentKeys, documentTreeKeys } from '../read-model/queries';

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
 * The workspace-level owner of the Documents edit sessions. It loads the document on screen with
 * ONE query and gives the header, the pane and the guards a single edit session; other documents
 * live in the draft store and are reached through the save operations.
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
        {children}
      </DocumentEditorProvider>
    </RecordContext.Provider>
  );
}
