import { readExecution, type ExecutionReading, type TaskLane } from '@nevo/specflow-engine';

import {
  inspectSpecification,
  TaskSourceUnavailableError,
  type TaskEngine,
} from '../engine/sources';
import { taskStatusOf } from '../engine/projection';

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
 * an empty group is omitted. Each is a presentation of the Engine's lanes (`TaskLane`); a broken
 * Task has no readable row and is attention instead.
 */
const GROUPS: readonly { id: string; name: string; lanes: readonly TaskLane[] }[] = [
  { id: 'needs-approval', name: 'Needs approval', lanes: ['needs-approval'] },
  { id: 'in-progress', name: 'In progress', lanes: ['in-progress'] },
  { id: 'ready', name: 'Ready to start', lanes: ['ready'] },
  { id: 'waiting', name: 'Waiting', lanes: ['waiting'] },
  { id: 'blocked', name: 'Blocked', lanes: ['blocked'] },
  { id: 'done', name: 'Done', lanes: ['done'] },
  { id: 'held', name: 'On hold or cancelled', lanes: ['held', 'cancelled', 'ended'] },
];

/** The workspace `tasks` section and preparation state of one Engine reading (`tasks: 'all'`). Pure. */
export function workspaceTasksOf(reading: ExecutionReading): WorkspaceTasksContribution {
  const { inspection, lanes } = reading;
  const titles = new Map(
    inspection.tasks.map((entry) => [entry.record.taskId, entry.record.title]),
  );
  const groups = GROUPS.flatMap((group) => {
    const tasks = inspection.tasks.flatMap((entry) => {
      const lane = lanes.get(entry.record.taskId);

      return lane && group.lanes.includes(lane)
        ? [{ id: entry.record.taskId, title: entry.record.title, status: taskStatusOf(lane) }]
        : [];
    });

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
  const progress = reading.progress;

  return {
    section: { state: 'available', data: { groups, ...progress, attention } },
    preparationState: reading.preparation,
  };
}

const unavailable: WorkspaceTasksContribution = {
  section: { state: 'unavailable', reason: 'source_unavailable' },
};

/**
 * Project mode's `tasks` contribution: one Engine reading of every Task. An execution the Engine
 * cannot read now (also a busy lock) degrades only this section (`source_unavailable`).
 */
export function createEngineWorkspaceTasks(
  source: TaskEngine,
): (specId: string) => Promise<WorkspaceTasksContribution> {
  return async (specId) => {
    try {
      const basis = await inspectSpecification(source, specId, 'all');

      return basis ? workspaceTasksOf(basis.reading) : unavailable;
    } catch (error) {
      if (error instanceof TaskSourceUnavailableError) {
        return unavailable;
      }

      throw error;
    }
  };
}

export type TaskProgressSource = (
  specIds: readonly string[],
) => Promise<ReadonlyMap<string, { completed: number; total: number } | null>>;

/**
 * The Specs Overview `progress` of the listed Specifications, the Engine's `TaskProgress`: the
 * definitions are loaded once, each Specification is read on its own. One whose execution cannot be
 * read has `null` (not projected), never a guessed count; the other rows are unaffected.
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
        progress.set(specId, (await readExecution(workflow, specId, { tasks: [] })).progress);
      } catch {
        progress.set(specId, null);
      }
    }

    return progress;
  };
}
