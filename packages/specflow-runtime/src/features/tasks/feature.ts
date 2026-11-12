import type { RuntimeFeature } from '../runtime-feature';
import type { TaskReadDependencies } from './detail/read-task-detail';
import { taskReadEndpoint } from './endpoint';
import { taskCommandRoutes } from './commands/routes';
import { createEngineTaskCommands, type TaskCommands } from './commands/task-commands';
import { createEngineTaskSources, type TaskEngine } from './engine/sources';
import { PageLeases, type LeaseOptions } from './reads/page-leases';

export type TasksFeatureDependencies = Omit<TaskReadDependencies, 'leases'> & {
  leaseOptions?: LeaseOptions;
  /**
   * Project mode: the Engine is the source of the Task reads (unless a source is injected) and of
   * the Task commands.
   */
  engine?: TaskEngine;
  /** Explicit Task commands (tests); wins over the Engine. */
  commands?: TaskCommands;
};

export function createTasksFeature(dependencies: TasksFeatureDependencies = {}): RuntimeFeature {
  const { engine, commands, leaseOptions, ...sources } = dependencies;
  const reads: TaskReadDependencies = {
    ...(engine ? createEngineTaskSources(engine) : {}),
    ...sources,
    leases: new PageLeases(leaseOptions),
  };
  const taskCommands = commands ?? (engine ? createEngineTaskCommands(engine) : undefined);

  return {
    authorizationResources: [],
    register(app) {
      app.register(taskReadEndpoint, { dependencies: reads });
      app.register(taskCommandRoutes, {
        ...(taskCommands ? { commands: taskCommands } : {}),
        ...(dependencies.projectId ? { projectId: dependencies.projectId } : {}),
      });
    },
  };
}
