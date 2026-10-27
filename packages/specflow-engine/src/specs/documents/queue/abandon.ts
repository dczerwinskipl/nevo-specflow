import type { ResolvedProjectHome } from '../../../project/home/home';
import { withJournalLock } from '../../durable';
import { documentChangeError } from '../changes/errors';
import type { DocumentBatchRecord, DocumentChangeJournal } from '../changes/journal';
import { nodeDocumentFileOps } from '../write/file-effects';
import {
  findDocumentChangeJournal,
  readDocumentChangeJournal,
  settleDocumentChangeJournal,
} from '../write/journal-store';
import { cleanStageFiles } from '../write/write-phase';
import {
  DOCUMENT_BATCH_KIND,
  publishDocumentBatch,
  readDocumentBatch,
  removeDocumentBatch,
  transitionDocumentBatch,
} from './batch-store';
import { removeQueueLeaseOf } from './lease';
import { DISSOLVED_BY_ABANDON, reconcileBatchMembers } from './settlement';
import {
  UNCOMMITTED_ABANDONED,
  completeUncommitted,
  planOfJournal,
  type UncommittedHooks,
} from './uncommitted';

/**
 * Abandoning a commit (ADR 0016 decision 15, unified with auto-commit-off by ADR 0018 decision 5).
 *
 * `abandon` keeps the files exactly as they are on disk. The operation (and every operation of its
 * batch, which share one commit) ends `completed` with the outcome `uncommitted` and the reason
 * `abandoned`: its paths are recorded in the uncommitted-changes ledger first, then its claim is
 * released. The ledger, not a journal, is the marker that the files are not in Git; it ends when a
 * commit holds the paths (a later batch, a manual commit or a hand commit).
 */

const ABANDONABLE: readonly DocumentChangeJournal['stage'][] = [
  'commit-failed',
  'recovery-required',
];

/**
 * An operation that waits for its next attempt after a failed one (a Git outage keeps it queued, with
 * the reason of the failure and no batch): the person may give up on it like on a failed commit.
 */
function isWaitingAfterFailure(journal: DocumentChangeJournal): boolean {
  return journal.stage === 'queued' && journal.commit !== undefined && journal.reason !== undefined;
}

/** Whether the operation already ended as an abandoned one (a repeat finds it so). */
export function isAbandonedJournal(journal: DocumentChangeJournal): boolean {
  return (
    journal.stage === 'completed' &&
    journal.outcome === 'uncommitted' &&
    journal.reason === UNCOMMITTED_ABANDONED
  );
}

/** Stage and backup files an operation may have left next to its documents. */
async function cleanLeftovers(
  context: ResolvedProjectHome,
  journals: readonly DocumentChangeJournal[],
): Promise<void> {
  for (const journal of journals) {
    try {
      await cleanStageFiles(
        { files: nodeDocumentFileOps },
        journal,
        await planOfJournal(context, journal),
      );
    } catch {
      // Housekeeping only: the abandon has happened.
    }
  }
}

/**
 * Abandons the operation and the batch it belongs to. Allowed for `commit-failed` and
 * `recovery-required` (commit phase); any other state is `operation-state-invalid`. The batch record
 * is dissolved first (it is the commit point), then each member records its paths in the ledger and
 * completes, all in the control-lock section of the abandon. The completed journals move to `settled/`
 * afterwards. A repeat returns the operation as it ended. An operation that waits queued after a failed
 * attempt (a Git outage) is abandoned on its own, without a batch.
 */
export async function abandonCommit(
  context: ResolvedProjectHome,
  operationId: string,
  now: () => string,
  hooks: UncommittedHooks = {},
): Promise<readonly DocumentChangeJournal[]> {
  const ended = await withJournalLock(context, DOCUMENT_BATCH_KIND, async () => {
    const journal = await readDocumentChangeJournal(context, operationId);
    if (journal === undefined) {
      // A settled operation: an abandoned one is the answer of a repeat, any other cannot be abandoned.
      const settled = await findDocumentChangeJournal(context, operationId);
      if (settled !== undefined && isAbandonedJournal(settled)) return [settled];
      if (settled !== undefined) {
        throw documentChangeError(
          'operation-state-invalid',
          'Only a failed commit or one that needs recovery can be abandoned.',
        );
      }
      throw documentChangeError('operation-not-found', 'The document operation does not exist.');
    }
    if (isAbandonedJournal(journal)) return [journal];
    if (
      !isWaitingAfterFailure(journal) &&
      (!ABANDONABLE.includes(journal.stage) || journal.recoveryPhase === 'write')
    ) {
      throw documentChangeError(
        'operation-state-invalid',
        'Only a failed commit or one that needs recovery can be abandoned.',
      );
    }
    const stamp = now();
    const batch =
      journal.batchId !== undefined ? await readDocumentBatch(context, journal.batchId) : undefined;
    // A repeat after a stop finds the batch already dissolved by an abandon: it only finishes the members.
    const dissolvedByAbandon =
      batch?.state === 'dissolved' && batch.reason === DISSOLVED_BY_ABANDON;
    if (
      batch !== undefined &&
      (batch.state === 'failed' || batch.state === 'recovery-required' || dissolvedByAbandon)
    ) {
      const dissolved = dissolvedByAbandon
        ? batch
        : transitionDocumentBatch(
            context,
            batch,
            'dissolved',
            { reason: DISSOLVED_BY_ABANDON },
            stamp,
          );
      if (!dissolvedByAbandon) await publishDocumentBatch(context, dissolved);
      await reconcileBatchMembers(context, dissolved, stamp, undefined, hooks);
      await removeDocumentBatch(context, batch.operationId);
      await removeQueueLeaseOf(context, batch.workspaceId, batch.operationId).catch(
        () => undefined,
      );
      return collect(context, batch);
    }
    await completeUncommitted(context, journal, batch?.parentHead, stamp, hooks);
    return [(await readDocumentChangeJournal(context, operationId))!];
  });
  const result: DocumentChangeJournal[] = [];
  for (const journal of ended) {
    if (journal.stage === 'completed') {
      await settleDocumentChangeJournal(context, journal.operationId);
    }
    result.push((await findDocumentChangeJournal(context, journal.operationId)) ?? journal);
  }
  await cleanLeftovers(context, result);
  return result;
}

async function collect(
  context: ResolvedProjectHome,
  batch: DocumentBatchRecord,
): Promise<DocumentChangeJournal[]> {
  const journals: DocumentChangeJournal[] = [];
  for (const id of batch.memberIds) {
    const journal = await readDocumentChangeJournal(context, id);
    if (journal !== undefined) journals.push(journal);
  }
  return journals;
}
