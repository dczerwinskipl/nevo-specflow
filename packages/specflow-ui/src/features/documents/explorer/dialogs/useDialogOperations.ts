import type {
  DocumentOperationResult,
  DocumentTree as Tree,
} from '@nevo/specflow-contracts/documents';
import { useTranslation } from 'react-i18next';
import { apiErrorCode } from '../../../../shared/http/apiErrorCode';
import { useNotify } from '../../../../shared/notifications/notifications';
import { documentMutationError } from '../../mutationErrors';
import type { OperationLifecycle } from '../operationLifecycle';
import type {
  DocumentDialogRequest,
  DocumentOperation,
  NewDocumentEntry,
  NewDocumentInput,
  TypeOperationOutcome,
} from '../operationTypes';

const lastSegment = (path: string) => path.split('/').at(-1) ?? path;

/**
 * The operations the dialogs confirm: New document, Assign type, and Move / Delete / Remove
 * registration. A failure keeps the dialog open and is shown in it.
 */
export function useDialogOperations(options: {
  tree: Tree;
  onAdd: (documents: NewDocumentEntry[], folders?: string[]) => Promise<void>;
  onOperate: (input: DocumentOperation) => Promise<DocumentOperationResult | void>;
  lifecycle: OperationLifecycle;
}) {
  const { tree, onAdd, onOperate, lifecycle } = options;
  const { lock, markBusy, setRecovery, setError, setResumable, settleFailure } = lifecycle;
  const { t } = useTranslation();
  const notify = useNotify();

  /** Reports a failed dialog operation: message, resume offer and the follow-up the code calls for. */
  const fail = (failure: unknown): TypeOperationOutcome => {
    const unknownOutcome = settleFailure(failure);
    const code = apiErrorCode(failure);
    setError(unknownOutcome ? t('documents.tree.unconfirmed') : documentMutationError(failure, t));

    return {
      ok: false,
      focusName: code === 'DOCUMENT_PATH_CONFLICT' || code === 'DOCUMENT_PATH_INVALID',
    };
  };

  /** Creates one document from New document; `onDone` runs when it succeeded. */
  const createDocument = async (
    input: NewDocumentInput,
    onDone: () => void,
  ): Promise<TypeOperationOutcome> => {
    if (lock.busy) {
      return { ok: false };
    }

    markBusy(true);
    setError('');
    setResumable(false);
    try {
      const type = input.type ? { type: input.type } : {};
      const entry: NewDocumentEntry = input.templateId
        ? { path: input.path, ...type, templateId: input.templateId }
        : { path: input.path, ...type, content: '' };
      await onAdd([entry]);
      setRecovery(false);
      onDone();
      notify(
        input.title
          ? t('documents.newDocument.created', { name: lastSegment(input.path), type: input.title })
          : t('documents.tree.fileAdded', { name: lastSegment(input.path) }),
      );

      return { ok: true };
    } catch (failure) {
      return fail(failure);
    } finally {
      markBusy(false);
    }
  };

  /** Assigns a type to an unclassified document; `onDone` gets the document's new id. */
  const classify = async (
    request: { id: string; expectedRevision: string },
    type: string,
    title: string,
    onDone: (id: string | undefined) => void,
  ): Promise<TypeOperationOutcome> => {
    if (lock.busy) {
      return { ok: false };
    }

    markBusy(true);
    setError('');
    setResumable(false);
    try {
      const result = await onOperate({
        action: 'classify',
        kind: 'document',
        documentId: request.id,
        type,
        expectedRevision: request.expectedRevision,
      });
      setRecovery(false);
      const name = tree.documents
        .find((doc) => doc.id === request.id)
        ?.path.split('/')
        .at(-1);
      onDone(result ? result.documents[0]?.id : undefined);
      notify(t('documents.classify.done', { name: name ?? request.id, type: title }));

      return { ok: true };
    } catch (failure) {
      return fail(failure);
    } finally {
      markBusy(false);
    }
  };

  /** Confirms a move, delete or registration removal; `onDone` runs when it succeeded. */
  const confirmDialog = async (
    request: DocumentDialogRequest,
    target: string,
    onDone: () => void,
  ) => {
    if (lock.busy) {
      return;
    }

    markBusy(true);
    setError('');
    setResumable(false);
    try {
      await onOperate({
        // Removing a registration is the `delete` of a dangling entry.
        action: request.action === 'remove-registration' ? 'delete' : request.action,
        kind: request.kind,
        ...(request.kind === 'document' ? { documentId: request.id } : { path: request.path }),
        ...(request.action === 'move' ? { targetFolder: target } : {}),
        expectedRevision: request.expectedRevision,
      });
      setRecovery(false);
      onDone();
      const name = lastSegment(request.path);
      notify(
        request.action === 'remove-registration'
          ? t('documents.tree.registrationRemoved', { name })
          : request.action === 'delete'
            ? t('documents.tree.deleted', { name })
            : t('documents.tree.moved', { name }),
      );
    } catch (failure) {
      fail(failure);
    } finally {
      markBusy(false);
    }
  };

  return { createDocument, classify, confirmDialog };
}
