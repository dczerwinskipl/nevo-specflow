import type {
  DocumentOperationInput,
  DocumentTree as Tree,
} from '@nevo/specflow-contracts/documents';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { isHttpClientError } from '@nevo/http-client';
import { useMessage } from '../../../i18n/message';
import { apiErrorCode } from '../../../shared/http/apiErrorCode';
import { planImport } from './documentImport';
import { joinDocumentPath, type PlannedDocument } from './documentTreePolicy';
import type { InlineEntry } from './inlineEntry';
import { createOperationLock } from './operationLock';

/** An operation as the explorer asks for it; the owner adds the `operationId`. */
export type DocumentOperation = Omit<DocumentOperationInput, 'operationId'>;

/** A move or delete the user asked for; it runs once confirmed in its dialog. */
export interface DocumentDialogRequest {
  action: 'move' | 'delete';
  kind: 'document' | 'folder';
  id?: string;
  path: string;
  expectedRevision: string;
}

/** What the Runtime did with a submitted entry; a message is already translated for the reader. */
export type EntryOutcome = { ok: true } | { ok: false; message: string };

export interface UseDocumentOperationsOptions {
  tree: Tree;
  onAdd: (documents: PlannedDocument[], folders?: string[]) => Promise<void>;
  onOperate: (input: DocumentOperation) => Promise<void>;
  /** Runs before a user action (for example saves or discards the open draft); false cancels it. */
  beforeAction?: () => Promise<Tree | false>;
  onBusyChange?: (busy: boolean) => void;
}

export interface DocumentOperationsState {
  /** An operation is in flight. */
  busy: boolean;
  /** The last operation's outcome is unknown: only checking it again is allowed. */
  unknown: boolean;
  /** Failure of the last operation, shown where it was started. */
  error: string;
  /** Polite confirmation of the last operation. */
  notice: string;
  /** Files of an unconfirmed import, kept so the same import can be retried. */
  retry: PlannedDocument[];
}

export interface DocumentOperationsActions {
  /** Checks the tree and runs `action` with a fresh snapshot, unless an operation blocks it. */
  guard: (action: (snapshot: Tree) => void) => Promise<void>;
  /** A selection is allowed right now. */
  canSelect: () => boolean;
  /** An operation is in flight (read synchronously by event handlers). */
  isBusy: () => boolean;
  /** The outcome of an operation is unknown (read synchronously by event handlers). */
  isUnknown: () => boolean;
  /** Creates or renames. `settle` runs before the busy state is released. */
  submitEntry: (
    entry: InlineEntry,
    finalName: string,
    settle: (outcome: EntryOutcome) => void,
  ) => Promise<void>;
  /** Validates and imports files into `folder`. */
  importFiles: (files: File[], folder: string) => Promise<void>;
  /** Repeats the unconfirmed import with the same files. */
  retryImport: () => void;
  /** Confirms a move or delete; `onDone` runs when it succeeded. */
  confirmDialog: (
    request: DocumentDialogRequest,
    target: string,
    onDone: () => void,
  ) => Promise<void>;
}

export interface DocumentOperationsModel {
  state: DocumentOperationsState;
  actions: DocumentOperationsActions;
}

/** A failure without an HTTP status never proves the server did not apply the request. */
const outcomeUnknown = (error: unknown) => !isHttpClientError(error) || error.status === undefined;

/**
 * Runs the tree's create / rename / import / move / delete operations through the owner's
 * callbacks and keeps their lifecycle: one operation in flight, an unknown outcome that blocks
 * everything else until it is retried, and the message to show. The hook knows nothing about the
 * rows or the inline input.
 */
export function useDocumentOperations(
  options: UseDocumentOperationsOptions,
): DocumentOperationsModel {
  const { tree, onAdd, onOperate, beforeAction, onBusyChange } = options;
  const { t } = useTranslation();
  const text = useMessage();
  const [lock] = useState(createOperationLock);
  const [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [retry, setRetry] = useState<PlannedDocument[]>([]);

  const markBusy = (value: boolean) => {
    lock.setBusy(value);
    setBusy(value);
    onBusyChange?.(value || lock.unknown);
  };
  const setRecovery = (value: boolean) => {
    lock.setUnknown(value);
    setUnknown(value);
  };

  const guard: DocumentOperationsActions['guard'] = async (action) => {
    if (!lock.canBegin()) return;
    lock.setChecking(true);
    try {
      const snapshot = beforeAction ? await beforeAction() : tree;
      if (!snapshot) return;
      setError('');
      action(snapshot);
    } catch {
      setError(t('documents.tree.checkFailed'));
    } finally {
      lock.setChecking(false);
    }
  };

  const submitEntry: DocumentOperationsActions['submitEntry'] = async (
    entry,
    finalName,
    settle,
  ) => {
    markBusy(true);
    try {
      if (entry.rename)
        await onOperate({
          action: 'rename',
          kind: entry.kind,
          ...(entry.kind === 'document'
            ? { documentId: entry.rename.id }
            : { path: entry.rename.path }),
          name: finalName,
          expectedRevision: entry.expectedRevision!,
        });
      else {
        const path = joinDocumentPath(entry.parent, finalName);
        await onAdd(
          entry.kind === 'document' ? [{ path, content: '' }] : [],
          entry.kind === 'folder' ? [path] : [],
        );
      }
      setRecovery(false);
      settle({ ok: true });
      setNotice(
        entry.rename
          ? t('documents.tree.renamed')
          : entry.kind === 'folder'
            ? t('documents.tree.folderAdded')
            : t('documents.tree.fileAdded'),
      );
    } catch (failure) {
      setRecovery(outcomeUnknown(failure));
      settle({
        ok: false,
        message: outcomeUnknown(failure)
          ? t('documents.tree.unconfirmedRename')
          : documentMutationError(failure, t),
      });
    } finally {
      markBusy(false);
    }
  };

  const importFiles: DocumentOperationsActions['importFiles'] = async (files, folder) => {
    if (lock.busy) return;
    markBusy(true);
    setError('');
    setNotice('');
    setRetry([]);
    let accepted: PlannedDocument[] = [];
    try {
      const plan = await planImport(files, folder, tree);
      accepted = plan.accepted;
      const skipped = plan.skipped.map(({ name, reason }) =>
        t('documents.tree.skippedItem', { name, reason: text(reason) }),
      );
      if (accepted.length) await onAdd(accepted);
      setRecovery(false);
      setNotice(
        skipped.length
          ? t('documents.tree.uploadSkipped', {
              count: accepted.length,
              skipped: skipped.join('; '),
            })
          : t('documents.tree.uploadDone', { count: accepted.length }),
      );
    } catch (failure) {
      setRecovery(outcomeUnknown(failure));
      if (outcomeUnknown(failure)) {
        setRetry(accepted);
        setError(t('documents.tree.importUnconfirmed'));
      } else {
        // A definite answer: the same batch would be rejected again, so no retry is offered.
        setError(t('documents.tree.importRejected', { reason: documentMutationError(failure, t) }));
      }
    } finally {
      markBusy(false);
    }
  };

  const retryImport = () => {
    markBusy(true);
    void onAdd(retry)
      .then(() => {
        setRecovery(false);
        setRetry([]);
        setError('');
        setNotice(t('documents.tree.importDone'));
      })
      .catch(() => setError(t('documents.tree.importStillUnconfirmed')))
      .finally(() => markBusy(false));
  };

  const confirmDialog: DocumentOperationsActions['confirmDialog'] = async (
    request,
    target,
    onDone,
  ) => {
    if (lock.busy) return;
    markBusy(true);
    setError('');
    try {
      await onOperate({
        action: request.action,
        kind: request.kind,
        ...(request.kind === 'document' ? { documentId: request.id } : { path: request.path }),
        ...(request.action === 'move' ? { targetFolder: target } : {}),
        expectedRevision: request.expectedRevision,
      });
      setRecovery(false);
      onDone();
      setNotice(
        request.action === 'delete' ? t('documents.tree.deleted') : t('documents.tree.moved'),
      );
    } catch (failure) {
      setRecovery(outcomeUnknown(failure));
      setError(
        outcomeUnknown(failure)
          ? t('documents.tree.unconfirmed')
          : documentMutationError(failure, t),
      );
    } finally {
      markBusy(false);
    }
  };

  return {
    state: { busy, unknown, error, notice, retry },
    actions: {
      guard,
      canSelect: lock.canSelect,
      isBusy: () => lock.busy,
      isUnknown: () => lock.unknown,
      submitEntry,
      importFiles,
      retryImport,
      confirmDialog,
    },
  };
}

/** Maps a Runtime error code to the explanation shown to the reader; the server text is never shown. */
export function documentMutationError(error: unknown, t: TFunction): string {
  switch (apiErrorCode(error)) {
    case 'DOCUMENT_PATH_CONFLICT':
      return t('documents.tree.error.pathConflict');
    case 'DOCUMENT_REVISION_CONFLICT':
      return t('documents.tree.error.revisionConflict');
    case 'DOCUMENT_PROTECTED':
      return t('documents.tree.error.required');
    case 'DOCUMENT_OPERATION_CONFLICT':
      return t('documents.tree.error.requestConflict');
    default:
      return t('documents.tree.error.default');
  }
}
