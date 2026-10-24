import type {
  CreateDocumentsInput,
  DocumentOperationInput,
} from '@nevo/specflow-contracts/documents';
import { useEffect, useRef, useState } from 'react';
import { useBlocker } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAppServices } from '../../../app/useAppServices';
import { apiErrorCode } from '../../../shared/http/apiErrorCode';
import { sendRetained, type RequestAttempt } from '../../../shared/operations/retainedRequest';
import { useDocumentDraftStore } from '../editor/DocumentDraftProvider';
import { draftFor } from '../editor/documentDraftStore';
import { isWithinSpecDocuments } from '../../../app/navigation/routeScope';
import { useDocumentTabs } from '../tabs/DocumentTabsProvider';
import type { DocumentOperation } from '../explorer/DocumentsExplorer';
import type { PlannedDocument } from '../explorer/documentTreePolicy';
import { documentKeys } from '../read-model/queries';

/** Follow-up work after a confirmed mutation; its failure never reaches the mutation's caller. */
const noop = () => undefined;
const settleFollowUp = (work: Promise<unknown>) => work.then(noop, noop);

export interface DocumentTreeOperations {
  /** A tree operation is in flight (or unconfirmed): leaving the page is blocked meanwhile. */
  busy: boolean;
  setBusy: (busy: boolean) => void;
  /** Adds files and folders; a new empty file, or the first imported file, opens as a new tab. */
  add: (documents: PlannedDocument[], folders?: string[]) => Promise<void>;
  /** Renames, moves, deletes or classifies; deleting a document closes its tab (no second question). */
  operate: (operation: DocumentOperation) => Promise<void>;
}

/**
 * Sends the Documents tree's changes to the Runtime and reconciles what depends on them: the
 * cached tree, the drafts of changed documents and the document that is open. Requests are
 * retained by body, so an unconfirmed operation is retried with the same `operationId`.
 */
export function useDocumentTreeOperations(options: { specId: string }): DocumentTreeOperations {
  const { specId } = options;
  const { documentsApi, documentApi } = useAppServices();
  const drafts = useDocumentDraftStore();
  const cache = useQueryClient();
  const tabs = useDocumentTabs();
  const [busy, setBusy] = useState(false);
  // What the operation decided for the tabs; applied once the tree is idle again.
  const [followUp, setFollowUp] = useState<{ show?: string; removed?: readonly string[] }>();
  // Retained requests: written and read only by the operations below, never while rendering.
  const importAttempt = useRef<RequestAttempt<CreateDocumentsInput> | null>(null);
  const operationAttempt = useRef<RequestAttempt<DocumentOperationInput> | null>(null);
  // Leaving is blocked while an operation is unconfirmed; moving between tabs of the screen is not.
  useBlocker({
    shouldBlockFn: ({ current, next }) => busy && !isWithinSpecDocuments(current, next, specId),
    enableBeforeUnload: busy,
  });

  useEffect(() => {
    if (!followUp || busy) return;
    setFollowUp(undefined);
    void (async () => {
      if (followUp.removed) await tabs.removeTabs(followUp.removed);
      if (followUp.show) await tabs.show(followUp.show);
    })();
  }, [followUp, busy, tabs]);

  const refresh = () => cache.invalidateQueries({ queryKey: ['specifications', specId] });
  const add: DocumentTreeOperations['add'] = async (documents, folders = []) => {
    const result = await sendRetained(
      importAttempt,
      { documents, folders },
      (input) => documentsApi.addDocuments(specId, input),
      'operationId',
    );
    // The mutation is confirmed from here on: nothing below may turn it into an uncertain outcome
    // (a retry would POST again with a new operation id). The follow-up is best effort.
    await settleFollowUp(refresh());
    // A new empty file opens in edit; an import opens its first file in preview.
    const blank = documents.length === 1 && documents[0]!.content === '';
    const id = documents.length > 0 ? result.documents[0]?.id : undefined;
    if (id) {
      await settleFollowUp(
        documentApi.getDocument(specId, id).then((record) => {
          cache.setQueryData(documentKeys.detail(specId, id), record);
          drafts.set(specId, id, { ...draftFor(record), editing: blank });
        }),
      );
      // Without the prefetched record the document route loads (and reports) it itself.
      setFollowUp({ show: id });
    }
  };
  const operate: DocumentTreeOperations['operate'] = async (operation) => {
    const result = await sendRetained(
      operationAttempt,
      operation,
      (input) => documentsApi.operateDocument(specId, input),
      'operationId',
      // A coded answer is the server's definite refusal: its operation id must not be replayed.
      (error) => Boolean(apiErrorCode(error)),
    );
    for (const removed of result.removedDocumentIds) drafts.remove(specId, removed);
    // phase C: classify, rename and move of an unclassified file change its derived `u-` id; the
    // open tab, its draft and the route must follow `result.documents[].id`.
    for (const record of result.documents)
      drafts.update(specId, record.id, (draft) =>
        draft ? { ...draft, revision: record.revision } : undefined,
      );
    await settleFollowUp(refresh());
    if (result.removedDocumentIds.length > 0) setFollowUp({ removed: result.removedDocumentIds });
  };
  return { busy, setBusy, add, operate };
}
