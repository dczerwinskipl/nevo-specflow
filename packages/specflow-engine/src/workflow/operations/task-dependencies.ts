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

/** The dependency rule of one Task, its graph facts read once for any number of questions. */
export interface DependencyRule {
  /**
   * Why `dependency` cannot be one of the Task's dependencies when its whole list becomes
   * `dependsOn` (which names it), or `undefined`; `previous` is the list stored now.
   */
  refusal(
    dependency: string,
    dependsOn: readonly string[],
    previous: readonly string[],
  ): DependencyRefusal | undefined;
}

/**
 * The single rule of a manual dependency of `taskId`: the dependency is a registered Task, not the
 * Task itself and not broken; one newly added is not cancelled (it would never complete); and the
 * Task's whole dependency list closes no cycle with every other Task's.
 *
 * A list closes a cycle exactly when one of its Tasks is the Task itself or reaches it through the
 * other Tasks' dependencies, or when the other Tasks form a cycle without it. Both facts are read
 * once (one walk of the graph each), however many dependencies are asked about, so asking it for
 * every other Task of a Specification stays linear in the size of the graph.
 */
export function dependencyRule(view: DependencyView, taskId: string): DependencyRule {
  let facts: GraphFacts | undefined;

  return {
    refusal(dependency, dependsOn, previous) {
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

      facts ??= graphFactsOf(view.graph, taskId);
      const { reachesTask, otherCycle } = facts;

      return otherCycle || dependsOn.some((id) => id === taskId || reachesTask.has(id))
        ? 'would-create-cycle'
        : undefined;
    },
  };
}

interface GraphFacts {
  /** The Tasks whose dependencies lead to the Task (without its own dependencies). */
  readonly reachesTask: ReadonlySet<string>;
  /** The other Tasks' dependencies form a cycle by themselves. */
  readonly otherCycle: boolean;
}

/** {@link GraphFacts}: one reverse walk from the Task and one `dependencyCycle` walk. */
function graphFactsOf(graph: ReadonlyMap<string, readonly string[]>, taskId: string): GraphFacts {
  const others = new Map(graph);
  others.set(taskId, []);
  const dependents = new Map<string, string[]>();
  for (const [id, dependsOn] of others) {
    for (const dependency of dependsOn) {
      const list = dependents.get(dependency) ?? [];
      list.push(id);
      dependents.set(dependency, list);
    }
  }

  const reachesTask = new Set<string>();
  const queue = [taskId];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    for (const dependent of dependents.get(next) ?? []) {
      if (!reachesTask.has(dependent)) {
        reachesTask.add(dependent);
        queue.push(dependent);
      }
    }
  }

  return { reachesTask, otherCycle: dependencyCycle(others) !== undefined };
}
