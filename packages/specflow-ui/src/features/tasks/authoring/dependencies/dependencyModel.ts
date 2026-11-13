/** A Task of the Specification as the dependency picker lists it (from the workspace rows). */
export interface DependencyTask {
  readonly id: string;
  readonly title: string;
  readonly statusLabel: string;
  readonly typeTitle?: string;
  /** Absent when the Runtime does not report it (no cycle can be shown then). */
  readonly dependsOn?: readonly string[];
}

export type DependencyCandidate =
  | { readonly task: DependencyTask; readonly state: 'available' }
  | { readonly task: DependencyTask; readonly state: 'existing' }
  /** Choosing it would close a cycle: it already depends, directly or not, on the Task. */
  | { readonly task: DependencyTask; readonly state: 'cycle' };

/** Whether `from` reaches `target` through the dependencies. */
function dependsTransitively(
  tasks: ReadonlyMap<string, DependencyTask>,
  from: string,
  target: string,
): boolean {
  const seen = new Set<string>();
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === target) {
      return true;
    }

    if (!seen.has(current)) {
      seen.add(current);
      queue.push(...(tasks.get(current)?.dependsOn ?? []));
    }
  }

  return false;
}

/**
 * The other Tasks of the Specification for the dependency picker, in list order: those already a
 * dependency (checked, disabled), those that would close a cycle (disabled, with the reason) and
 * the rest. The Engine still refuses a cycle; this only avoids offering one it would refuse.
 */
export function dependencyCandidates(
  tasks: readonly DependencyTask[],
  taskId: string,
  dependsOn: readonly string[],
): DependencyCandidate[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));

  return tasks
    .filter((task) => task.id !== taskId)
    .map((task): DependencyCandidate => {
      if (dependsOn.includes(task.id)) {
        return { task, state: 'existing' };
      }

      return dependsTransitively(byId, task.id, taskId)
        ? { task, state: 'cycle' }
        : { task, state: 'available' };
    });
}
