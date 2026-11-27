import type { SpecFlowEngine } from '../../../../application';
import { listLedgerRecords } from '../../../../specs/durable';
import type { LedgerRecord } from '../../../../specs/durable/ledger/model';
import {
  NO_ATTEMPT_COMMIT_HOLDS,
  type AttemptCommitHolds,
  type AttemptCommitPathHold,
  type SpecificationAttemptCommitWait,
} from '../../../../specs/uncommitted/attempts';
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
 * The one source of truth for the uncommitted paths finished agent attempts hold (D15): with Git on,
 * the attempts of the checkout `workspaceId` whose own commit is pending or failed, each with the
 * paths that commit takes (its ledger entries of its Specification, mixed ones included, and its
 * declared files), and the agent executions whose entries an attempt commit still takes. Every
 * admission asks it through `SpecFlowEngine.attemptCommitHolds`, keyed by the checkout of the
 * Specification it acts on: the workflow's (no write of a held Specification), the document
 * writer's (a held path is written by the attempt's own Turns only), the manual commit's (a held
 * path is committed by the attempt's own commit only), Close's (a held path is never archived
 * along) and the owner's commit of the execution state (never takes the agent's entries). Fails
 * closed (`readable: false`) when an attempt journal or a ledger record cannot be read, or a listing
 * was cut short. Lock-free and Git-free.
 */
export async function readAttemptCommitHolds(
  engine: SpecFlowEngine,
  workspaceId: string,
): Promise<AttemptCommitHolds> {
  if (!(await readProjectGitPolicy(engine.context)).policy.enabled) {
    return NO_ATTEMPT_COMMIT_HOLDS;
  }

  const listing = await filesystemAgentAttemptJournal(engine.context).listActive();
  const waits = listing.journals.some(
    (journal) => journal.workspaceId === workspaceId && namedWaitOf(journal) !== undefined,
  );
  if (!waits) {
    return attemptCommitHoldsOf(listing, workspaceId, []);
  }

  const ledger = await listLedgerRecords(engine.context, { workspaceId });
  if (ledger.unreadable > 0 || ledger.truncated) {
    return { readable: false };
  }

  return attemptCommitHoldsOf(listing, workspaceId, ledger.records);
}

/**
 * {@link readAttemptCommitHolds} over a listing of the journals and the ledger records of the
 * checkout (pure; the oldest attempt first).
 */
export function attemptCommitHoldsOf(
  listing: Pick<AgentAttemptJournalListing, 'journals' | 'unreadable' | 'truncated'>,
  workspaceId: string,
  records: readonly LedgerRecord[],
): AttemptCommitHolds {
  if (listing.unreadable.length > 0 || listing.truncated) {
    return { readable: false };
  }

  const journals = listing.journals.filter((journal) => journal.workspaceId === workspaceId);
  const holds = journals
    .flatMap((journal) => {
      const wait = namedWaitOf(journal);

      return wait !== undefined ? [holdOf(journal, wait, records)] : [];
    })
    .sort((left, right) => left.wait.attemptId.localeCompare(right.wait.attemptId));
  // The Turns of an attempt in progress, and of every held one: an attempt commit takes their entries.
  const executions = new Set<string>();
  for (const journal of journals) {
    if (!isAttemptResolved(journal)) {
      attemptInvocations(journal).forEach((invocation) => executions.add(invocation));
    }
  }

  for (const hold of holds) {
    hold.invocations.forEach((invocation) => executions.add(invocation));
  }

  return { readable: true, holds, executions };
}

function holdOf(
  journal: AgentAttemptJournal,
  wait: SpecificationAttemptCommitWait,
  records: readonly LedgerRecord[],
): AttemptCommitPathHold {
  const invocations = attemptInvocations(journal);
  const entries = records
    .filter(
      (record) =>
        record.owner.kind === 'specification' && record.owner.id === journal.subject.specId,
    )
    .flatMap((record) => record.entries);
  const selected = selectAttemptLedgerEntries(entries, invocations);
  const ledger = [...new Set([...selected.paths, ...selected.mixed])].sort();
  const action = journal.postActions?.find((entry) => entry.kind === 'attempt-commit');
  const declared = [...new Set((action?.declared ?? []).map((entry) => entry.path))].sort();

  return {
    wait,
    invocations,
    ledger,
    declared,
    paths: [...new Set([...ledger, ...declared])].sort(),
  };
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
