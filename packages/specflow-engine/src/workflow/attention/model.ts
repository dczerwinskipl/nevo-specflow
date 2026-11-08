import type { AgentLaunch, AttentionReason, LaunchBlocker } from '../continuation/resolve';
import type { WorkflowSubject } from '../state/model';

/**
 * A subject the owner has to act on: the next step cannot start on its own. Never stored: it is
 * derived from the canonical runs, the pinned definitions and the current archetypes on every
 * inspection (`deriveAttention` in `../operations/attention.ts`), so it always describes the
 * subject's current position, whatever changed the runs (an operation, a branch switch, a pull).
 * At most one item exists per subject, and none for a subject that is being worked on: any start
 * ends it by construction.
 */
export interface AttentionItem {
  readonly subject: WorkflowSubject;
  readonly step: string;
  readonly reason: AttentionReason;
  /** For `task-escalated`: every escalated Task, in id order. */
  readonly taskIds?: readonly string[];
  readonly archetype?: string;
  readonly provider?: string;
  readonly blocker?: LaunchBlocker;
  readonly suggestion?: AgentLaunch;
}
