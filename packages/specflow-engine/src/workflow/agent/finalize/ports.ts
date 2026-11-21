import type { WorkflowDependencies } from '../../operations/loaded-execution';
import { NO_POST_ACTIONS, type PostActionResult } from '../../operations/post-actions';
import type { AgentAttemptJournal, AgentPostActionRecord } from '../journal/model';

/**
 * The points of `finalizeAgentAttempt` a crash can fall between, in order: the step state is
 * published (`step-published`), the attempt's journal records the outcome, the Turn's dirty set and
 * the pending post actions (`attempt-recorded`), the claim is settled (`claim-settled`), the section
 * released and the post actions not yet run (`post-actions-pending`). Tests inject a fault at each.
 */
export type FinalizeBoundary =
  'step-published' | 'attempt-recorded' | 'claim-settled' | 'post-actions-pending';

/**
 * Runs one pending post action of a finalized attempt, after the finalize section released the
 * control lock (it takes its own locks, never inside a lock section). It reports a failure of the
 * action as a result and does not throw for it; its `operationId` is the same on every retry.
 */
export interface AgentPostActionRunner {
  run(
    journal: AgentAttemptJournal,
    action: AgentPostActionRecord,
  ): Promise<readonly PostActionResult[]>;
}

/**
 * The runner of today's post action: `step-finished` is the workflow finish post action of the host
 * (`commit-execution-state`), with the proposal's actor. The attempt commit (D15) replaces it here.
 */
export function workflowPostActionRunner(workflow: WorkflowDependencies): AgentPostActionRunner {
  return {
    run(journal, action) {
      const proposal = journal.proposal;
      if (proposal?.state !== 'finalized') {
        return Promise.resolve([]);
      }

      return (workflow.postActions ?? NO_POST_ACTIONS).afterStepFinished({
        subject: journal.subject,
        step: journal.step,
        stepTitle: action.stepTitle,
        attempt: journal.attempt,
        actor: proposal.actor,
        replayed: false,
      });
    },
  };
}
