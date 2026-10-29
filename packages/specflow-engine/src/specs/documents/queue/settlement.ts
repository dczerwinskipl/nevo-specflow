import type { ResolvedProjectHome } from '../../../project/home/home';
import { publishJournal } from '../../durable';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../changes/journal/kind';
import type { DocumentBatchRecord, DocumentChangeJournal } from '../changes/journal';
import { transitionDocumentChange, type DocumentChangeTransitionPatch } from '../changes/journal';
import { readDocumentChangeJournal } from '../write/journal-store';
import { countFailedAttempt, nextAttemptAt } from './backoff';
import { completeUncommitted, type UncommittedHooks } from './uncommitted';

/**
 * How the members of a batch follow its record. The batch record is the commit point of every
 * attempt: it moves first, the member journals move after it, one write each, and every function
 * here is idempotent, so a run that stopped between two writes is finished by the next run (it
 * reconciles the members from the record). Every function is called while the caller holds the
 * Project Home control lock.
 */

/** Moves one member journal (a pure transition, then an atomic publish). */
export async function moveMember(
  context: ResolvedProjectHome,
  journal: DocumentChangeJournal,
  to: DocumentChangeJournal['stage'],
  patch: DocumentChangeTransitionPatch,
  now: string,
): Promise<DocumentChangeJournal> {
  const next = transitionDocumentChange(journal, to, patch, now);
  await publishJournal(context, DOCUMENT_CHANGE_JOURNAL_KIND, next);

  return next;
}

/** A member that this batch holds: `committing` with the batch's id. */
export function holdsMember(journal: DocumentChangeJournal, batchId: string): boolean {
  return journal.stage === 'committing' && journal.batchId === batchId;
}

/** A member of this batch in one of the given stages. */
function owns(
  journal: DocumentChangeJournal,
  batchId: string,
  stages: readonly DocumentChangeJournal['stage'][],
): boolean {
  return journal.batchId === batchId && stages.includes(journal.stage);
}

/**
 * Why a batch record was dissolved without a failed attempt behind it. Any other `reason` on a
 * dissolved record is the failure that ended the attempt (the members wait and are tried again).
 */
export const DISSOLVED_BY_ABANDON = 'abandoned';
/** The original batch of a split: its members are re-sorted into a failed part and a rest. */
export const DISSOLVED_BY_SPLIT = 'split';

/**
 * Brings every member journal to the state the batch record implies:
 * - `committing`: a member still `queued` (the claim stopped half way) becomes `committing`;
 * - `committed`: members that are `committing` or `recovery-required` complete with the batch's commit;
 * - `dissolved`: by an abandon the members complete `uncommitted` (their paths go to the ledger first);
 *   by a split they go back to `queued`
 *   as they were; by a failed attempt they go back to `queued` with the attempt counted, the reason
 *   kept and the next attempt after the backoff; otherwise (a retry, a new overlapping operation, a
 *   recovery that found nothing committed) they go back to `queued` with the counter reset;
 * - `failed`: members that are `committing`, or `queued` (the failed part of a split), become
 *   `commit-failed`;
 * - `recovery-required`: members that are `committing` become `recovery-required` (commit phase).
 * Members that are settled already, or belong to another batch, are left alone.
 * Returns how many journals changed.
 */
export async function reconcileBatchMember(
  context: ResolvedProjectHome,
  batch: DocumentBatchRecord,
  memberId: string,
  now: string,
  hooks: UncommittedHooks = {},
): Promise<boolean> {
  const id = batch.operationId;
  {
    const journal = await readDocumentChangeJournal(context, memberId);
    if (journal === undefined) {
      return false;
    }

    let moved = false;
    switch (batch.state) {
      case 'committing':
        if (journal.stage === 'queued') {
          await moveMember(context, journal, 'committing', { batchId: id }, now);
          moved = true;
        }

        break;
      case 'committed':
        if (owns(journal, id, ['committing', 'recovery-required'])) {
          await moveMember(
            context,
            journal,
            'completed',
            {
              outcome: 'committed',
              ...(batch.sha !== undefined ? { sha: batch.sha } : {}),
              coalescedWith: batch.memberIds.length - 1,
            },
            now,
          );
          moved = true;
        }

        break;
      case 'dissolved':
        moved = await reconcileDissolved(context, batch, journal, now, hooks);
        break;
      case 'failed':
        if (owns(journal, id, ['committing']) || journal.stage === 'queued') {
          await moveMember(
            context,
            journal,
            'commit-failed',
            {
              reason: batch.reason ?? 'commit-failed',
              ...(batch.blockedBy !== undefined ? { blockedBy: batch.blockedBy } : {}),
            },
            now,
          );
          moved = true;
        }

        break;
      case 'recovery-required':
        if (owns(journal, id, ['committing'])) {
          await moveMember(
            context,
            journal,
            'recovery-required',
            {
              recoveryPhase: 'commit',
              reason: batch.reason ?? 'uncertain',
              ...(batch.blockedBy !== undefined ? { blockedBy: batch.blockedBy } : {}),
            },
            now,
          );
          moved = true;
        }

        break;
      case 'formed':
        break;
      default: {
        const exhaustive: never = batch.state;

        return exhaustive;
      }
    }

    return moved;
  }
}

export async function reconcileBatchMembers(
  context: ResolvedProjectHome,
  batch: DocumentBatchRecord,
  now: string,
  afterEach?: (changed: number) => Promise<void>,
  hooks: UncommittedHooks = {},
): Promise<number> {
  let changed = 0;
  for (const memberId of batch.memberIds) {
    if (await reconcileBatchMember(context, batch, memberId, now, hooks)) {
      changed += 1;
      await afterEach?.(changed);
    }
  }

  return changed;
}

async function reconcileDissolved(
  context: ResolvedProjectHome,
  batch: DocumentBatchRecord,
  journal: DocumentChangeJournal,
  now: string,
  hooks: UncommittedHooks,
): Promise<boolean> {
  const id = batch.operationId;
  if (batch.reason === DISSOLVED_BY_ABANDON) {
    if (!owns(journal, id, ['commit-failed', 'recovery-required'])) {
      return false;
    }

    await completeUncommitted(context, journal, batch.parentHead, now, hooks);

    return true;
  }

  if (batch.reason === DISSOLVED_BY_SPLIT) {
    if (!owns(journal, id, ['committing'])) {
      return false;
    }

    await moveMember(context, journal, 'queued', {}, now);

    return true;
  }

  if (batch.reason !== undefined) {
    // A failed attempt: counted, visible, and the next one waits for the backoff.
    if (!owns(journal, id, ['committing'])) {
      return false;
    }

    await moveMember(
      context,
      journal,
      'queued',
      {
        attempts: countFailedAttempt(journal.attempts),
        reason: batch.reason,
        ...(batch.blockedBy !== undefined ? { blockedBy: batch.blockedBy } : {}),
        nextAttemptAt: nextAttemptAt(batch.updatedAt, batch.attempts),
      },
      now,
    );

    return true;
  }

  if (!owns(journal, id, ['committing', 'commit-failed', 'recovery-required'])) {
    return false;
  }

  await moveMember(context, journal, 'queued', { attempts: 0 }, now);

  return true;
}

/**
 * Completes the members the batch still holds without a commit (`not-applicable`, reason
 * `nothing-to-commit`): the effective set was empty, so no Git mutation ran.
 */
export async function completeHeldMembersWithoutCommit(
  context: ResolvedProjectHome,
  batch: DocumentBatchRecord,
  reason: string,
  now: string,
): Promise<number> {
  let changed = 0;
  for (const id of batch.memberIds) {
    const journal = await readDocumentChangeJournal(context, id);
    if (journal === undefined || !holdsMember(journal, batch.operationId)) {
      continue;
    }

    await moveMember(
      context,
      journal,
      'completed',
      { outcome: 'not-applicable', reason, coalescedWith: batch.memberIds.length - 1 },
      now,
    );
    changed += 1;
  }

  return changed;
}
