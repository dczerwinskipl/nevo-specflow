import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { folderOperationRevision } from '../tree/documentTreePolicy';
import type { DocumentOperationsActions, DocumentDialogRequest } from '../useDocumentOperations';
import type { useDialogFocus } from '../useDialogFocus';

// Opening these never changes an open document's text: its draft stays, nobody is asked.
const keepDrafts = { keepDrafts: true };

/**
 * The confirmation dialog of Move, Delete and Remove registration: the request that is open, the
 * move target, and running the confirmed operation. A request is built from a fresh snapshot, so
 * it carries the revision the Runtime will check.
 */
export function useOperationDialog(options: {
  operations: DocumentOperationsActions;
  dialogFocus: ReturnType<typeof useDialogFocus>;
  /** The tree key of the row that takes focus when `id` disappears. */
  rowAfter: (path: string, id: string) => string;
}) {
  const { operations, dialogFocus, rowAfter } = options;
  const { t } = useTranslation();
  const [request, setRequest] = useState<DocumentDialogRequest>();
  const [target, setTarget] = useState('');

  const ask =
    (action: 'move' | 'delete') => (kind: 'document' | 'folder', path: string, id?: string) =>
      void operations.guard((snapshot) => {
        const document =
          kind === 'document' ? snapshot.documents.find((doc) => doc.id === id) : undefined;
        // A document sends its own revision, a folder the FOLDER revision (never the tree's).
        const expectedRevision =
          kind === 'document' ? document?.revision : folderOperationRevision(snapshot, path);
        if (!expectedRevision) {
          if (kind === 'folder') {
            operations.refuse(t('documents.tree.error.folderRevisionMissing'));
          }

          return;
        }

        if (action === 'move') {
          setTarget('');
        }

        setRequest({ action, kind, path: document?.path ?? path, id, expectedRevision });
      });

  return {
    request,
    target,
    setTarget,
    move: ask('move'),
    remove: ask('delete'),
    removeRegistration: (id: string) =>
      void operations.guard((snapshot) => {
        const entry = snapshot.dangling.find((candidate) => candidate.id === id);
        if (!entry?.actions.delete.available) {
          return;
        }

        dialogFocus.rememberOpener();
        operations.clearError();
        // A dangling entry has no revision of its own: the tree revision guards it.
        setRequest({
          action: 'remove-registration',
          kind: 'document',
          id,
          path: entry.path,
          expectedRevision: snapshot.revision,
        });
      }, keepDrafts),
    confirm: () => {
      if (!request) {
        return;
      }

      const after =
        request.action === 'remove-registration' && request.id
          ? rowAfter(request.path, request.id)
          : undefined;
      void operations.confirmDialog(request, target, () => {
        // The result decides where focus goes (the next row), not the opener.
        if (after) {
          dialogFocus.focusResult(after);
        }

        setRequest(undefined);
      });
    },
    close: () => {
      operations.clearError();
      setRequest(undefined);
    },
  };
}
