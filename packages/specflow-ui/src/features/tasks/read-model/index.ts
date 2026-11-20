/**
 * Read model of the tasks feature: the task shapes and mappers other features may depend on, and the
 * one status presentation model (a status's mark, tone and label; the attention overlay). A leaf
 * entry (it imports no other feature), so a feature that only needs task data does not depend on
 * the task screens.
 */
export { mapFullTaskResponse } from './model';
export { specificationActionsKey, useSpecificationActions } from './specificationActions';
export {
  getTaskStatePresentation,
  taskStatusSupporting,
  TASK_STATUS_IDS,
  type TaskStatePresentation,
  type TaskStatusId,
} from './statusPresentation';
export {
  taskAttentionOverlay,
  taskRequiresAttention,
  type TaskAttentionFacts,
  type TaskAttentionOverlay,
  type TaskAttentionSource,
} from './attentionOverlay';
export type {
  FullTaskData,
  TaskEvidence,
  TaskGroup,
  TaskItem,
  TaskLifecycle,
  TaskRelatedSession,
} from './model';
