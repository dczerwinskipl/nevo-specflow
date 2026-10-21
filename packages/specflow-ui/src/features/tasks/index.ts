/** Public API of the tasks feature: the only module other features may import. */
export { mergeTaskResources } from './detail/TaskDetails';
export {
  TaskContextHeader,
  TaskEvidenceHeader,
  TaskEvidenceInspection,
  TaskFlowHeader,
  TaskInspection,
  TaskResourceHeader,
  TaskResourceInspection,
} from './detail/TaskInspection';
export type { TaskEvidenceParams } from './detail/TaskInspection';
export { TaskViewStateProvider } from './detail/TaskViewState';
export { inspectionAnchor } from './detail/taskInspectionModel';
export type { TaskInspectionAnchor } from './detail/taskInspectionModel';
export { useTaskResources } from './detail/useTaskPages';
export { TaskPreview } from './inspectors/TaskPreview';
export { getTaskStatePresentation, mapFullTaskResponse } from './model';
export type {
  TaskEvidence,
  TaskExecutionReadiness,
  TaskGroup,
  TaskItem,
  TaskLifecycle,
  TaskRelatedSession,
  TaskStatePresentation,
} from './model';
export { useSpecificationTask } from './useSpecificationTask';
