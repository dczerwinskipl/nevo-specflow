import type {
  CreateDocumentsInput,
  DocumentContent,
  DocumentOperationInput,
  DocumentOperationResult,
  DocumentTree,
} from '@nevo/specflow-contracts/documents';
import { useEffect, useRef, useState } from 'react';
import { useBlocker } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAppServices } from '../../../app/useAppServices';
import { useDocumentsApi } from '../useDocumentsApi';
import { useDocumentCatalogue } from '../catalogue/useDocumentCatalogue';
import { ApiError } from '../../../api';
import { apiErrorCode } from '../../../shared/http/apiErrorCode';
import { sendRetained, type RequestAttempt } from '../../../shared/operations/retainedRequest';
import { useDocumentDraftStore } from '../editor/DocumentDraftProvider';
import { draftFor } from '../editor/documentDraftStore';
import { isWithinSpecDocuments } from '../../../app/navigation/routeScope';
import { useDocumentTabs } from '../tabs/DocumentTabsProvider';
import { documentTabsScope } from '../tabs/DocumentTabStrip';
import { getItemTabPanelId } from '@nevo/ui';
import type { DocumentOperation } from '../explorer/DocumentsExplorer';
import type { NewDocumentEntry } from '../explorer/useDocumentOperations';
import { documentKeys, documentTreeKeys } from '../read-model/queries';
import {
  followedDocuments,
  followedDraftRevision,
  treeWithFollowed,
  type FollowedDocument,
} from './documentIdFollow';
import { useDocumentSaveOwner } from '../editor/DocumentEditorProvider';

/**
 * The pending save that blocks an operation able to change document ids (classify, rename, move of
 * a document, rename or move of a folder and so of the documents in it), if any.
 */
export function pendingSaveOf(
  operation: DocumentOperation,
  tree: DocumentTree | undefined,
  pendingOf: (id: string) => 'saving' | 'recovery' | undefined,
): 'saving' | 'recovery' | undefined {
  if (operation.action === 'delete') return undefined;
  const ids =
    operation.kind === 'document'
      ? operation.documentId
        ? [operation.documentId]
        : []
      : (tree?.documents ?? [])
          .filter((document) =>
            document.path.toLowerCase().startsWith((operation.path ?? '').toLowerCase() + '/'),
          )
          .map((document) => document.id);
  const states = ids.map(pendingOf);
  return states.includes('recovery')
    ? 'recovery'
    : states.includes('saving')
      ? 'saving'
      : undefined;
}

/**
 * Moves focus into a tab's panel once it is rendered: the source editor of a new document, else the
 * panel itself. Gives up after a few frames (the route may have moved on meanwhile).
 */
function focusTabPanel(id: string, attempts = 30) {
  const panel = globalThis.document.getElementById(getItemTabPanelId(documentTabsScope, id));
  const target = panel?.querySelector<HTMLElement>('[contenteditable="true"], [tabindex="0"]');
  if (target) target.focus();
  else if (attempts > 0) requestAnimationFrame(() => focusTabPanel(id, attempts - 1));
}

/** Follow-up work after a confirmed mutation; its failure never reaches the mutation's caller. */
const noop = () => undefined;
const settleFollowUp = (work: Promise<unknown>) => work.then(noop, noop);
/**
 * A coded answer is the server's definite refusal: its operation id must not be replayed, except
 * `DOCUMENT_RECOVERY_REQUIRED`, which is resumed with the same operation id.
 */
const definiteRefusal = (error: unknown) => {
  const code = apiErrorCode(error);
  return Boolean(code) && code !== 'DOCUMENT_RECOVERY_REQUIRED';
};

export interface DocumentTreeOperations {
  /** A tree operation is in flight (or unconfirmed): leaving the page is blocked meanwhile. */
  busy: boolean;
  setBusy: (busy: boolean) => void;
  /** Adds files and folders; a new document, or the first imported file, opens as a new tab. */
  add: (documents: NewDocumentEntry[], folders?: string[]) => Promise<void>;
  /**
   * Renames, moves, deletes or classifies; deleting a document closes its tab (no second question).
   * A document whose id changes keeps its tab, draft and position, and the route follows it.
   */
  operate: (operation: DocumentOperation) => Promise<DocumentOperationResult>;
  /** Reads the tree (and what depends on it) again. */
  refresh: () => Promise<unknown>;
}

/**
 * Sends the Documents tree's changes to the Runtime and reconciles what depends on them: the
 * cached tree, the drafts of changed documents and the document that is open. Requests are
 * retained by body, so an unconfirmed operation is retried with the same `operationId`.
 */
export function useDocumentTreeOperations(options: { specId: string }): DocumentTreeOperations {
  const { specId } = options;
  const { documentApi } = useAppServices();
  const { api: documentsApi } = useDocumentsApi();
  const catalogue = useDocumentCatalogue();
  const drafts = useDocumentDraftStore();
  const saves = useDocumentSaveOwner();
  const cache = useQueryClient();
  const tabs = useDocumentTabs();
  const [busy, setBusy] = useState(false);
  // What the operation decided for the tabs; applied once the tree is idle again.
  const [followUp, setFollowUp] = useState<{
    show?: string;
    /** A new document: focus moves into its tab (the editor) once shown. */
    focus?: boolean;
    removed?: readonly string[];
  }>();
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
      if (followUp.show) {
        await tabs.show(followUp.show);
        if (followUp.focus) focusTabPanel(followUp.show);
      }
    })();
  }, [followUp, busy, tabs]);

  const refresh = () => cache.invalidateQueries({ queryKey: ['specifications', specId] });
  const add: DocumentTreeOperations['add'] = async (documents, folders = []) => {
    // A template is rendered from the catalogue the chooser showed: its revision is the precondition
    // (`CATALOGUE_STALE` when the definitions changed since).
    const templated = documents.some((entry) => 'templateId' in entry && entry.templateId);
    const catalogueRevision = templated ? catalogue.data?.revision : undefined;
    const result = await sendRetained(
      importAttempt,
      { documents, folders, ...(catalogueRevision ? { catalogueRevision } : {}) },
      (input) => documentsApi.addDocuments(specId, input),
      'operationId',
      definiteRefusal,
    );
    // The mutation is confirmed from here on: nothing below may turn it into an uncertain outcome
    // (a retry would POST again with a new operation id). The follow-up is best effort.
    await settleFollowUp(refresh());
    // A new document (empty, or from its type's template) opens in edit; an import opens its first
    // file in preview.
    const first = documents[0];
    const blank =
      documents.length === 1 &&
      first !== undefined &&
      ('templateId' in first || first.content === '');
    const id = documents.length > 0 ? result.documents[0]?.id : undefined;
    if (id) {
      await settleFollowUp(
        documentApi.getDocument(specId, id).then((record) => {
          cache.setQueryData(documentKeys.detail(specId, id), record);
          drafts.set(specId, id, { ...draftFor(record), editing: blank });
        }),
      );
      // Without the prefetched record the document route loads (and reports) it itself.
      setFollowUp({ show: id, focus: blank });
    }
  };
  /**
   * Moves what belongs to a document to its new id: the draft (unsaved changes survive), the
   * reading position, the cached record and tree entry (so nothing flashes as missing), then the
   * tab in place and the route (replaced, not pushed).
   */
  const follow = async (
    moves: readonly FollowedDocument[],
    revisionBefore: (id: string) => string | undefined,
  ) => {
    for (const move of moves) {
      const draft = drafts.get(specId, move.from);
      if (draft) {
        drafts.set(specId, move.to, {
          ...draft,
          revision: followedDraftRevision(draft.revision, revisionBefore(move.from), move.revision),
        });
        drafts.remove(specId, move.from);
      }
      // A refused or unfinished save (conflict, recovery) belongs to the document, not to its id.
      saves.follow(move.from, move.to);
      const anchor = drafts.getAnchor(specId, move.from);
      if (anchor) drafts.setAnchor(specId, move.to, anchor);
      // Nothing stays under the old id: a file created later at the old path starts clean.
      drafts.removeAnchor(specId, move.from);
      const record = cache.getQueryData<DocumentContent>(documentKeys.detail(specId, move.from));
      if (record)
        cache.setQueryData<DocumentContent>(documentKeys.detail(specId, move.to), {
          ...record,
          id: move.to,
          path: move.path,
          revision: move.revision,
          ...(move.type ? { type: move.type, classification: 'registered' as const } : {}),
        });
    }
    cache.setQueryData<DocumentTree>(documentTreeKeys.tree(specId), (tree) =>
      tree ? treeWithFollowed(tree, moves) : tree,
    );
    for (const move of moves) await tabs.follow(move.from, move.to);
    // Once the route has moved on, the old id's cached record goes (any revision).
    for (const move of moves)
      cache.removeQueries({ queryKey: documentKeys.detail(specId, move.from).slice(0, 4) });
  };

  const operate: DocumentTreeOperations['operate'] = async (operation) => {
    const before = cache.getQueryData<DocumentTree>(documentTreeKeys.tree(specId));
    // An operation that may give a document a new id waits for that document's save: a running
    // save would settle under the old id, a save to resume would be replayed under the new one.
    const pending = pendingSaveOf(operation, before, saves.pendingOf);
    if (pending)
      throw new ApiError({
        kind: 'conflict',
        operation: 'documents.operate',
        outcome: 'not-applied',
        retryable: true,
        code: pending === 'recovery' ? 'document-save-to-resume' : 'document-save-running',
      });
    const result = await sendRetained(
      operationAttempt,
      operation,
      (input) => documentsApi.operateDocument(specId, input),
      'operationId',
      definiteRefusal,
    );
    for (const removed of result.removedDocumentIds) drafts.remove(specId, removed);
    const moves = followedDocuments(before, operation, result);
    // The revision each document had when the operation started: the one it names for a document
    // target, the tree's for the documents of a folder.
    const revisionBefore = (id: string) =>
      operation.kind === 'document' && operation.documentId === id
        ? operation.expectedRevision
        : before?.documents.find((item) => item.id === id)?.revision;
    for (const record of result.documents)
      drafts.update(specId, record.id, (draft) =>
        draft
          ? {
              ...draft,
              revision: followedDraftRevision(
                draft.revision,
                revisionBefore(record.id),
                record.revision,
              ),
            }
          : undefined,
      );
    if (moves.length > 0) await settleFollowUp(follow(moves, revisionBefore));
    await settleFollowUp(refresh());
    if (result.removedDocumentIds.length > 0) setFollowUp({ removed: result.removedDocumentIds });
    return result;
  };
  return { busy, setBusy, add, operate, refresh };
}
