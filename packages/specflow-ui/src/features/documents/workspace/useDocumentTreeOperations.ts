import { useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { DemoDocumentOperationInput, DemoDocumentsInput } from '@nevo/specflow-contracts/demo';
import { useApplicationCollection } from '../../../app/navigation/ApplicationLocation';
import { useAppServices } from '../../../app/useAppServices';
import { apiErrorCode } from '../../../shared/http/apiErrorCode';
import { sendRetained, type RequestAttempt } from '../../../shared/operations/retainedRequest';
import { useDocumentDraftStore } from '../editor/DocumentDraftProvider';
import { draftFor } from '../editor/documentDraftStore';
import type { DocumentOperation } from '../explorer/DocumentsExplorer';
import { documentKeys } from '../queries';

/** Follow-up work after a confirmed mutation; its failure never reaches the mutation's caller. */
const noop = () => undefined;
const settleFollowUp = (work: Promise<unknown>) => work.then(noop, noop);

export interface DocumentTreeOperations {
  /** A tree operation is in flight (or unconfirmed): leaving the page is blocked meanwhile. */
  busy: boolean;
  setBusy: (busy: boolean) => void;
  /** Adds files and folders; a single new empty file is opened afterwards. */
  add: (documents: DemoDocumentsInput['documents'], folders?: string[]) => Promise<void>;
  /** Renames, moves or deletes; deleting the open document leaves it. */
  operate: (operation: DocumentOperation) => Promise<void>;
}

/**
 * Sends the Documents tree's changes to the Runtime and reconciles what depends on them: the
 * cached tree, the drafts of changed documents and the document that is open. Requests are
 * retained by body, so an unconfirmed operation is retried with the same request id.
 */
export function useDocumentTreeOperations(options: {
  specId: string;
  /** The open document, if any. */
  documentId?: string;
}): DocumentTreeOperations {
  const { specId, documentId } = options;
  const { documentsApi, documentApi } = useAppServices();
  const drafts = useDocumentDraftStore();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const collection = useApplicationCollection();
  const [busy, setBusy] = useState(false);
  const [destination, setDestination] = useState<{ documentId?: string }>();
  // Retained requests: written and read only by the operations below, never while rendering.
  const importAttempt = useRef<RequestAttempt<DemoDocumentsInput> | null>(null);
  const operationAttempt = useRef<RequestAttempt<DemoDocumentOperationInput> | null>(null);
  useBlocker({ shouldBlockFn: () => busy, enableBeforeUnload: busy });

  // The operation decided where to go (a new file, or away from a deleted one); go once idle.
  useEffect(() => {
    if (destination && !busy) {
      void navigate(
        destination.documentId
          ? {
              to: '/specs/$specId/documents/$documentId',
              params: { specId, documentId: destination.documentId },
              search: { collection },
            }
          : {
              to: '/specs/$specId/documents',
              params: { specId },
              search: { collection },
            },
      );
      setDestination(undefined);
    }
  }, [destination, busy, navigate, specId, collection]);

  const refresh = () => cache.invalidateQueries({ queryKey: ['specifications', specId] });
  const add: DocumentTreeOperations['add'] = async (documents, folders = []) => {
    const result = await sendRetained(importAttempt, { documents, folders }, (input) =>
      documentsApi.addDocuments(specId, input),
    );
    // The mutation is confirmed from here on: nothing below may turn it into an uncertain outcome
    // (a retry would POST again with a new request id). The follow-up is best effort.
    await settleFollowUp(refresh());
    if (documents.length === 1 && documents[0]!.content === '') {
      const id = result.documentIds[0];
      if (id) {
        await settleFollowUp(
          documentApi.getDocument(specId, id).then((record) => {
            cache.setQueryData(documentKeys.detail(specId, id), record);
            drafts.set(specId, id, draftFor(record));
          }),
        );
        // Without the prefetched record the document route loads (and reports) it itself.
        setDestination({ documentId: id });
      }
    }
  };
  const operate: DocumentTreeOperations['operate'] = async (operation) => {
    const result = await sendRetained(
      operationAttempt,
      operation,
      (input) => documentsApi.operateDocument(specId, input),
      'requestId',
      // A coded answer is the server's definite refusal: its request id must not be replayed.
      (error) => Boolean(apiErrorCode(error)),
    );
    for (const removed of result.removedDocumentIds) drafts.remove(specId, removed);
    for (const record of result.documents)
      drafts.update(specId, record.id, (draft) =>
        draft ? { ...draft, revision: record.revision } : undefined,
      );
    await settleFollowUp(refresh());
    if (documentId && result.removedDocumentIds.includes(documentId)) setDestination({});
  };
  return { busy, setBusy, add, operate };
}
