import type { DocumentTree as Tree } from '@nevo/specflow-contracts/documents';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMessage } from '../../../../i18n/message';
import { useNotify } from '../../../../shared/notifications/notifications';
import { writeRetention } from '../../writeRetention';
import { documentMutationError } from '../../mutationErrors';
import type { NewDocumentEntry } from '../operationTypes';
import { outcomeUnknown, type OperationLifecycle } from '../operationLifecycle';
import type { PlannedDocument } from '../tree/documentTreePolicy';
import { planImport } from './documentImport';

/**
 * Uploading files into the tree. An import that did not end with a definite answer keeps its
 * files so the same import can be sent again.
 */
export function useDocumentImport(options: {
  tree: Tree;
  onAdd: (documents: NewDocumentEntry[], folders?: string[]) => Promise<void>;
  lifecycle: OperationLifecycle;
}) {
  const { tree, onAdd, lifecycle } = options;
  const { lock, markBusy, setRecovery, setError, setResumable } = lifecycle;
  const { t } = useTranslation();
  const text = useMessage();
  const notify = useNotify();
  /** Files of an unconfirmed import, kept so the same import can be retried. */
  const [retry, setRetry] = useState<PlannedDocument[]>([]);

  /**
   * No answer at all (the Runtime may have applied it) or `DOCUMENT_RECOVERY_REQUIRED` (written,
   * not committed) keeps the files: they are sent again as the same retained request (same
   * `operationId` and body). A definite refusal drops them: the same batch would be refused again.
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

  /** Validates and imports files into `folder`. */
  const importFiles = async (files: File[], folder: string) => {
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

  /** Repeats the unconfirmed (or written but uncommitted) import with the same files. */
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

  return { retry, importFiles, retryImport };
}
