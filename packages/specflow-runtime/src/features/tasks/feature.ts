import type { RuntimeFeature } from '../runtime-feature';
import type { TaskReadDependencies } from './detail/read-task-detail';
import { taskReadEndpoint } from './endpoint';
import { taskCommandRoutes } from './commands/routes';
import { createEngineTaskCommands, type TaskCommands } from './commands/task-commands';
import { createEngineTaskSources, type TaskEngine } from './engine/sources';
import { PageLeases, type LeaseOptions } from './reads/page-leases';
import { createEngineTaskList, type TaskListSource } from './list/read-task-list';
import { taskListRoutes } from './list/routes';

export type TasksFeatureDependencies = Omit<TaskReadDependencies, 'leases'> & {
  leaseOptions?: LeaseOptions;
  /**
   * Project mode: the Engine is the source of the Task reads (unless a source is injected) and of
   * the Task commands.
   */
  engine?: TaskEngine;
  /** Explicit Task commands (tests); wins over the Engine. */
  commands?: TaskCommands;
  /** An explicit Tasks page source (tests); wins over the Engine. */
  list?: TaskListSource;
};

export function createTasksFeature(dependencies: TasksFeatureDependencies = {}): RuntimeFeature {
  const { engine, commands, list, leaseOptions, ...sources } = dependencies;
  const reads: TaskReadDependencies = {
    ...(engine ? createEngineTaskSources(engine) : {}),
    ...sources,
    leases: new PageLeases(leaseOptions),
  };
  const taskCommands = commands ?? (engine ? createEngineTaskCommands(engine) : undefined);
  const taskList = list ?? (engine ? createEngineTaskList(engine) : undefined);

  return {
    authorizationResources: [],
    register(app) {
      app.register(taskReadEndpoint, { dependencies: reads });
      app.register(taskListRoutes, {
        ...(taskList ? { source: taskList } : {}),
        ...(dependencies.projectId ? { projectId: dependencies.projectId } : {}),
      });
      app.register(taskCommandRoutes, {
        ...(taskCommands ? { commands: taskCommands } : {}),
        ...(dependencies.projectId ? { projectId: dependencies.projectId } : {}),
      });
    },
  };
}
