import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppServices } from '../../../app/useAppServices';
import { DocumentEditorProvider } from '../editor/DocumentEditorProvider';
import { documentKeys, documentTreeKeys } from '../read-model/queries';

/** Loads the open document once so the header, the pane and the guard share one edit session. */
export function DocumentSession({
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
    <DocumentEditorProvider specId={specId} document={document}>
      {children}
    </DocumentEditorProvider>
  );
}
