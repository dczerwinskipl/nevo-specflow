import {
  attemptCommitState,
  namedAttempt,
  type SpecificationAttemptCommitWait,
} from '../specs/uncommitted/attempts';
import { WorkflowError } from './errors';
import type { ExecutionHolds } from './operations/loaded-execution';
import type { ExecutionChange, WorkflowStore } from './state/store';

/**
 * The admission of a workflow write against the agent attempts whose own commit (D15) still waits
 * (Git on): while a finished attempt of a Specification (or of one of its Tasks) has its commit
 * pending or failed, its documents, Task drafts and execution state are uncommitted ledger entries
 * that the attempt commit takes, and only it. Every workflow write of that Specification would write
 * into those entries (the run records, the Task index, the Task files), so the attempt commit would
 * refuse them as mixed (`ATTEMPT_COMMIT_MIXED_AUTHORS`) and the owner's commit could not take them
 * either. So each such write is refused before anything is written, naming the attempt: the owner
 * retries its commit first. Other Specifications are unaffected: their workflow writes never touch
 * another Specification's paths.
 *
 * One rule for every writer: the execution store applies it to every change (start, finish, return,
 * wait re-evaluation, abandon, Confirm, Reject, Task create, edit, removal and status, an agent's
 * start), and the owner decisions on an agent's result ask it before they plan.
 */

/** The refusal of a workflow write while `wait` holds the Specification. */
export function attemptCommitRequired(wait: SpecificationAttemptCommitWait): WorkflowError {
  const named = namedAttempt(wait);
  const state = attemptCommitState(wait);

  return new WorkflowError(
    'WORKFLOW_ATTEMPT_COMMIT_REQUIRED',
    `The commit of the agent's work in ${named} ${state}. Nothing of this Specification's workflow ` +
      'can change until it is committed, so that the agent and you never share an uncommitted file: ' +
      'retry the commit of that attempt, then try again.',
  );
}

/**
 * Refuses (`WORKFLOW_ATTEMPT_COMMIT_REQUIRED`) while an agent attempt of the Specification waits for
 * its commit.
 */
export async function assertNoAttemptCommitWait(
  holds: Pick<ExecutionHolds, 'attemptCommit'> | undefined,
  specId: string,
): Promise<void> {
  const wait = await holds?.attemptCommit?.(specId);
  if (wait !== undefined) {
    throw attemptCommitRequired(wait);
  }
}

/** Whether a change writes nothing (a replay): it is admitted whatever waits. */
function writesNothing(change: ExecutionChange): boolean {
  return (
    change.specification === undefined &&
    change.index === undefined &&
    (change.manifests ?? []).length === 0 &&
    (change.runs ?? []).length === 0 &&
    (change.documents ?? []).length === 0
  );
}

/**
 * The store refusing every change of a Specification while one of its agent attempts waits for its
 * commit (see the module). Checked at `apply`, inside `serialize`, before anything is written. The
 * store of a running agent Turn or of its finalize (an owned claim) is not guarded: such a Turn was
 * admitted before any attempt of the project finished (one claim at a time), it writes only its own
 * attempt's entries, and refusing its finalize would hold its claim, which every commit (the waiting
 * attempt's Retry included) waits for.
 */
export function guardAttemptCommits(
  store: WorkflowStore,
  holds: Pick<ExecutionHolds, 'attemptCommit'>,
): WorkflowStore {
  return {
    read: (specId) => store.read(specId),
    taskFiles: (specId, taskId) => store.taskFiles(specId, taskId),
    taskFolderExists: (specId, taskId) => store.taskFolderExists(specId, taskId),
    async apply(specId, change) {
      if (!writesNothing(change)) {
        await assertNoAttemptCommitWait(holds, specId);
      }

      await store.apply(specId, change);
    },
  };
}
