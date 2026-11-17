import type { TaskListResponse } from '@nevo/specflow-contracts/specs/workspace';
import type { TaskProgressData } from '../../specs/read-model';
import type { TaskAttentionFacts, TaskLifecycle } from '../read-model';

/** One Task row of the Tasks page, as the Runtime presents it. */
export interface TaskListRowView {
  readonly id: string;
  /** Absent for a broken Task whose manifest cannot be read. */
  readonly title?: string;
  readonly typeTitle?: string;
  readonly dependsOn?: readonly string[];
  /** The status line's id (`draft`, `waiting`, …) and lifecycle. */
  readonly statusId: string;
  readonly lifecycle: TaskLifecycle;
  /** It waits for these dependencies (that can all still complete). */
  readonly waitingFor?: readonly string[];
  /** The reason recorded when it was put on hold, verbatim (only while on hold). */
  readonly holdReason?: string;
  /**
   * A person has to act on it: the Engine's attention item about it, or the Specification's item
   * that names it (`task-escalated` with its `taskIds`).
   */
  readonly attention?: TaskAttentionFacts;
  /** The Specification's `tasks-stuck` names it. */
  readonly blocksSpecification?: boolean;
  readonly broken?: boolean;
}

export interface TaskListGroupView {
  readonly id: string;
  readonly name: string;
  readonly collapsed: boolean;
  readonly rows: readonly TaskListRowView[];
}

export interface TaskListView {
  readonly groups: readonly TaskListGroupView[];
  readonly progress?: TaskProgressData;
  /** With `?blocking=specification`: how many Tasks match out of all listed. */
  readonly filter?: { readonly matched: number; readonly total: number };
}

/** The project Runtime's Tasks page read, rendered as delivered (no grouping in the UI). */
export function taskListViewOf(response: TaskListResponse): TaskListView {
  // The Engine reports at most one item per Task: its own, or a Specification item naming it.
  const items = new Map<string, TaskAttentionFacts>();
  for (const item of response.attention) {
    const facts: TaskAttentionFacts = {
      reason: item.reason,
      message: item.message,
      ...(item.stepTitle !== undefined ? { stepTitle: item.stepTitle } : {}),
      ...(item.blocks ? { blocks: item.blocks } : {}),
    };
    if (item.subject.kind === 'task') {
      items.set(item.subject.taskId, facts);
    } else if (item.reason === 'task-escalated') {
      for (const taskId of item.taskIds ?? []) {
        items.set(taskId, facts);
      }
    }
  }

  return {
    groups: response.groups.map((group) => ({
      id: group.id,
      name: group.name,
      collapsed: group.collapsed,
      rows: group.tasks.map((task): TaskListRowView => {
        const attention = items.get(task.id);
        const common = {
          id: task.id,
          ...(task.title !== undefined ? { title: task.title } : {}),
          statusId: task.status.id,
          lifecycle: task.status.lifecycle,
          ...(attention !== undefined ? { attention } : {}),
          ...(task.blocksSpecification ? { blocksSpecification: true } : {}),
        };
        if ('broken' in task) {
          return { ...common, broken: true };
        }

        return {
          ...common,
          typeTitle: task.type.title,
          dependsOn: task.dependsOn,
          ...(task.holdReason !== undefined ? { holdReason: task.holdReason } : {}),
          ...(task.facts.dependencyWait && task.facts.dependencyWait.waitingFor.length > 0
            ? { waitingFor: task.facts.dependencyWait.waitingFor }
            : {}),
        };
      }),
    })),
    progress: response.progress,
    ...(response.filter
      ? { filter: { matched: response.filter.matched, total: response.filter.total } }
      : {}),
  };
}
