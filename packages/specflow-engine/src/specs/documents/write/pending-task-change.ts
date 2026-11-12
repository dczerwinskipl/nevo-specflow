import type { ResolvedProjectHome } from '../../../project/home/home';
import { readPayload } from '../../durable';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../changes/journal/kind';
import { DOCUMENT_CHANGE_STAGE_FACTS } from '../changes/journal/stages';
import { decodePlanWithEvidence } from '../changes/plan/codec';
import { listDocumentChangeJournals } from './journal-store';

/**
 * Whether a change of the Task's documents is pending: a document-change journal of that Task that
 * is not final yet (still being written, waiting for or in its commit, failed to commit, or needing
 * recovery). While one is, its files (and possibly the Task's `task.yaml`) are not settled, so the
 * Specification execution store must not write the Task's files (D03): a Task edit, removal or
 * status change refuses. A change that completed uncommitted (auto-commit off) is final and does
 * not count.
 *
 * Reads the local journals and the plan files of the Specification's active ones; takes no lock (call
 * it under the project control lock, the lock the reservation of a document change holds). A journal
 * or plan that cannot be read fails closed with a `DocumentError`.
 */
export async function hasPendingTaskDocumentChange(
  context: ResolvedProjectHome,
  specId: string,
  taskId: string,
): Promise<boolean> {
  const journals = (await listDocumentChangeJournals(context)).filter(
    (journal) => journal.specId === specId && DOCUMENT_CHANGE_STAGE_FACTS[journal.stage].active,
  );
  for (const journal of journals) {
    const plan = decodePlanWithEvidence(
      await readPayload(context, DOCUMENT_CHANGE_JOURNAL_KIND, journal.operationId, journal.plan),
      journal.plan,
    );
    if (plan.taskId === taskId) {
      return true;
    }
  }

  return false;
}
