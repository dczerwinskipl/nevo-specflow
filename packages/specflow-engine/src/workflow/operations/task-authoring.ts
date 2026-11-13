import type { TaskContextEntry } from '../../tasks/resource/model';
import type { TaskContextIssue } from '../../tasks/resource/validate';
import { dependencyCycle } from '../state/dependency-cycle';
import type { ExecutionTask } from '../state/model';
import type { ExecutionSnapshot } from '../state/store';
import type { WorkflowDependencies } from './loaded-execution';
import { effectiveContextOf, isAwaited, unresolvedContext } from './task-policy';

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
  };
  /** The other Tasks in list order; empty when the dependencies cannot change (started). */
  readonly dependencyCandidates: readonly DependencyCandidate[];
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
 * The other Tasks a dependency could name, with the conditions `editTask` refuses: a broken Task, a
 * cancelled one (it would never complete), and one whose addition closes a dependency cycle.
 */
export function dependencyCandidatesOf(
  snapshot: ExecutionSnapshot,
  tasks: readonly ExecutionTask[],
  broken: readonly string[],
  task: ExecutionTask,
): DependencyCandidate[] {
  const graph = new Map(
    snapshot.manifests.map((entry) => [entry.value.id, entry.value.dependsOn] as const),
  );
  const byId = new Map(tasks.map((other) => [other.taskId, other] as const));
  const order = snapshot.index?.value.tasks.map((entry) => entry.id) ?? [];

  return order
    .filter((id) => id !== task.taskId)
    .map((id): DependencyCandidate => {
      if (task.dependsOn.includes(id)) {
        return { taskId: id, unavailable: 'dependency' };
      }

      if (broken.includes(id)) {
        return { taskId: id, unavailable: 'broken' };
      }

      if (byId.get(id)?.status === 'cancelled') {
        return { taskId: id, unavailable: 'cancelled' };
      }

      const next = new Map(graph);
      next.set(task.taskId, [...task.dependsOn, id]);

      return dependencyCycle(next) === undefined
        ? { taskId: id }
        : { taskId: id, unavailable: 'would-create-cycle' };
    });
}

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
