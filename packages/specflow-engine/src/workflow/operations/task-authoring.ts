import type { TaskContextEntry } from '../../tasks/resource/model';
import { unregisteredTaskFiles, type TaskContextIssue } from '../../tasks/resource/validate';
import { TASKS_PER_SPECIFICATION_MAX } from '../limits';
import { taskPosition, type ExecutionTask, type TaskStatus } from '../state/model';
import type { ExecutionSnapshot } from '../state/store';
import { taskDecisionRefusal } from '../tasks/tasks';
import type { LoadedTask, WorkflowDependencies } from './loaded-execution';
import { dependencyRule, dependencyView } from './task-dependencies';
import { defaultContextOf, effectiveContextOf, isAwaited, unresolvedContext } from './task-policy';

/**
 * The authoring part of the action projection: what the owner may do to a Task as a resource
 * (create, decide its status, edit, remove; `operations/task-resource.ts`, `task-status.ts`) and,
 * for one Task on demand, the facts its authoring sections edit (effective context, dependency
 * candidates). The lifecycle availability is cheap and part of every Task projection; the authoring
 * facts read the Task's context and the dependency graph, so only the Task detail asks for them
 * (`inspectActions`), never a read of all Tasks.
 */

/** An action the owner may take now, or why not. */
export type Availability<Reason extends string> =
  | { readonly kind: 'allowed' }
  | {
      readonly kind: 'unavailable';
      readonly reason: Reason;
      /** For `has-dependents`: the Tasks that depend on this one, in id order. */
      readonly taskIds?: readonly string[];
      /** For `unregistered-files`: the files of the Task folder it does not register. */
      readonly files?: readonly string[];
    };

export const allowed = { kind: 'allowed' } as const;
export const unavailable = <Reason extends string>(
  reason: Reason,
  details: { readonly taskIds?: readonly string[]; readonly files?: readonly string[] } = {},
): Availability<Reason> => ({ kind: 'unavailable', reason, ...details });

export type TaskActionUnavailableReason =
  /** The Task's status does not allow it (for example approving a Task that is not a draft). */
  | 'status'
  /** The Task's run ended. */
  | 'ended'
  | 'cancelled'
  /** An attempt is active: finish or return the current step first. */
  | 'active-attempt'
  /** The Task has started: its dependencies are fixed; it is cancelled, not removed. */
  | 'started'
  | 'has-dependents'
  /**
   * A change of one of the Task's documents is pending (D03): the change would write its folder,
   * which the store refuses (`WORKFLOW_TASK_BUSY`, reason `task-document-change`).
   */
  | 'task-document-change'
  /** The Task folder holds files it does not register; move or register them first. */
  | 'unregistered-files'
  | 'broken'
  /**
   * The Specification's workflow ended (completed or abandoned): its Tasks stay as they are for
   * audit, so they are neither edited nor removed (`WORKFLOW_SPECIFICATION_ENDED`).
   */
  | 'specification-ended';

/** The owner's Task lifecycle actions (`setTaskStatus`, `editTask`, `removeTask`). */
export interface TaskLifecycleActions {
  /** The manifest revision an edit or a removal names; absent for a broken Task. */
  readonly revision?: string;
  readonly approve: Availability<TaskActionUnavailableReason>;
  /** Shown disabled with its reason during an active attempt (UX contract). */
  readonly hold: Availability<TaskActionUnavailableReason>;
  readonly resume: Availability<TaskActionUnavailableReason>;
  readonly cancel: Availability<TaskActionUnavailableReason>;
  readonly remove: Availability<TaskActionUnavailableReason>;
  /** Title and summary. */
  readonly editDetails: Availability<TaskActionUnavailableReason>;
  readonly editContext: Availability<TaskActionUnavailableReason>;
  /** Only before the first start. */
  readonly editDependencies: Availability<TaskActionUnavailableReason>;
}

/** One entry of a Task's effective context and whether its reference resolves now. */
export type TaskContextEntryState =
  | { readonly entry: TaskContextEntry; readonly state: 'resolved' }
  | {
      readonly entry: TaskContextEntry;
      readonly state: 'unresolved';
      readonly reason: TaskContextIssue['reason'];
    }
  /** A missing process artifact (`artifact: true`): expected, not stale. */
  | { readonly entry: TaskContextEntry; readonly state: 'awaited' };

/** Why another Task cannot be added as a dependency now (the rule of `editTask`). */
export type DependencyIneligibility = 'dependency' | 'would-create-cycle' | 'cancelled' | 'broken';

export interface DependencyCandidate {
  readonly taskId: string;
  /** Absent: it may be added. */
  readonly unavailable?: DependencyIneligibility;
}

/** What the owner edits on a Task, as the Engine reads it (the authoring sections render it). */
export interface TaskAuthoringFacts {
  readonly context: {
    /** No explicit list: the default context; an edit writes these entries out. */
    readonly isDefault: boolean;
    readonly entries: readonly TaskContextEntryState[];
    /**
     * The default context as the Engine would read it now: `entries` while `isDefault`, else the
     * list `context: null` returns to (read-only; a client never derives it).
     */
    readonly defaultEntries: readonly TaskContextEntry[];
  };
  /** The other Tasks in list order; empty when the dependencies cannot change (started). */
  readonly dependencyCandidates: readonly DependencyCandidate[];
}

/** The Specification's run ended: `createTask`, `editTask` and `removeTask` refuse. */
export function specificationEnded(snapshot: ExecutionSnapshot): boolean {
  return snapshot.specification?.value.run.position.state === 'terminal';
}

/** Whether `createTask` would accept a new Task now (its input aside). */
export function createTaskAvailability(
  snapshot: ExecutionSnapshot,
): Availability<'task-limit' | 'specification-ended'> {
  return specificationEnded(snapshot)
    ? unavailable('specification-ended')
    : (snapshot.index?.value.tasks.length ?? 0) >= TASKS_PER_SPECIFICATION_MAX
      ? unavailable('task-limit')
      : allowed;
}

/**
 * The lifecycle actions of a Task that is not broken, and whether a change of one of its documents
 * is pending (D03; a finish that writes its folder is refused then too).
 *
 * `listFolder`: list the Task's folder for the files it does not register (`remove`
 * `unregistered-files`). Only the Task's own detail does (one listing); a read of every Task does
 * no per-Task filesystem work, so its `remove` does not name unregistered files (`removeTask`
 * still refuses them).
 */
export async function taskLifecycleOf(
  dependencies: Pick<WorkflowDependencies, 'store' | 'references'>,
  snapshot: ExecutionSnapshot,
  { task, manifest }: LoadedTask,
  listFolder: boolean,
): Promise<{ readonly lifecycle: TaskLifecycleActions; readonly pending: boolean }> {
  const pending = await dependencies.references.pendingDocumentChange(snapshot.specId, task.taskId);
  // Only a Task that never started can be removed, so only its folder is listed.
  const unregistered =
    task.run || !listFolder
      ? []
      : unregisteredTaskFiles(
          manifest.value,
          await dependencies.store.taskFiles(snapshot.specId, task.taskId),
        );

  return {
    lifecycle: lifecycleOf(task, manifest.revision, snapshot, pending, unregistered),
    pending,
  };
}

/**
 * The owner's lifecycle actions on a Task that is not broken: the status decisions ask
 * `taskDecisionRefusal` (no hold or cancel during an active attempt), the edits and the removal
 * follow `editTask` and `removeTask`, which refuse first once the Specification's run ended.
 */
function lifecycleOf(
  task: ExecutionTask,
  revision: string,
  snapshot: ExecutionSnapshot,
  pending: boolean,
  unregistered: readonly string[],
): TaskLifecycleActions {
  type Action = Availability<TaskActionUnavailableReason>;
  const state = taskPosition(task).state;
  const decision = (from: TaskStatus | undefined, to: TaskStatus): Action => {
    const refusal = taskDecisionRefusal(task, to);
    if (refusal === 'ended') {
      return unavailable('ended');
    }

    if (to === 'cancelled' && task.status === 'cancelled') {
      return unavailable('cancelled');
    }

    if (refusal === 'status' || (from !== undefined && task.status !== from)) {
      return unavailable('status');
    }

    if (refusal === 'active-attempt') {
      return unavailable('active-attempt');
    }

    return pending ? unavailable('task-document-change') : allowed;
  };

  const ended = specificationEnded(snapshot);
  const edit: Action = ended
    ? unavailable('specification-ended')
    : task.status === 'cancelled'
      ? unavailable('cancelled')
      : state === 'terminal'
        ? unavailable('ended')
        : pending
          ? unavailable('task-document-change')
          : allowed;
  const dependents = snapshot.manifests
    .filter((entry) => entry.value.dependsOn.includes(task.taskId))
    .map((entry) => entry.value.id)
    .sort();

  return {
    revision,
    approve: decision('draft', 'ready'),
    hold: decision('ready', 'on-hold'),
    resume: decision('on-hold', 'ready'),
    cancel: decision(undefined, 'cancelled'),
    remove: ended
      ? unavailable('specification-ended')
      : task.run
        ? unavailable('started')
        : dependents.length > 0
          ? unavailable('has-dependents', { taskIds: dependents })
          : pending
            ? unavailable('task-document-change')
            : unregistered.length > 0
              ? unavailable('unregistered-files', { files: unregistered })
              : allowed,
    editDetails: edit,
    editContext: edit,
    editDependencies: edit.kind === 'allowed' && task.run ? unavailable('started') : edit,
  };
}

/** The effective context with each entry's state, from the one effective-context rule. */
async function contextStates(
  dependencies: Pick<WorkflowDependencies, 'references'>,
  specId: string,
  task: ExecutionTask,
): Promise<TaskAuthoringFacts['context']> {
  const effective = await effectiveContextOf(dependencies, specId, task);
  const issues = new Map(
    (await unresolvedContext(dependencies, specId, task)).map((issue) => [issue.index, issue]),
  );

  return {
    isDefault: effective.isDefault,
    defaultEntries: effective.isDefault
      ? effective.entries
      : await defaultContextOf(dependencies, specId, task),
    entries: effective.entries.map((entry, index): TaskContextEntryState => {
      const issue = issues.get(index);
      if (!issue) {
        return { entry, state: 'resolved' };
      }

      return isAwaited(issue)
        ? { entry, state: 'awaited' }
        : { entry, state: 'unresolved', reason: issue.reason };
    }),
  };
}

/**
 * The other Tasks a dependency could name, each asked of the rule `editTask` applies
 * (`dependencyRule`) as if it were added to the Task's current dependencies. The rule reads the
 * graph once for all of them.
 */
export function dependencyCandidatesOf(
  snapshot: ExecutionSnapshot,
  tasks: readonly ExecutionTask[],
  broken: readonly string[],
  task: ExecutionTask,
): DependencyCandidate[] {
  const rule = dependencyRule(dependencyView(snapshot, tasks, broken), task.taskId);
  const order = snapshot.index?.value.tasks.map((entry) => entry.id) ?? [];

  return order
    .filter((id) => id !== task.taskId)
    .map((id): DependencyCandidate => {
      if (task.dependsOn.includes(id)) {
        return { taskId: id, unavailable: 'dependency' };
      }

      const refusal = rule.refusal(id, [...task.dependsOn, id], task.dependsOn);
      // An index entry without a readable Task is broken (`executionTasks` lists it so).
      const unavailable = refusal === 'unknown' ? 'broken' : refusal;

      return unavailable === undefined ? { taskId: id } : { taskId: id, unavailable };
    });
}

/**
 * The authoring facts of one Task that is not broken (the Task detail asks for them; a read of
 * every Task never does).
 */
export async function taskAuthoringOf(
  dependencies: Pick<WorkflowDependencies, 'references'>,
  snapshot: ExecutionSnapshot,
  tasks: { readonly tasks: readonly ExecutionTask[]; readonly broken: readonly string[] },
  task: ExecutionTask,
  dependenciesEditable: boolean,
): Promise<TaskAuthoringFacts> {
  return {
    context: await contextStates(dependencies, snapshot.specId, task),
    dependencyCandidates: dependenciesEditable
      ? dependencyCandidatesOf(snapshot, tasks.tasks, tasks.broken, task)
      : [],
  };
}
