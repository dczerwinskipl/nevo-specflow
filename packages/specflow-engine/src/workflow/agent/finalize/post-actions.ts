import type { PostActionResult } from '../../operations/post-actions';
import type { AgentAttemptDependencies } from '../dependencies';
import {
  isAttemptJournalSettled,
  isAttemptResolved,
  type AgentPostActionOutcome,
  type AgentPostActionRecord,
} from '../journal/model';

export type { AgentPostActionRunner } from './ports';

function outcomesOf(results: readonly PostActionResult[]): readonly AgentPostActionOutcome[] {
  return results.slice(0, 20).map((result) => ({
    action: result.action,
    status: result.status,
    ...(result.status === 'failed' ? { code: result.code.slice(0, 100) } : {}),
  }));
}

/**
 * Run the pending post actions of a finalized attempt, outside any lock section, then record them
 * done in a short section of its own; once nothing of an ended attempt is left to run, its journal
 * moves to `settled/`. Nothing to do for an attempt that has not ended, or whose last Turn's claim
 * is not settled yet. What each action reported is returned; an action that failed is done (its retry is the owner's) and keeps its outcome.
 *
 * Called by the finalize after its section, and by recovery for every ended attempt whose post
 * actions a crash left pending ({@link recoverAgentAttempts}).
 */
export async function runAgentPostActions(
  dependencies: AgentAttemptDependencies,
  attemptId: string,
): Promise<readonly PostActionResult[]> {
  const journal = await dependencies.journal.read(attemptId);
  // Only after the finalize section settled the claim: a crash inside it left the claim held, and
  // the Runtime's finalize with the native-stop evidence completes the section first.
  if (
    !journal ||
    !isAttemptResolved(journal) ||
    (await dependencies.finalize.claimPhase(journal.turns.at(-1)!.invocationId)) !== 'settled'
  ) {
    return [];
  }

  const results: PostActionResult[] = [];
  const done = new Map<string, readonly AgentPostActionOutcome[]>();
  for (const action of journal.postActions ?? []) {
    if (action.state === 'pending') {
      const reported = await dependencies.finalize.postActions.run(journal, action);
      results.push(...reported);
      done.set(action.operationId, outcomesOf(reported));
    }
  }

  await dependencies.workflow.serialize(async () => {
    const current = await dependencies.journal.read(attemptId);
    if (!current) {
      return;
    }

    let next = current;
    const pending = (action: AgentPostActionRecord) =>
      action.state === 'pending' && done.has(action.operationId);
    if (current.postActions?.some(pending)) {
      next = {
        ...current,
        postActions: current.postActions.map((action) =>
          pending(action)
            ? { ...action, state: 'done' as const, outcomes: done.get(action.operationId)! }
            : action,
        ),
      };
      await dependencies.journal.publish(next);
    }

    if (isAttemptJournalSettled(next)) {
      await dependencies.journal.settle(attemptId);
    }
  });

  return results;
}

export interface RecoveredAgentAttempt {
  readonly attemptId: string;
  readonly postActions: readonly PostActionResult[];
}

/**
 * Startup and reconcile recovery of the attempts' own work: resumes the post actions every ended
 * attempt left pending (a crash after its finalize section) and settles its journal. An attempt
 * whose Turn has not been finalized, or whose finalize section a crash interrupted (its claim is
 * still held), is not touched: only the Runtime holds the native-stop evidence
 * that `finalizeAgentAttempt` needs, and it runs that same operation again.
 */
export async function recoverAgentAttempts(
  dependencies: AgentAttemptDependencies,
): Promise<readonly RecoveredAgentAttempt[]> {
  const recovered: RecoveredAgentAttempt[] = [];
  for (const journal of await dependencies.journal.listActive()) {
    const lastTurn = journal.turns.at(-1)!.invocationId;
    if (
      isAttemptResolved(journal) &&
      (await dependencies.finalize.claimPhase(lastTurn)) === 'settled'
    ) {
      recovered.push({
        attemptId: journal.operationId,
        postActions: await runAgentPostActions(dependencies, journal.operationId),
      });
    }
  }

  return recovered;
}
