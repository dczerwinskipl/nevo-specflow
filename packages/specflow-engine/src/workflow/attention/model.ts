import type { AgentLaunch, AttentionReason, LaunchBlocker } from '../continuation/resolve';
import type { WorkflowSubject } from '../state/model';

/**
 * A subject the owner has to act on: the next step cannot start on its own. At most one item exists
 * per subject; it is replaced by the next decision and removed as soon as any step of the subject
 * starts (from a quick start, a manual start or an automatic continuation, which all use the same
 * start operation) or the run ends. Local state: it is derived from progression and never committed.
 */
export interface AttentionItem {
  readonly subject: WorkflowSubject;
  readonly step: string;
  readonly reason: AttentionReason;
  readonly archetype?: string;
  readonly provider?: string;
  readonly blocker?: LaunchBlocker;
  readonly suggestion?: AgentLaunch;
  readonly createdAt: string;
}
