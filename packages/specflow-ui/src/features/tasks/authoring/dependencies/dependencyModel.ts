import type { TaskAuthoring } from '@nevo/specflow-contracts/workflow';

/** A Task of the Specification as the dependency rows and picker name it (workspace rows). */
export interface DependencyTask {
  readonly id: string;
  readonly title: string;
  readonly statusLabel: string;
  readonly statusId?: string;
  readonly typeTitle?: string;
}

export type DependencyCandidate = TaskAuthoring['dependencyCandidates'][number] & {
  readonly task: DependencyTask;
};

/**
 * The Engine's dependency candidates (`taskAuthoring.dependencyCandidates`, with the reason one
 * cannot be added) named by the workspace rows. The UI decides nothing about eligibility.
 */
export function namedCandidates(
  candidates: TaskAuthoring['dependencyCandidates'],
  tasks: readonly DependencyTask[],
): DependencyCandidate[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));

  return candidates.map((candidate) => ({
    ...candidate,
    task: byId.get(candidate.taskId) ?? {
      id: candidate.taskId,
      title: candidate.taskId,
      statusLabel: '',
    },
  }));
}
