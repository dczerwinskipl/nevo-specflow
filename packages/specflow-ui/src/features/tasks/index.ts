/** Public API of the tasks feature: the only module other features may import. */
export { useSpecificationTask } from './useSpecificationTask';
export {
  SpecificationWorkflowProvider,
  useSpecificationExitActions,
  useSpecificationNowVisible,
} from './execution/specification/SpecificationWorkflow';
export { useSpecificationWorkflowTimeline } from './execution/agent/useSpecificationWorkflowTimeline';
export { WorkflowHistoryEntry } from './execution/agent/WorkflowHistoryEntry';
export type { WorkflowTimelineEntry } from './execution/agent/workflowTimeline';
export { historyDay } from './execution/agent/AgentAttemptHistory';
export { SpecificationNow } from './execution/specification/SpecificationNow';
export type { AttemptRef } from './execution/StartBlockerLines';
export type { FeedbackRef } from './execution/feedback/feedbackRef';
export { feedbackStack } from './execution/feedback/feedbackStack';
export {
  SpecificationSituation,
  readyToStartOf,
  type SituationAttention,
} from './execution/progress/SpecificationSituation';
export { TaskProgress } from './execution/progress/TaskProgress';
// Run with agent (workflow-execution.md): the agent and model picker of a fresh Session, the dialog
// and the blocker explanation, also used by Create with an agent.
export {
  AgentSession,
  type AgentCatalogue,
  type FreshChoice,
} from './execution/agent/AgentSession';
export { AgentStartDialog } from './execution/agent/AgentStartDialog';
export { AgentBlocker } from './execution/agent/AgentBlocker';
