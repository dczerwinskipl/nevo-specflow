import type {
  ActionReason,
  CreateDocumentsInput,
  DocumentOperationInput,
  DocumentOperationResult,
  DocumentTree as Tree,
} from '@nevo/specflow-contracts/documents';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { isHttpClientError } from '@nevo/http-client';
import { translateMessage, useMessage } from '../../../i18n/message';
import { apiErrorCode } from '../../../shared/http/apiErrorCode';
import { writeRetention } from '../writeRetention';
import { useNotify } from '../../../shared/notifications/notifications';
import { reasonFragment } from '../catalogue/documentTypePolicy';
import { planImport } from './documentImport';
import { joinDocumentPath, type PlannedDocument } from './documentTreePolicy';
import type { InlineEntry } from './inlineEntry';
import { createOperationLock } from './operationLock';

/** An operation as the explorer asks for it; the owner adds the `operationId`. */
export type DocumentOperation = Omit<DocumentOperationInput, 'operationId'>;

/**
 * `keepDrafts`: the action never touches the content of an open document (create, classify,
 * remove a registration), so unsaved changes are kept and nobody is asked about them.
 */
export interface BeforeActionOptions {
  keepDrafts?: boolean;
}

/** One entry of a create request (a typed document from a template, or a file with content). */
export type NewDocumentEntry = CreateDocumentsInput['documents'][number];

/** What New document sends: the path, the type and the archetype's template for it. */
export interface NewDocumentInput {
  path: string;
  type?: string;
  templateId?: string;
  /** The type's title, for the confirmation toast ("<name> added (<type>)"). */
  title?: string;
}

/** How a dialog operation ended: a failure keeps the dialog (and may return focus to the name). */
export type TypeOperationOutcome = { ok: true } | { ok: false; focusName?: boolean };

/** A move, delete or registration removal the user asked for; it runs once confirmed. */
export interface DocumentDialogRequest {
  action: 'move' | 'delete' | 'remove-registration';
  kind: 'document' | 'folder';
  id?: string;
  path: string;
  expectedRevision: string;
}

/** What the Runtime did with a submitted entry; a message is already translated for the reader. */
export type EntryOutcome = { ok: true } | { ok: false; message: string };

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
 * The outcome may still change and only a replay of the same operation decides it: no answer at
 * all, or an answer `writeRetention` keeps for a replay (`DOCUMENT_WRITE_FAILED`). A classified
 * refusal before anything was sent (`not-applied`) is definite.
 */
const outcomeUnknown = (failure: unknown) => writeRetention(failure) === 'unknown';

const lastSegment = (path: string) => path.split('/').at(-1) ?? path;

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
  const text = useMessage();
  // A completed operation is confirmed by a toast (announced once); failures stay where they
  // were started.
  const notify = useNotify();
  const [lock] = useState(createOperationLock);
  const [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [error, setError] = useState(''),
    [retry, setRetry] = useState<PlannedDocument[]>([]),
    [resumable, setResumable] = useState(false);

  const markBusy = (value: boolean) => {
    lock.setBusy(value);
    setBusy(value);
    onBusyChange?.(value || lock.unknown);
  };

  const setRecovery = (value: boolean) => {
    lock.setUnknown(value);
    setUnknown(value);
  };

  /**
   * The bookkeeping of every failed operation: unknown outcome (locks the tree), resume offer and
   * the tree refetch the code calls for. Returns whether the outcome is unknown.
   */
  const settleFailure = (failure: unknown) => {
    const unknownOutcome = outcomeUnknown(failure);
    setRecovery(unknownOutcome);
    const code = apiErrorCode(failure);
    setResumable(writeRetention(failure) === 'recovery');
    if (code && refetchCodes.has(code)) {
      void onRefresh?.();
    }

    return unknownOutcome;
  };

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
      const unknownOutcome = settleFailure(failure);
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

  /**
   * An import that did not end with a definite answer keeps its files: no answer at all (the
   * Runtime may have applied it) or `DOCUMENT_RECOVERY_REQUIRED` (written, not committed). The same
   * files are sent again as the same retained request (same `operationId` and body). A definite
   * refusal drops them: the same batch would be refused again.
   */
  const failImport = (failure: unknown, files: PlannedDocument[], again: boolean) => {
    const unknownOutcome = outcomeUnknown(failure);
    const recovery = writeRetention(failure) === 'recovery';
    setRecovery(unknownOutcome);
    setResumable(recovery);
    if (unknownOutcome || recovery) {
      setRetry(files);
      setError(
        recovery
          ? t('documents.tree.error.recovery')
          : again
            ? t('documents.tree.importStillUnconfirmed')
            : t('documents.tree.importUnconfirmed'),
      );

      return;
    }

    setRetry([]);
    setError(t('documents.tree.importRejected', { reason: documentMutationError(failure, t) }));
  };

  const importFiles: DocumentOperationsActions['importFiles'] = async (files, folder) => {
    if (lock.busy) {
      return;
    }

    markBusy(true);
    setError('');
    setResumable(false);
    setRetry([]);
    let accepted: PlannedDocument[] = [];
    try {
      const plan = await planImport(files, folder, tree);
      accepted = plan.accepted;
      const skipped = plan.skipped.map(({ name, reason }) =>
        t('documents.tree.skippedItem', { name, reason: text(reason) }),
      );
      if (accepted.length) {
        await onAdd(accepted);
      }

      setRecovery(false);
      notify(
        skipped.length
          ? t('documents.tree.uploadSkipped', {
              count: accepted.length,
              skipped: skipped.join('; '),
            })
          : t('documents.tree.uploadDone', { count: accepted.length }),
      );
    } catch (failure) {
      failImport(failure, accepted, false);
    } finally {
      markBusy(false);
    }
  };

  const retryImport = () => {
    if (lock.busy) {
      return;
    }

    const files = retry;
    markBusy(true);
    void onAdd(files)
      .then(() => {
        setRecovery(false);
        setRetry([]);
        setResumable(false);
        setError('');
        notify(t('documents.tree.importDone'));
      })
      .catch((failure: unknown) => failImport(failure, files, true))
      .finally(() => markBusy(false));
  };

  const createDocument: DocumentOperationsActions['createDocument'] = async (input, onDone) => {
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

  const classify: DocumentOperationsActions['classify'] = async (request, type, title, onDone) => {
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

  const confirmDialog: DocumentOperationsActions['confirmDialog'] = async (
    request,
    target,
    onDone,
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

/** Refusals after which the tree is read again (it is stale, or the Specification is read-only now). */
const refetchCodes = new Set([
  'DOCUMENT_ALREADY_CLASSIFIED',
  'DOCUMENT_REVISION_CONFLICT',
  'BRANCH_PROTECTED',
  'COMMIT_BLOCKED',
  'GIT_POLICY_INVALID',
  'SPEC_ARCHIVED',
]);

/** The `details` of a refusal's error body, when it has any. */
function refusalDetails(error: unknown): { reason?: ActionReason; cause?: string } | undefined {
  return isHttpClientError(error) && typeof error.data === 'object' && error.data !== null
    ? (error.data as { details?: { reason?: ActionReason; cause?: string } }).details
    : undefined;
}

/** The reason a write refusal carries, else the one its code implies. */
export function refusalReason(error: unknown, code: string | undefined): ActionReason {
  const details = refusalDetails(error);
  if (details?.reason) {
    return details.reason;
  }

  switch (code) {
    case 'SPEC_ARCHIVED':
      return 'archived';
    case 'COMMIT_BLOCKED':
      return 'commit-blocked';
    case 'GIT_POLICY_INVALID':
      return 'git-policy-invalid';
    default:
      return 'branch-protected';
  }
}

/** Maps a Runtime error code to the explanation shown to the reader; the server text is never shown. */
export function documentMutationError(error: unknown, t: TFunction): string {
  const code = apiErrorCode(error);
  switch (code) {
    case 'DOCUMENT_PATH_CONFLICT':
      return t('documents.tree.error.pathConflict');
    case 'DOCUMENT_PATH_INVALID':
      return t('documents.tree.error.pathInvalid');
    case 'DOCUMENT_REVISION_CONFLICT':
      return t('documents.tree.error.revisionConflict');
    case 'DOCUMENT_ALREADY_CLASSIFIED':
      return t('documents.tree.error.alreadyClassified');
    case 'DOCUMENT_PROTECTED':
      return translateMessage(t, reasonFragment('protected'));
    case 'DOCUMENT_OPERATION_CONFLICT':
      return t('documents.tree.error.requestConflict');
    case 'SPEC_MANIFEST_DIRTY':
      return t('documents.tree.error.manifestDirty');
    case 'SPEC_BUSY':
      return t('documents.tree.error.busy');
    // The definitions changed since the chooser was shown (the template's catalogue revision).
    case 'CATALOGUE_STALE':
    case 'ARCHETYPE_UNKNOWN':
      return t('documents.tree.error.catalogueStale');
    case 'DOCUMENT_RECOVERY_REQUIRED':
      return t('documents.tree.error.recovery');
    // A file system that ignores letter case (Windows) cannot rename `bb.md` to `Bb.md`; the
    // Runtime decides, the UI does not know the platform.
    case 'DOCUMENT_OPERATION_INVALID':
      return refusalDetails(error)?.cause === 'case-only-rename'
        ? t('documents.tree.error.caseOnlyRename')
        : t('documents.tree.error.default');
    // The document has a save running or one to resume: the operation waits for it.
    case 'document-save-running':
      return t('documents.tree.error.saveRunning');
    case 'document-save-to-resume':
      return t('documents.tree.error.saveToResume');
    case 'document-save-unconfirmed':
      return t('documents.tree.error.saveUnconfirmed');
    case 'BRANCH_PROTECTED':
    case 'COMMIT_BLOCKED':
    case 'GIT_POLICY_INVALID':
    case 'SPEC_ARCHIVED':
      return t('documents.tree.error.refused', {
        reason: translateMessage(t, reasonFragment(refusalReason(error, code))),
      });
    default:
      return t('documents.tree.error.default');
  }
}
