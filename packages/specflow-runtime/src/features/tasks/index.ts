export { createTasksFeature, type TasksFeatureDependencies } from './feature';
export type {
  TaskIdentity,
  TaskDefinitionFacts,
  ExecutionFacts,
  HistoryFacts,
  ResourceFacts,
  DefinitionSource,
  ExecutionSource,
  HistorySource,
  ReferenceVisibility,
} from './reads/facts';
export { createDemoTaskEngine, type DemoTaskEngineOptions } from './demo/task-engine';
export { demoAgentSessions, seedDemoWorkflow } from './demo/seed';
export {
  createEngineTaskSources,
  createProjectTaskEngine,
  type TaskEngine,
  type TaskSpecification,
} from './engine/sources';
export type { TaskCommands } from './commands/task-commands';

export {
  createEngineTaskProgress,
  createEngineWorkspaceTasks,
  type TaskProgressSource,
  type WorkspaceTasksContribution,
} from './workspace/engine-contribution';
