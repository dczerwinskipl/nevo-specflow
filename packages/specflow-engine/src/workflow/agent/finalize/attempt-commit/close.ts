import type { SpecFlowEngine } from '../../../../application';
import { listLedgerRecords } from '../../../../specs/durable';
import type {
  AttemptCommitWait,
  FailedAttemptCommit,
} from '../../../../specs/uncommitted/attempts';
import { readProjectGitPolicy } from '../../../../version-control/worktrees/config';
import { attemptCommitWaitOf, isAttemptResolved } from '../../journal/model';
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
 * With Git on, why the commit of the agent attempt `attemptId` still waits (not run yet, or failed):
 * the owner's Confirm waits for it. `undefined` once it ran, with Git off, or for an attempt without
 * a journal. Lock-free and Git-free.
 */
export async function agentAttemptCommitWait(
  engine: SpecFlowEngine,
  attemptId: string,
): Promise<AttemptCommitWait | undefined> {
  if (!(await readProjectGitPolicy(engine.context)).policy.enabled) {
    return undefined;
  }

  const journal = await filesystemAgentAttemptJournal(engine.context).read(attemptId);

  return journal !== undefined ? attemptCommitWaitOf(journal) : undefined;
}
