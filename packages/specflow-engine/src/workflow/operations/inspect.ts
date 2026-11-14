import type { AttentionItem } from '../attention/model';
import { handoffOf, type Handoff } from '@nevo/workflow';
import { taskReadiness, type TaskReadiness } from '../tasks/tasks';
import type { SpecificationExecutionRecord, ExecutionTask, WorkflowRun } from '../state/model';
import type { TaskResourceIssue } from '../../tasks/resource/validate';
import { WorkflowError } from '../errors';
import { taskProjection, type ActionDependencies, type ActionProjection } from './actions';
import { deriveAttention } from './attention';
import { executionTasks, pinnedDefinitionIfUnchanged } from './loaded-execution';
import type { ExecutionSnapshot } from '../state/store';

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
    /** The revision of the Task's manifest, which an edit or a removal names (compare-and-set). */
    readonly revision: string;
    readonly readiness: TaskReadiness;
    readonly handoff?: Handoff;
    /**
     * The workflow the run is pinned to is missing or no longer the loaded definition: its next
     * operation fails with `WORKFLOW_DEFINITION_CHANGED` (attention `definition-changed` while the
     * Task is `ready` and its run has not ended).
     */
    readonly definitionChanged?: true;
  }[];
  /**
   * The broken Tasks, in id order (`executionTasks`): an index entry without its folder or manifest,
   * a run record whose Task is not registered, or a run that contradicts the Task's status or whose
   * position does not follow from its history (a registered Task without a run record has not
   * started; it is in `tasks`). Each cannot start, finish or change status, keeps the wait open and
   * blocks its dependents until its files are restored; it is not in `tasks`.
   */
  readonly brokenTasks: readonly string[];
  /** The consistency issues of the Task resources (dangling, unregistered, broken, dependencies). */
  readonly issues: readonly TaskResourceIssue[];
  /**
   * Every attention item, derived from the state on every inspection: `deriveAttention` and the
   * start blockers of the approved Tasks that have not started (`startBlockerAttention`, from their
   * action projection). Broken Tasks first, then the Specification, then its Tasks in id order; at
   * most one per subject. `readExecution` and `inspectActions` carry the same items.
   */
  readonly attention: readonly AttentionItem[];
}

/**
 * Read-only view of a Specification's execution: runs, Task readiness, broken Tasks and the
 * attention the state needs. It reads inside `serialize`, so it never sees a mutation half-applied.
 */
export function inspectExecution(
  dependencies: ActionDependencies,
  specId: string,
): Promise<ExecutionInspection> {
  return dependencies.serialize(
    async () =>
      (await inspectSnapshot(dependencies, await dependencies.store.read(specId))).inspection,
  );
}

/**
 * {@link inspectExecution} of a snapshot already read (inside `serialize`), with the action
 * projections it made: those of the approved Tasks that have not started (their start blockers are
 * attention when a person has to fix them) and those `projected` names. Read-only.
 */
export async function inspectSnapshot(
  dependencies: ActionDependencies,
  snapshot: ExecutionSnapshot,
  projected: readonly string[] = [],
): Promise<{
  readonly inspection: ExecutionInspection;
  readonly projections: ReadonlyMap<string, ActionProjection>;
}> {
  const { catalogue } = dependencies;
  const specId = snapshot.specId;
  const { tasks, broken } = executionTasks(catalogue, snapshot);
  const revisions = new Map(
    snapshot.manifests.map((entry) => [entry.value.id, entry.revision] as const),
  );
  // Every Task of `tasks` has its manifest; a missing revision is a defect, never a default.
  const revisionOf = (taskId: string) => {
    const revision = revisions.get(taskId);
    if (revision === undefined) {
      throw new WorkflowError('WORKFLOW_STATE_CORRUPT', `The Task "${taskId}" has no manifest.`);
    }

    return revision;
  };

  const derived = deriveAttention(catalogue, snapshot);
  const projections = new Map<string, ActionProjection>();
  const attention = [...derived];
  for (const task of tasks) {
    const unstarted = !task.run && task.status === 'ready';
    if (!unstarted && !projected.includes(task.taskId)) {
      continue;
    }

    const projection = await taskProjection(
      dependencies,
      snapshot,
      { kind: 'task', specId, taskId: task.taskId },
      derived,
    );
    projections.set(task.taskId, projection);
    if (unstarted && projection.attention) {
      attention.push(projection.attention);
    }
  }

  const specification = snapshot.specification?.value;
  const specificationHandoff = specification ? handoffOf(specification.run) : undefined;
  const changed = (run: WorkflowRun) =>
    pinnedDefinitionIfUnchanged(catalogue, run) ? {} : { definitionChanged: true as const };

  return {
    projections,
    inspection: {
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
        const handoff = record.run ? handoffOf(record.run) : undefined;

        return {
          record,
          revision: revisionOf(record.taskId),
          readiness: taskReadiness(record, tasks),
          ...(handoff ? { handoff } : {}),
          ...(record.run ? changed(record.run) : {}),
        };
      }),
      brokenTasks: broken,
      issues: snapshot.issues,
      attention: ordered(attention),
    },
  };
}

/** Broken Tasks first, then the Specification, then its Tasks in id order. */
function ordered(items: AttentionItem[]): AttentionItem[] {
  const id = (item: AttentionItem) => (item.subject.kind === 'task' ? item.subject.taskId : '');
  const rank = (item: AttentionItem) =>
    item.reason === 'task-broken' ? 0 : item.subject.kind === 'specification' ? 1 : 2;

  return items.sort(
    (left, right) =>
      rank(left) - rank(right) || (id(left) < id(right) ? -1 : id(left) > id(right) ? 1 : 0),
  );
}
