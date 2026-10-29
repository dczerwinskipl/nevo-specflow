import type { ResolvedProjectHome } from '../../../project/home/home';
import { LedgerLimitError, publishJournal, readPayload, recordLedgerEntries } from '../../durable';
import { documentChangeError } from '../changes/errors';
import { transitionDocumentChange } from '../changes/journal';
import type { DocumentChangeJournal } from '../changes/journal';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../changes/journal/kind';
import { decodePlanWithEvidence } from '../changes/plan/codec';
import type { DocumentChangePlan } from '../changes/plan/model';

/** Why an operation ends uncommitted: its batch was abandoned. */
export const UNCOMMITTED_ABANDONED = 'abandoned';

/** Observation point of the ledger write, for tests that stop the process between its two effects. */
export interface UncommittedHooks {
  /** The ledger holds the paths; the operation is not completed yet. */
  afterLedgerWrite?(): Promise<void>;
}

/** The plan of an operation, proven against the evidence its journal records. */
export async function planOfJournal(
  context: ResolvedProjectHome,
  journal: DocumentChangeJournal,
): Promise<DocumentChangePlan> {
  return decodePlanWithEvidence(
    await readPayload(context, DOCUMENT_CHANGE_JOURNAL_KIND, journal.operationId, journal.plan),
    journal.plan,
  );
}

/**
 * Ends an operation as `uncommitted` (reason `abandoned`): its paths are recorded in the ledger FIRST
 * (idempotent by operation id, so a stop in between is finished by a repeat) and only then the
 * journal moves to `completed`. The caller holds the Project Home control lock, so both effects are
 * one critical section. `head` is the commit the checkout was at when the batch was claimed, when known.
 * A ledger that cannot take the paths refuses with `DOCUMENT_UNCOMMITTED_LIMIT` before anything is written.
 */
export async function completeUncommitted(
  context: ResolvedProjectHome,
  journal: DocumentChangeJournal,
  head: string | undefined,
  now: string,
  hooks: UncommittedHooks = {},
): Promise<DocumentChangeJournal> {
  const plan = await planOfJournal(context, journal);
  try {
    await recordLedgerEntries(
      context,
      {
        projectId: context.project.projectId,
        workspaceId: journal.workspaceId,
        workspaceRoot: journal.workspaceRoot,
        owner: { kind: 'specification', id: journal.specId },
      },
      {
        operationId: journal.operationId,
        reason: UNCOMMITTED_ABANDONED,
        recordedAt: now,
        branch: journal.commit?.branch ?? null,
        head: head ?? null,
        paths: plan.paths.map((path) => ({
          path: path.path,
          postSha256: path.post?.sha256 ?? null,
        })),
      },
    );
  } catch (error) {
    if (error instanceof LedgerLimitError) {
      throw documentChangeError(
        'uncommitted-limit',
        'Too many uncommitted paths; commit the pending changes first.',
      );
    }
    throw error;
  }
  await hooks.afterLedgerWrite?.();
  const next = transitionDocumentChange(
    journal,
    'completed',
    { outcome: 'uncommitted', reason: UNCOMMITTED_ABANDONED },
    now,
  );
  await publishJournal(context, DOCUMENT_CHANGE_JOURNAL_KIND, next);
  return next;
}
