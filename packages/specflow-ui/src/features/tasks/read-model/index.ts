/**
 * Read model of the tasks feature: the task shapes and mappers other features may depend on. A leaf
 * entry (it imports no other feature), so a feature that only needs task data does not depend on
 * the task screens.
 */
export { getTaskStatePresentation, mapFullTaskResponse } from './model';
export type {
  FullTaskData,
  TaskEvidence,
  TaskExecutionReadiness,
  TaskGroup,
  TaskItem,
  TaskLifecycle,
  TaskRelatedSession,
  TaskStatePresentation,
} from './model';
