import type { WorkflowDependencies } from '@nevo/specflow-engine';

import type { TaskEngine, TaskSpecification } from '../engine/sources';

export interface DemoTaskEngineOptions {
  /** The demo workflow's operations (`createDemoWorkflow`). */
  readonly openWorkflow: () => Promise<WorkflowDependencies>;
  /** The demo Specification a Task belongs to; `null` when it does not exist. */
  readonly specification: (specId: string) => Promise<TaskSpecification | null>;
  /** The `task.md` of a demo Task and its revision (the demo Task documents). */
  readonly mainDocument: (
    specId: string,
    taskId: string,
  ) => Promise<{ id: string; revision: string } | null>;
}

/**
 * The Task Engine of the demo Runtime: the same reads, lists and commands as a project Runtime's
 * (`createEngineTaskSources`, `createEngineTaskList`, `createEngineTaskCommands`) over the demo
 * workflow's in-memory state.
 */
export function createDemoTaskEngine(options: DemoTaskEngineOptions): TaskEngine {
  return {
    openWorkflow: options.openWorkflow,
    specification: options.specification,
    async mainDocument(specId, taskId) {
      return { state: 'available', data: await options.mainDocument(specId, taskId) };
    },
  };
}
