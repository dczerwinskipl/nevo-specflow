import type {
  DocumentOperationResult,
  DocumentTree as Tree,
} from '@nevo/specflow-contracts/documents';
import { useTranslation } from 'react-i18next';
import { useNotify } from '../../../shared/notifications/notifications';
import { documentMutationError } from '../mutationErrors';
import { useDialogOperations } from './dialogs/useDialogOperations';
import { useDocumentImport } from './import/useDocumentImport';
import type { InlineEntry } from './inline-entry/inlineEntry';
import { useOperationLifecycle } from './operationLifecycle';
import type {
  BeforeActionOptions,
  DocumentDialogRequest,
  DocumentOperation,
  EntryOutcome,
  NewDocumentEntry,
  NewDocumentInput,
  TypeOperationOutcome,
} from './operationTypes';
import { joinDocumentPath, type PlannedDocument } from './tree/documentTreePolicy';

export type {
  BeforeActionOptions,
  DocumentDialogRequest,
  DocumentOperation,
  EntryOutcome,
  NewDocumentEntry,
  NewDocumentInput,
  TypeOperationOutcome,
} from './operationTypes';

export interface UseDocumentOperationsOptions {
  tree: Tree;
  onAdd: (documents: NewDocumentEntry[], folders?: string[]) => Promise<void>;
  onOperate: (input: DocumentOperation) => Promise<DocumentOperationResult | void>;
  /** Reads the tree again (after a refusal that means the tree is stale or read-only now). */
  onRefresh?: () => Promise<unknown>;
  /** Runs before a user action (for example saves or discards the open draft); false cancels it. */
  beforeAction?: (options?: BeforeActionOptions) => Promise<Tree | false>;
  onBusyChange?: (busy: boolean) => void;
}

export interface DocumentOperationsState {
  /** An operation is in flight. */
  busy: boolean;
  /** The last operation's outcome is unknown: only checking it again is allowed. */
  unknown: boolean;
  /** Failure of the last operation, shown where it was started. */
  error: string;
  /** Files of an unconfirmed import, kept so the same import can be retried. */
  retry: PlannedDocument[];
  /** The last failure can be resumed with the same operation (`DOCUMENT_RECOVERY_REQUIRED`). */
  resumable: boolean;
}

export interface DocumentOperationsActions {
  /** Checks the tree and runs `action` with a fresh snapshot, unless an operation blocks it. */
  guard: (action: (snapshot: Tree) => void, options?: BeforeActionOptions) => Promise<void>;
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
  /** Repeats the unconfirmed (or written but uncommitted) import with the same files. */
  retryImport: () => void;
  /** Creates one document from New document; `onDone` runs when it succeeded. */
  createDocument: (input: NewDocumentInput, onDone: () => void) => Promise<TypeOperationOutcome>;
  /** Assigns a type to an unclassified document; `onDone` gets the document's new id. */
  classify: (
    request: { id: string; expectedRevision: string },
    type: string,
    title: string,
    onDone: (id: string | undefined) => void,
  ) => Promise<TypeOperationOutcome>;
  /** Clears the failure of a dialog that is closed or reopened. */
  clearError: () => void;
  /** Refuses an action before anything is sent, with the (translated) reason shown under the tree. */
  refuse: (message: string) => void;
  /** Confirms a move, delete or registration removal; `onDone` runs when it succeeded. */
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

/**
 * Runs the tree's create / rename / import / move / delete operations through the owner's
 * callbacks and keeps their lifecycle: one operation in flight, an unknown outcome that blocks
 * everything else until it is retried, and the message to show. The hook knows nothing about the
 * rows or the inline input.
 */
export function useDocumentOperations(
  options: UseDocumentOperationsOptions,
): DocumentOperationsModel {
  const { tree, onAdd, onOperate, onRefresh, beforeAction, onBusyChange } = options;
  const { t } = useTranslation();
  // A completed operation is confirmed by a toast (announced once); failures stay where they
  // were started.
  const notify = useNotify();
  const lifecycle = useOperationLifecycle({ onBusyChange, onRefresh });
  const { lock, busy, unknown, error, resumable, markBusy, setRecovery, setError, setResumable } =
    lifecycle;
  const { retry, importFiles, retryImport } = useDocumentImport({ tree, onAdd, lifecycle });
  const { createDocument, classify, confirmDialog } = useDialogOperations({
    tree,
    onAdd,
    onOperate,
    lifecycle,
  });

  const guard: DocumentOperationsActions['guard'] = async (action, guardOptions) => {
    if (!lock.canBegin()) {
      return;
    }

    lock.setChecking(true);
    try {
      const snapshot = beforeAction ? await beforeAction(guardOptions) : tree;
      if (!snapshot) {
        return;
      }

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
      if (entry.rename) {
        await onOperate({
          action: 'rename',
          kind: entry.kind,
          ...(entry.kind === 'document'
            ? { documentId: entry.rename.id }
            : { path: entry.rename.path }),
          name: finalName,
          expectedRevision: entry.expectedRevision!,
        });
      } else {
        const path = joinDocumentPath(entry.parent, finalName);
        await onAdd(
          entry.kind === 'document' ? [{ path, content: '' }] : [],
          entry.kind === 'folder' ? [path] : [],
        );
      }

      setRecovery(false);
      settle({ ok: true });
      notify(
        entry.rename
          ? t('documents.tree.renamed', { name: finalName })
          : entry.kind === 'folder'
            ? t('documents.tree.folderAdded', { name: finalName })
            : t('documents.tree.fileAdded', { name: finalName }),
      );
    } catch (failure) {
      const unknownOutcome = lifecycle.settleFailure(failure);
      settle({
        ok: false,
        message: unknownOutcome
          ? t('documents.tree.unconfirmedRename')
          : documentMutationError(failure, t),
      });
    } finally {
      markBusy(false);
    }
  };

  return {
    state: { busy, unknown, error, retry, resumable },
    actions: {
      guard,
      canSelect: lock.canSelect,
      isBusy: () => lock.busy,
      isUnknown: () => lock.unknown,
      submitEntry,
      importFiles,
      retryImport,
      createDocument,
      classify,
      clearError: () => {
        setError('');
        setResumable(false);
      },
      refuse: (message) => {
        setResumable(false);
        setError(message);
      },
      confirmDialog,
    },
  };
}
