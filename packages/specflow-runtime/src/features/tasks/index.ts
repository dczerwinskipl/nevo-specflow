export { createTasksFeature, type TasksFeatureDependencies } from './feature';
export type {
  TaskIdentity,
  TaskDefinitionFacts,
  ExecutionFacts,
  HistoryFacts,
  ResourceFacts,
  DefinitionSource,
  ExecutionSource,
  ResourceSource,
  HistorySource,
  ReferenceVisibility,
} from './reads/facts';
export { createDemoTaskSources, buildDemoTasks } from './demo/sources';
export { buildDemoTaskContribution } from './demo/contribution';
export { createEngineTaskSources, type TaskEngine } from './engine/sources';
export type { TaskCommands } from './commands/task-commands';
export { statusForWorkflowError, taskCommandFailure } from './commands/error-status';
export {
  createEngineTaskProgress,
  createEngineWorkspaceTasks,
  type TaskProgressSource,
  type WorkspaceTasksContribution,
} from './workspace/engine-contribution';
