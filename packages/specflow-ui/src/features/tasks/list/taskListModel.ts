import type { TaskListEntry, TaskListResponse } from '@nevo/specflow-contracts/specs/workspace';
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
   * A person has to act on it: the row's Engine item (its own, or the Specification's
   * `task-escalated` that names it), as the Runtime delivers it.
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
  /**
   * With a filter (`?blocking=specification` or `?group=<groupId>`): which one, and how many Tasks
   * match out of all listed.
   */
  readonly filter?:
    | { readonly blocking: 'specification'; readonly matched: number; readonly total: number }
    | { readonly group: string; readonly matched: number; readonly total: number };
}

/**
 * One Task row as the Runtime presents it, on the Tasks page and in the Overview's preview (the
 * same `TaskListEntry`). Its attention is the row's own `attention` (the Engine item that names the
 * Task, which the Runtime resolves), never rebuilt from the response's attention list.
 */
export function taskRowViewOf(task: TaskListEntry): TaskListRowView {
  const attention: TaskAttentionFacts | undefined = task.attention
    ? {
        reason: task.attention.reason,
        message: task.attention.message,
        ...(task.attention.stepTitle !== undefined ? { stepTitle: task.attention.stepTitle } : {}),
        ...(task.attention.blocks ? { blocks: task.attention.blocks } : {}),
      }
    : undefined;
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
}

/** The project Runtime's Tasks page read, rendered as delivered (no grouping in the UI). */
export function taskListViewOf(response: TaskListResponse): TaskListView {
  return {
    groups: response.groups.map((group) => ({
      id: group.id,
      name: group.name,
      collapsed: group.collapsed,
      rows: group.tasks.map(taskRowViewOf),
    })),
    progress: response.progress,
    ...(response.filter ? { filter: response.filter } : {}),
  };
}
