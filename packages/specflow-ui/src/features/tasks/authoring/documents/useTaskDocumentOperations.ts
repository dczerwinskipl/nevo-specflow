import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppServices } from '../../../../app/useAppServices';
import { invalidateAfterTaskChange, taskAuthoringKeys } from '../queries';

/** A new Task document: its path in the Task folder and its catalogue document type. */
export interface NewTaskDocument {
  readonly path: string;
  readonly type: string;
}

/**
 * The Task documents' create, rename and delete (the Task-scoped Documents routes). Each write
 * carries a fresh `operationId` (idempotency key) and, for an existing document, the file
 * revision it was planned against. The registry is part of the Task resource, so the Task is
 * refreshed with it.
 */
export function useTaskDocumentOperations(specId: string, taskId: string) {
  const { taskAuthoringApi } = useAppServices();
  const queryClient = useQueryClient();
  const refresh = () => invalidateAfterTaskChange(queryClient, specId);

  const create = useMutation({
    mutationFn: (document: NewTaskDocument) =>
      taskAuthoringApi.addDocuments(specId, taskId, {
        operationId: crypto.randomUUID(),
        documents: [{ path: document.path, type: document.type, content: '' }],
      }),
    onSuccess: refresh,
  });
  const rename = useMutation({
    mutationFn: (input: { documentId: string; revision: string; name: string }) =>
      taskAuthoringApi.operateDocument(specId, taskId, {
        operationId: crypto.randomUUID(),
        action: 'rename',
        kind: 'document',
        documentId: input.documentId,
        name: input.name,
        expectedRevision: input.revision,
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (input: { documentId: string; revision: string }) =>
      taskAuthoringApi.operateDocument(specId, taskId, {
        operationId: crypto.randomUUID(),
        action: 'delete',
        kind: 'document',
        documentId: input.documentId,
        expectedRevision: input.revision,
      }),
    onSuccess: refresh,
  });

  return { create, rename, remove };
}

/** The document types a new Task document may have (the project's catalogue). */
export function useDocumentTypes(enabled: boolean) {
  const { taskAuthoringApi } = useAppServices();

  return useQuery({
    queryKey: taskAuthoringKeys.catalogue,
    queryFn: ({ signal }) => taskAuthoringApi.catalogue(signal),
    select: (catalogue) => catalogue.documentTypes,
    enabled,
    staleTime: 60_000,
  });
}
