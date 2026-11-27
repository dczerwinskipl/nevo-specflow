import type { PostActionResult } from '../../operations/post-actions';
import type { AgentAttemptJournal, AgentPostActionRecord } from '../journal/model';

/**
 * The points of `finalizeAgentAttempt` a crash can fall between, in order: what the proposal was
 * judged on is recorded (`judged-recorded`), the step state is published (`step-published`), the attempt's journal records the outcome, the Turn's dirty set and
 * the pending post actions (`attempt-recorded`), the claim is settled (`claim-settled`), the section
 * released and the post actions not yet run (`post-actions-pending`). Tests inject a fault at each.
 */
export type FinalizeBoundary =
  | 'judged-recorded'
  | 'step-published'
  | 'attempt-recorded'
  | 'claim-settled'
  | 'post-actions-pending';

/**
 * Runs one pending post action of a finalized attempt, after the finalize section released the
 * control lock (it takes its own locks, never inside a lock section). It reports a failure of the
 * action as a result and does not throw for it. Its operation is `agentPostActionRunId(action)`:
 * the same for a run repeated after a crash, a new one for a retry after a recorded run.
 */
export interface AgentPostActionRunner {
  run(
    journal: AgentAttemptJournal,
    action: AgentPostActionRecord,
  ): Promise<readonly PostActionResult[]>;
}
