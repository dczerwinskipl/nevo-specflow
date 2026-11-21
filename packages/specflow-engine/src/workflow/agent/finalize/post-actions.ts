import { WorkflowError } from '../../errors';
import { loadSubject } from '../../operations/loaded-execution';
import type { PostActionResult } from '../../operations/post-actions';
import { agentAttemptBindingOf, type OwnerActor, type WorkflowSubject } from '../../state/model';
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
 * The post-action runs in this process, by attempt: a run reads the journal, runs what is left and
 * records it as one unit, and a second caller (the finalize and a reconcile at once) waits for the
 * running one, then reads the journal afresh, so nothing is run twice. Across processes the
 * operation id of each action is the guard: a post action keeps its own journal under that id.
 */
const inFlight = new Map<string, Promise<unknown>>();

async function singleFlight<T>(attemptId: string, run: () => Promise<T>): Promise<T> {
  for (let running = inFlight.get(attemptId); running; running = inFlight.get(attemptId)) {
    await running.catch(() => undefined);
  }

  const result = run().finally(() => inFlight.delete(attemptId));
  inFlight.set(attemptId, result);

  return result;
}

/** Which post actions a run takes: those never run, or (an owner's retry) the failed ones too. */
type PostActionSelection = 'pending' | 'pending-and-failed';

function runSelected(
  dependencies: AgentAttemptDependencies,
  attemptId: string,
  selection: PostActionSelection,
): Promise<readonly PostActionResult[]> {
  return singleFlight(attemptId, () => runSelectedNow(dependencies, attemptId, selection));
}

async function runSelectedNow(
  dependencies: AgentAttemptDependencies,
  attemptId: string,
  selection: PostActionSelection,
): Promise<readonly PostActionResult[]> {
  const journal = await dependencies.journal.read(attemptId);
  // Only after the finalize section settled the claim: a crash inside it left the claim held, and
  // the Runtime's finalize with the native-stop evidence completes the section first.
  if (
    !journal ||
    !isAttemptResolved(journal) ||
    (await dependencies.finalize.claim(journal.turns.at(-1)!.invocationId))?.phase !== 'settled'
  ) {
    return [];
  }

  const results: PostActionResult[] = [];
  const ran = new Map<string, readonly AgentPostActionOutcome[]>();
  for (const action of journal.postActions ?? []) {
    if (
      action.state === 'pending' ||
      (selection === 'pending-and-failed' && action.state === 'failed')
    ) {
      const reported = await dependencies.finalize.postActions.run(journal, action);
      results.push(...reported);
      ran.set(action.operationId, outcomesOf(reported));
    }
  }

  await dependencies.workflow.serialize(async () => {
    const current = await dependencies.journal.read(attemptId);
    if (!current) {
      return;
    }

    let next = current;
    const recorded = (action: AgentPostActionRecord) =>
      action.state !== 'done' && ran.has(action.operationId);
    if (current.postActions?.some(recorded)) {
      next = {
        ...current,
        postActions: current.postActions.map((action) => {
          const outcomes = ran.get(action.operationId);
          if (!recorded(action) || outcomes === undefined) {
            return action;
          }

          const failed = outcomes.some((outcome) => outcome.status === 'failed');

          return {
            ...action,
            state: failed ? ('failed' as const) : ('done' as const),
            outcomes,
            runs: (action.runs ?? 0) + 1,
          };
        }),
      };
      await dependencies.journal.publish(next);
    }

    if (isAttemptJournalSettled(next)) {
      await dependencies.journal.settle(attemptId);
    }
  });

  return results;
}

/**
 * Run the pending post actions of a finalized attempt, outside any lock section, then record what
 * they did in a short section of its own: `done`, or `failed` (kept, with its outcomes, for a retry;
 * the journal stays active and visible to recovery). Once nothing of an ended attempt is left to
 * run, its journal moves to `settled/`. Nothing to do for an attempt that has not ended, or whose
 * last Turn's claim is not settled yet. What each action reported is returned.
 *
 * Called by the finalize after its section, and by recovery for every ended attempt whose post
 * actions a crash left pending ({@link recoverAgentAttempts}).
 */
export function runAgentPostActions(
  dependencies: AgentAttemptDependencies,
  attemptId: string,
): Promise<readonly PostActionResult[]> {
  return runSelected(dependencies, attemptId, 'pending');
}

/**
 * The owner's retry of a finalized attempt's post actions (Retry commit): runs every one that failed
 * or never ran, with the same operation ids. Recovery never retries a failed action by itself.
 */
export function retryAgentPostActions(
  dependencies: AgentAttemptDependencies,
  attemptId: string,
): Promise<readonly PostActionResult[]> {
  return runSelected(dependencies, attemptId, 'pending-and-failed');
}

export interface AgentAttemptRecovery {
  /** The ended attempts whose pending post actions ran, with what they reported. */
  readonly recovered: readonly {
    readonly attemptId: string;
    readonly postActions: readonly PostActionResult[];
  }[];
  /** Attempts whose recovery failed; the others still ran. */
  readonly failed: readonly {
    readonly attemptId: string;
    readonly code: string;
    readonly message: string;
  }[];
  /** Journal files that cannot be read (skipped, for the operator). */
  readonly unreadable: readonly string[];
  /** More journals exist than one listing reads; a later recovery sees the rest. */
  readonly truncated: boolean;
}

/**
 * Startup and reconcile recovery of the attempts' own work: resumes the post actions every ended
 * attempt left pending (a crash after its finalize section) and settles its journal. An attempt
 * whose Turn has not been finalized, or whose finalize section a crash interrupted (its claim is
 * still held), is not touched: only the Runtime holds the native-stop evidence that
 * `finalizeAgentAttempt` needs, and it runs that same operation again. A failed post action waits for
 * the owner's retry. One attempt or journal that fails is reported and does not stop the others.
 */
export async function recoverAgentAttempts(
  dependencies: AgentAttemptDependencies,
): Promise<AgentAttemptRecovery> {
  const listing = await dependencies.journal.listActive();
  const recovered: AgentAttemptRecovery['recovered'][number][] = [];
  const failed: AgentAttemptRecovery['failed'][number][] = [];
  for (const journal of listing.journals) {
    // Pending post actions to resume, or an ended attempt with nothing left whose journal a crash
    // left in the active directory; a failed action alone waits for the owner.
    const pending = (journal.postActions ?? []).some((action) => action.state === 'pending');
    if (!isAttemptResolved(journal) || (!pending && !isAttemptJournalSettled(journal))) {
      continue;
    }

    try {
      const lastTurn = journal.turns.at(-1)!.invocationId;
      if ((await dependencies.finalize.claim(lastTurn))?.phase !== 'settled') {
        continue;
      }

      recovered.push({
        attemptId: journal.operationId,
        postActions: await runAgentPostActions(dependencies, journal.operationId),
      });
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'RECOVERY_FAILED';
      failed.push({
        attemptId: journal.operationId,
        code,
        message: error instanceof Error ? error.message : 'Recovery failed.',
      });
    }
  }

  return { recovered, failed, unreadable: listing.unreadable, truncated: listing.truncated };
}

export interface RetryAgentAttemptCommitInput {
  readonly subject: WorkflowSubject;
  readonly step: string;
  readonly attempt: number;
  /** Only the owner retries (Retry commit); the agent has no route to it. */
  readonly actor: OwnerActor;
}

export interface RetryAgentAttemptCommitResult {
  /** What the post actions reported: the attempt commit's result. */
  readonly postActions: readonly PostActionResult[];
}

/**
 * The owner's **Retry commit** of a finished agent attempt `step#attempt` of `subject` (D15): runs
 * its failed attempt commit again, once (`retryAgentPostActions`: a retry while another runs waits
 * for it and then finds nothing left to run). Refused `WORKFLOW_ATTEMPT_MISMATCH` when the attempt is
 * not a finished agent attempt, and `WORKFLOW_POSITION_INVALID` when its commit did not fail (it
 * committed, or it has not run yet: recovery runs it).
 */
export async function retryAgentAttemptCommit(
  dependencies: AgentAttemptDependencies,
  input: RetryAgentAttemptCommitInput,
): Promise<RetryAgentAttemptCommitResult> {
  if (input.actor.class !== 'human') {
    throw new WorkflowError('WORKFLOW_EXECUTOR_NOT_ALLOWED', 'Only the owner retries a commit.');
  }

  const { workflow } = dependencies;
  const snapshot = await workflow.store.read(input.subject.specId);
  const record = loadSubject(workflow.catalogue, snapshot, input.subject).run.attempts.find(
    (attempt) => attempt.step === input.step && attempt.attempt === input.attempt,
  );
  const attemptId = record ? agentAttemptBindingOf(record)?.attemptId : undefined;
  const journal = attemptId !== undefined ? await dependencies.journal.read(attemptId) : undefined;
  if (attemptId === undefined || !journal || !isAttemptResolved(journal)) {
    throw new WorkflowError(
      'WORKFLOW_ATTEMPT_MISMATCH',
      `${input.step}#${String(input.attempt)} is not a finished agent attempt.`,
    );
  }

  if (!(journal.postActions ?? []).some((action) => action.state === 'failed')) {
    throw new WorkflowError(
      'WORKFLOW_POSITION_INVALID',
      `The commit of ${input.step}#${String(input.attempt)} did not fail; there is nothing to retry.`,
    );
  }

  return { postActions: await retryAgentPostActions(dependencies, attemptId) };
}
