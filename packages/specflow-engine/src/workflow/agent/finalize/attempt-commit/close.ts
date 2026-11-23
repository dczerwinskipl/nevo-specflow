import type { SpecFlowEngine } from '../../../../application';
import { listLedgerRecords } from '../../../../specs/durable';
import type {
  FailedAttemptCommit,
  SpecificationAttemptCommitWait,
} from '../../../../specs/uncommitted/attempts';
import { readProjectGitPolicy } from '../../../../version-control/worktrees/config';
import {
  attemptCommitWaitOf,
  isAttemptResolved,
  type AgentAttemptJournal,
} from '../../journal/model';
import { filesystemAgentAttemptJournal } from '../../journal/store';
import { attemptInvocations, selectAttemptLedgerEntries } from './selection';

/**
 * The finished agent attempts of a checkout whose commit failed and waits for the owner's retry,
 * each with the paths that commit holds now: its ledger entries (of its Specification) and its
 * declared paths. Lock-free and Git-free: what Close reports (D16), not what it judges.
 */
export async function failedAgentAttemptCommits(
  engine: SpecFlowEngine,
  workspaceId: string,
): Promise<readonly FailedAttemptCommit[]> {
  const listing = await filesystemAgentAttemptJournal(engine.context).listActive();
  const failed = listing.journals.filter(
    (journal) => journal.workspaceId === workspaceId && isAttemptResolved(journal),
  );
  if (failed.length === 0) {
    return [];
  }

  const records = (await listLedgerRecords(engine.context, { workspaceId })).records;
  const attempts: FailedAttemptCommit[] = [];
  for (const journal of failed) {
    const action = journal.postActions?.find(
      (entry) => entry.kind === 'attempt-commit' && entry.state === 'failed',
    );
    if (action === undefined) {
      continue;
    }

    const entries = records
      .filter(
        (record) =>
          record.owner.kind === 'specification' && record.owner.id === journal.subject.specId,
      )
      .flatMap((record) => record.entries);
    // A refused commit's mixed entries are the attempt's too: listed with it until it commits.
    const ledger = selectAttemptLedgerEntries(entries, attemptInvocations(journal));
    const paths = [...ledger.paths, ...ledger.mixed].sort();
    const declared = (action.declared ?? []).map((entry) => entry.path).sort();
    attempts.push({
      attemptId: journal.operationId,
      specId: journal.subject.specId,
      ...(journal.subject.kind === 'task' ? { taskId: journal.subject.taskId } : {}),
      step: journal.step,
      attempt: journal.attempt,
      stepTitle: action.stepTitle,
      code: action.outcomes?.find((outcome) => outcome.status === 'failed')?.code ?? 'FAILED',
      paths,
      declared,
    });
  }

  return attempts;
}

/**
 * With Git on, the finished agent attempt of the Specification `specId` (of the Specification itself
 * or of one of its Tasks) whose own commit (D15) still waits: not run yet, or failed. While one
 * waits, every workflow write of the Specification is refused (`WORKFLOW_ATTEMPT_COMMIT_REQUIRED`),
 * the owner's Confirm and Reject included. `undefined` with Git off or when none waits; a journal that cannot be read names
 * no Specification and holds none (its commit cannot run either until it is repaired). Lock-free and
 * Git-free.
 */
export async function specificationAttemptCommitWait(
  engine: SpecFlowEngine,
  specId: string,
): Promise<SpecificationAttemptCommitWait | undefined> {
  if (!(await readProjectGitPolicy(engine.context)).policy.enabled) {
    return undefined;
  }

  const listing = await filesystemAgentAttemptJournal(engine.context).listActive();

  return specificationAttemptCommitWaitOf(listing.journals, specId);
}

/** {@link specificationAttemptCommitWait} over listed journals (pure; the oldest attempt first). */
export function specificationAttemptCommitWaitOf(
  journals: readonly AgentAttemptJournal[],
  specId: string,
): SpecificationAttemptCommitWait | undefined {
  const waiting = journals
    .filter((journal) => journal.subject.specId === specId)
    .flatMap((journal) => {
      const wait = attemptCommitWaitOf(journal);
      const action = journal.postActions?.find((entry) => entry.kind === 'attempt-commit');

      return wait !== undefined && action !== undefined ? [{ journal, wait, action }] : [];
    })
    .sort((left, right) => left.journal.operationId.localeCompare(right.journal.operationId));
  const [first] = waiting;
  if (first === undefined) {
    return undefined;
  }

  const { journal, wait, action } = first;

  return {
    ...wait,
    attemptId: journal.operationId,
    subject: {
      specId: journal.subject.specId,
      ...(journal.subject.kind === 'task' ? { taskId: journal.subject.taskId } : {}),
    },
    step: journal.step,
    attempt: journal.attempt,
    stepTitle: action.stepTitle,
  };
}

/**
 * The agent executions (the Runtime invocations of their Turns) whose uncommitted entries an attempt
 * commit (D15) of the checkout still takes: every Turn of an attempt in progress, or of a finished
 * attempt whose commit is pending or failed. An attempt that ended without one (taken over, returned)
 * is not among them: nothing but the owner's commit takes its entries. `undefined` when the journals
 * cannot all be read: the owner's commit then takes no entry any execution wrote. Lock-free and
 * Git-free.
 */
export async function attemptCommitExecutions(
  engine: SpecFlowEngine,
  workspaceId: string,
): Promise<ReadonlySet<string> | undefined> {
  const listing = await filesystemAgentAttemptJournal(engine.context).listActive();
  if (listing.unreadable.length > 0 || listing.truncated) {
    return undefined;
  }

  const executions = new Set<string>();
  for (const journal of listing.journals) {
    const waits =
      !isAttemptResolved(journal) ||
      (journal.proposal?.state === 'finalized' && attemptCommitWaitOf(journal) !== undefined);
    if (journal.workspaceId === workspaceId && waits) {
      for (const invocation of attemptInvocations(journal)) {
        executions.add(invocation);
      }
    }
  }

  return executions;
}
