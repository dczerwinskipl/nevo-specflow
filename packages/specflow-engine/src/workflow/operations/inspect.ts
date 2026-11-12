import type { AttentionItem } from '../attention/model';
import { handoffOf, type Handoff } from '../core';
import { taskReadiness, type TaskReadiness } from '../tasks/tasks';
import type { SpecificationExecutionRecord, ExecutionTask, WorkflowRun } from '../state/model';
import type { TaskResourceIssue } from '../../tasks/resource/validate';
import { deriveAttention } from './attention';
import {
  executionTasks,
  pinnedDefinitionIfUnchanged,
  type WorkflowDependencies,
} from './loaded-execution';

export interface ExecutionInspection {
  readonly specId: string;
  readonly specification?: {
    readonly record: SpecificationExecutionRecord;
    readonly handoff?: Handoff;
    /** See {@link ExecutionInspection.tasks}. */
    readonly definitionChanged?: true;
  };
  readonly tasks: readonly {
    readonly record: ExecutionTask;
    readonly readiness: TaskReadiness;
    readonly handoff?: Handoff;
    /**
     * The workflow the run is pinned to is missing or no longer the loaded definition: no attention
     * is derived for it, and its next operation fails with `WORKFLOW_DEFINITION_CHANGED`.
     */
    readonly definitionChanged?: true;
  }[];
  /**
   * The broken Tasks, in id order (`executionTasks`): a run record whose Task is not registered, a
   * run that contradicts the Task's status or whose position does not follow from its history, or a
   * registered Task without its run record. Each cannot start, finish or change status, keeps the
   * wait open and blocks its dependents until its files are restored; it is not in `tasks`.
   */
  readonly brokenTasks: readonly string[];
  /** The consistency issues of the Task resources (dangling, unregistered, broken, dependencies). */
  readonly issues: readonly TaskResourceIssue[];
  /** Derived from the state on every inspection (`deriveAttention`). */
  readonly attention: readonly AttentionItem[];
}

/**
 * Read-only view of a Specification's execution: runs, Task readiness, broken Tasks and the
 * attention the state needs. It reads inside `serialize`, so it never sees a mutation half-applied.
 */
export function inspectExecution(
  dependencies: Pick<WorkflowDependencies, 'store' | 'serialize' | 'catalogue'>,
  specId: string,
): Promise<ExecutionInspection> {
  return dependencies.serialize(async () => {
    const snapshot = await dependencies.store.read(specId);
    const { tasks, broken } = executionTasks(dependencies.catalogue, snapshot);
    const specification = snapshot.specification?.value;
    const specificationHandoff = specification ? handoffOf(specification.run) : undefined;
    const changed = (run: WorkflowRun) =>
      pinnedDefinitionIfUnchanged(dependencies.catalogue, run)
        ? {}
        : { definitionChanged: true as const };

    return {
      specId,
      ...(specification
        ? {
            specification: {
              record: specification,
              ...(specificationHandoff ? { handoff: specificationHandoff } : {}),
              ...changed(specification.run),
            },
          }
        : {}),
      tasks: tasks.map((record) => {
        const handoff = handoffOf(record.run);

        return {
          record,
          readiness: taskReadiness(record, tasks),
          ...(handoff ? { handoff } : {}),
          ...changed(record.run),
        };
      }),
      brokenTasks: broken,
      issues: snapshot.issues,
      attention: deriveAttention(dependencies.catalogue, snapshot),
    };
  });
}
