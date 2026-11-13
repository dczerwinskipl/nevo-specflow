import { dependencyCycle } from '../state/dependency-cycle';
import type { ExecutionTask } from '../state/model';
import type { ExecutionSnapshot } from '../state/store';

/** Why a Task cannot name another as a dependency. */
export type DependencyRefusal = 'unknown' | 'broken' | 'cancelled' | 'would-create-cycle';

/** What the dependency rule reads: the Tasks, the broken ones and every manifest's dependencies. */
export interface DependencyView {
  readonly byId: ReadonlyMap<string, ExecutionTask>;
  readonly broken: readonly string[];
  readonly graph: ReadonlyMap<string, readonly string[]>;
}

export function dependencyView(
  snapshot: ExecutionSnapshot,
  tasks: readonly ExecutionTask[],
  broken: readonly string[],
): DependencyView {
  return {
    byId: new Map(tasks.map((task) => [task.taskId, task] as const)),
    broken,
    graph: new Map(
      snapshot.manifests.map((entry) => [entry.value.id, entry.value.dependsOn] as const),
    ),
  };
}

/**
 * The single rule of a manual dependency: the dependency is a registered Task, not the Task itself
 * and not broken; one newly added is not cancelled (it would never complete); and the Task's whole
 * dependency list `dependsOn` (which names it) closes no cycle with every other Task's.
 */
export function dependencyRefusal(
  view: DependencyView,
  taskId: string,
  dependency: string,
  dependsOn: readonly string[],
  previous: readonly string[],
): DependencyRefusal | undefined {
  if (view.broken.includes(dependency)) {
    return 'broken';
  }

  const task = view.byId.get(dependency);
  if (!task || dependency === taskId) {
    return 'unknown';
  }

  if (task.status === 'cancelled' && !previous.includes(dependency)) {
    return 'cancelled';
  }

  const graph = new Map(view.graph);
  graph.set(taskId, dependsOn);

  return dependencyCycle(graph) === undefined ? undefined : 'would-create-cycle';
}
