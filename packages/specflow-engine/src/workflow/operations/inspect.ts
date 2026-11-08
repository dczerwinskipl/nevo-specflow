import type { AttentionItem } from '../attention/model';
import { handoffOf, type Handoff } from '../progression/progression';
import { taskReadiness, type TaskReadiness } from '../tasks/tasks';
import type { SpecificationExecutionRecord, TaskRecord, WorkflowRun } from '../state/model';
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
    readonly record: TaskRecord;
    readonly readiness: TaskReadiness;
    readonly handoff?: Handoff;
    /**
     * The workflow the run is pinned to is missing or no longer the loaded definition: no attention
     * is derived for it, and its next operation fails with `WORKFLOW_DEFINITION_CHANGED`.
     */
    readonly definitionChanged?: true;
  }[];
  /**
   * The broken Tasks, in list order: listed without a record, or with a position that does not follow
   * from its history (`executionTasks`). Each cannot start, finish or change status, keeps the wait
   * open and blocks its dependents until its record is restored. A broken Task with a record is
   * still in `tasks`, but its readiness and position are not meaningful there.
   */
  readonly brokenTasks: readonly string[];
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
      tasks: snapshot.tasks.map(({ value: record }) => {
        const handoff = handoffOf(record.run);

        return {
          record,
          readiness: taskReadiness(record, tasks),
          ...(handoff ? { handoff } : {}),
          // Load-bearing: a broken Task's pinned workflow is unchanged, so `changed` would check its
          // position and throw `WORKFLOW_STATE_CORRUPT`, failing the whole inspection.
          ...(broken.includes(record.taskId) ? {} : changed(record.run)),
        };
      }),
      brokenTasks: broken,
      attention: deriveAttention(dependencies.catalogue, snapshot),
    };
  });
}
