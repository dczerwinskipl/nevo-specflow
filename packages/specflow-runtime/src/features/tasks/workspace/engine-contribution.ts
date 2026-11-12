import { inspectExecution, type ExecutionInspection } from '@nevo/specflow-engine';

import {
  inspectSpecification,
  TaskSourceUnavailableError,
  type TaskEngine,
} from '../engine/sources';
import { taskStatusOf, type InspectedTask } from '../engine/projection';

interface WorkspaceTaskRow {
  readonly id: string;
  readonly title: string;
  readonly status: ReturnType<typeof taskStatusOf>;
}

interface WorkspaceTaskAttention {
  readonly id: string;
  readonly kind: 'task' | 'specification';
  readonly title: string;
  readonly reason: string;
  readonly targetId?: string;
  readonly priority?: 'critical' | 'high' | 'normal';
}

/** The shape of the Specification workspace `tasks` section (the Specs feature consumes it). */
export type WorkspaceTasksSection =
  | {
      readonly state: 'available';
      readonly data: {
        readonly groups: { id: string; name: string; tasks: WorkspaceTaskRow[] }[];
        readonly completed: number;
        readonly total: number;
        readonly attention: WorkspaceTaskAttention[];
      };
    }
  | { readonly state: 'unavailable'; readonly reason: 'not_implemented' | 'source_unavailable' };

/** The `tasks` contribution: the section and the preparation state the Tasks imply. */
export interface WorkspaceTasksContribution {
  readonly section: WorkspaceTasksSection;
  /** Absent: the Tasks could not be read, so the Specification source's value stands. */
  readonly preparationState?: 'empty' | 'preparing' | 'prepared';
}

/**
 * The groups follow what the owner has to do (UX contract "Specification Overview"), in this order;
 * an empty group is omitted.
 */
const GROUPS = [
  { id: 'needs-approval', name: 'Needs approval' },
  { id: 'in-progress', name: 'In progress' },
  { id: 'ready', name: 'Ready to start' },
  { id: 'waiting', name: 'Waiting' },
  { id: 'done', name: 'Done' },
  { id: 'held', name: 'On hold or cancelled' },
] as const;

function groupOf(entry: InspectedTask): (typeof GROUPS)[number]['id'] {
  switch (taskStatusOf(entry).id) {
    case 'draft':
      return 'needs-approval';
    case 'in-progress':
      return 'in-progress';
    case 'ready':
      return 'ready';
    case 'waiting':
      return 'waiting';
    case 'completed':
      return 'done';
    default:
      return 'held';
  }
}

/** Completed Tasks of all that are still meant to be done (cancelled ones are not). */
export function taskProgress(inspection: ExecutionInspection): {
  completed: number;
  total: number;
} {
  const counted = inspection.tasks.filter((entry) => entry.record.status !== 'cancelled');

  return {
    completed: counted.filter((entry) => taskStatusOf(entry).id === 'completed').length,
    // A broken Task is still one of the Specification's Tasks; it is not done.
    total: counted.length + inspection.brokenTasks.length,
  };
}

/** The workspace `tasks` section and preparation state of one inspection. Pure. */
export function workspaceTasksOf(inspection: ExecutionInspection): WorkspaceTasksContribution {
  const titles = new Map(
    inspection.tasks.map((entry) => [entry.record.taskId, entry.record.title]),
  );
  const groups = GROUPS.flatMap((group) => {
    const tasks = inspection.tasks
      .filter((entry) => groupOf(entry) === group.id)
      .map((entry) => ({
        id: entry.record.taskId,
        title: entry.record.title,
        status: taskStatusOf(entry),
      }));

    return tasks.length ? [{ id: group.id, name: group.name, tasks }] : [];
  });
  const attention: WorkspaceTaskAttention[] = [
    ...inspection.brokenTasks.map((taskId) => ({
      id: `task-broken.${taskId}`,
      kind: 'task' as const,
      title: taskId,
      reason: 'The Task is broken: restore its files from Git.',
      targetId: taskId,
      priority: 'high' as const,
    })),
    ...inspection.attention.map((item) =>
      item.subject.kind === 'task'
        ? {
            id: `task-attention.${item.subject.taskId}`,
            kind: 'task' as const,
            title: titles.get(item.subject.taskId) ?? item.subject.taskId,
            reason: `${item.step}: ${item.reason}`,
            targetId: item.subject.taskId,
            priority: 'normal' as const,
          }
        : {
            id: 'specification-attention',
            kind: 'specification' as const,
            title: item.step,
            reason: item.reason,
            priority: 'normal' as const,
          },
    ),
  ];
  const { completed, total } = taskProgress(inspection);
  const count = inspection.tasks.length + inspection.brokenTasks.length;

  return {
    section: { state: 'available', data: { groups, completed, total, attention } },
    preparationState:
      count === 0
        ? 'empty'
        : inspection.tasks.some((entry) => entry.record.status === 'draft')
          ? 'preparing'
          : 'prepared',
  };
}

/**
 * Project mode's `tasks` contribution: one Engine inspection of the Specification's Task resources
 * and runs. An unreadable execution degrades only this section (`source_unavailable`).
 */
export function createEngineWorkspaceTasks(
  source: TaskEngine,
): (specId: string) => Promise<WorkspaceTasksContribution> {
  return async (specId) => {
    try {
      const basis = await inspectSpecification(source, specId);

      return basis
        ? workspaceTasksOf(basis.inspection)
        : { section: { state: 'unavailable', reason: 'source_unavailable' } };
    } catch (error) {
      if (error instanceof TaskSourceUnavailableError) {
        return { section: { state: 'unavailable', reason: 'source_unavailable' } };
      }

      throw error;
    }
  };
}

export type TaskProgressSource = (
  specIds: readonly string[],
) => Promise<ReadonlyMap<string, { completed: number; total: number } | null>>;

/**
 * The Specs Overview `progress` of the listed Specifications: the definitions are loaded once, each
 * Specification is inspected on its own. A Specification whose execution cannot be read has
 * `null` (not projected), never a guessed count; the other rows are unaffected.
 */
export function createEngineTaskProgress(source: TaskEngine): TaskProgressSource {
  return async (specIds) => {
    const progress = new Map<string, { completed: number; total: number } | null>();
    if (specIds.length === 0) {
      return progress;
    }

    let workflow;
    try {
      workflow = await source.openWorkflow();
    } catch {
      return new Map(specIds.map((specId) => [specId, null]));
    }

    for (const specId of specIds) {
      try {
        progress.set(specId, taskProgress(await inspectExecution(workflow, specId)));
      } catch {
        progress.set(specId, null);
      }
    }

    return progress;
  };
}
