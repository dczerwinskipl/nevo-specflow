import type { SpecFlowEngine } from '../../../../application';
import { listLedgerRecords } from '../../../../specs/durable';
import type {
  AttemptCommitPathHold,
  AttemptCommitPathHolds,
  FailedAttemptCommit,
  SpecificationAttemptCommitWait,
} from '../../../../specs/uncommitted/attempts';
import { WorkflowError } from '../../../errors';
import { readProjectGitPolicy } from '../../../../version-control/worktrees/config';
import {
  attemptCommitWaitOf,
  isAttemptResolved,
  type AgentAttemptJournal,
} from '../../journal/model';
import {
  filesystemAgentAttemptJournal,
  type AgentAttemptJournalListing,
} from '../../journal/store';
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
 * the owner's Confirm and Reject included. `undefined` with Git off or when none waits. Fails closed:
 * a journal that cannot be read (or a listing cut short) may be the one that waits, so the answer is
 * `WORKFLOW_STATE_CORRUPT` until it is repaired. Lock-free and Git-free.
 */
export async function specificationAttemptCommitWait(
  engine: SpecFlowEngine,
  specId: string,
): Promise<SpecificationAttemptCommitWait | undefined> {
  if (!(await readProjectGitPolicy(engine.context)).policy.enabled) {
    return undefined;
  }

  const listing = await filesystemAgentAttemptJournal(engine.context).listActive();

  return specificationAttemptCommitWaitOf(listing, specId);
}

/** The refusal while an agent attempt journal cannot be read: whether its commit waits is unknown. */
export function unreadableAttemptJournals(): WorkflowError {
  return new WorkflowError(
    'WORKFLOW_STATE_CORRUPT',
    "An agent attempt's record cannot be read, so SpecFlow cannot tell whether the commit of its " +
      "work still waits. Repair or remove the unreadable record under the project's local state, " +
      'then try again.',
  );
}

/**
 * {@link specificationAttemptCommitWait} over a listing of the journals (pure; the oldest attempt
 * first): `WORKFLOW_STATE_CORRUPT` when a journal cannot be read or the listing was cut short.
 */
export function specificationAttemptCommitWaitOf(
  listing: Pick<AgentAttemptJournalListing, 'journals' | 'unreadable' | 'truncated'>,
  specId: string,
): SpecificationAttemptCommitWait | undefined {
  if (listing.unreadable.length > 0 || listing.truncated) {
    throw unreadableAttemptJournals();
  }

  const [first] = listing.journals
    .filter((journal) => journal.subject.specId === specId)
    .flatMap((journal) => {
      const wait = namedWaitOf(journal);

      return wait !== undefined ? [wait] : [];
    })
    .sort((left, right) => left.attemptId.localeCompare(right.attemptId));

  return first;
}

/** The named wait of one attempt journal, while its own commit is pending or failed. */
function namedWaitOf(journal: AgentAttemptJournal): SpecificationAttemptCommitWait | undefined {
  const wait = attemptCommitWaitOf(journal);
  const action = journal.postActions?.find((entry) => entry.kind === 'attempt-commit');
  if (wait === undefined || action === undefined) {
    return undefined;
  }

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
 * With Git on, the finished agent attempts of the checkout whose own commit (D15) waits, each with
 * the paths that commit takes: its ledger entries (of its Specification, mixed ones included) and
 * its declared files. The document writer refuses every other write to those paths (the owner's
 * included) and the document tree reports them, so no other author's change joins the agent's work
 * before its commit ran. Fails closed (`readable: false`) when an attempt journal or a ledger record
 * cannot be read. Lock-free and Git-free.
 */
export async function attemptCommitPathHolds(
  engine: SpecFlowEngine,
  workspaceId: string,
): Promise<AttemptCommitPathHolds> {
  if (!(await readProjectGitPolicy(engine.context)).policy.enabled) {
    return { readable: true, holds: [] };
  }

  const listing = await filesystemAgentAttemptJournal(engine.context).listActive();
  if (listing.unreadable.length > 0 || listing.truncated) {
    return { readable: false };
  }

  const waiting = listing.journals
    .filter((journal) => journal.workspaceId === workspaceId)
    .flatMap((journal) => {
      const wait = namedWaitOf(journal);

      return wait !== undefined ? [{ journal, wait }] : [];
    })
    .sort((left, right) => left.wait.attemptId.localeCompare(right.wait.attemptId));
  if (waiting.length === 0) {
    return { readable: true, holds: [] };
  }

  const ledger = await listLedgerRecords(engine.context, { workspaceId });
  if (ledger.unreadable > 0 || ledger.truncated) {
    return { readable: false };
  }

  const holds = waiting.map(({ journal, wait }): AttemptCommitPathHold => {
    const invocations = attemptInvocations(journal);
    const entries = ledger.records
      .filter(
        (record) =>
          record.owner.kind === 'specification' && record.owner.id === journal.subject.specId,
      )
      .flatMap((record) => record.entries);
    const selected = selectAttemptLedgerEntries(entries, invocations);
    const declared = (
      journal.postActions?.find((entry) => entry.kind === 'attempt-commit')?.declared ?? []
    ).map((entry) => entry.path);

    return {
      wait,
      invocations,
      paths: [...new Set([...selected.paths, ...selected.mixed, ...declared])].sort(),
    };
  });

  return { readable: true, holds };
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
