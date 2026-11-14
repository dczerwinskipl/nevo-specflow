import type { TaskListResponse } from '@nevo/specflow-contracts/specs/workspace';
import type { SpecificationWorkspaceData, TaskProgressData } from '../../specs/read-model';
import type { TaskLifecycle } from '../read-model';

/** One Task row of the Tasks page, as the Runtime presents it. */
export interface TaskListRowView {
  readonly id: string;
  /** Absent for a broken Task whose manifest cannot be read. */
  readonly title?: string;
  readonly typeTitle?: string;
  readonly dependsOn?: readonly string[];
  /** The status line's id (`draft`, `waiting`, …) and lifecycle. */
  readonly statusId?: string;
  readonly lifecycle?: TaskLifecycle;
  /** It waits for these dependencies (that can all still complete). */
  readonly waitingFor?: readonly string[];
  /** A person has to act on it: the attention item's reason, when the read carries one. */
  readonly attention?: { readonly reason?: string };
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
  const reasons = new Map(
    response.attention.flatMap((item) =>
      item.subject.kind === 'task' ? [[item.subject.taskId, item.message] as const] : [],
    ),
  );

  return {
    groups: response.groups.map((group) => ({
      id: group.id,
      name: group.name,
      collapsed: group.collapsed,
      rows: group.tasks.map((task): TaskListRowView => {
        const reason = reasons.get(task.id);
        const common = {
          id: task.id,
          ...(task.title !== undefined ? { title: task.title } : {}),
          statusId: task.status.id,
          lifecycle: task.status.lifecycle,
          ...(reason !== undefined ? { attention: { reason } } : {}),
          ...(task.blocksSpecification ? { blocksSpecification: true } : {}),
        };
        if ('broken' in task) {
          return { ...common, broken: true };
        }

        return {
          ...common,
          typeTitle: task.type.title,
          dependsOn: task.dependsOn,
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

/**
 * The demo Runtime has no Tasks page read; its workspace read carries the same grouping data
 * (groups with their `collapsed` flag and per-row attention mark), rendered as delivered.
 */
export function taskListViewOfWorkspace(
  data: SpecificationWorkspaceData,
  blocking: boolean,
): TaskListView {
  const total = data.taskGroups.reduce((count, group) => count + group.tasks.length, 0);

  return {
    // The demo has no `tasks-stuck`: nothing blocks the Specification.
    groups: blocking
      ? []
      : data.taskGroups.map((group) => ({
          id: group.id,
          name: group.name,
          collapsed: group.collapsed ?? false,
          rows: group.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            ...(task.typeTitle ? { typeTitle: task.typeTitle } : {}),
            ...(task.dependsOn ? { dependsOn: task.dependsOn } : {}),
            ...(task.statusId ? { statusId: task.statusId } : {}),
            ...(task.lifecycle ? { lifecycle: task.lifecycle } : {}),
            ...(task.attention ? { attention: {} } : {}),
          })),
        })),
    ...(data.taskProgress ? { progress: data.taskProgress } : {}),
    ...(blocking ? { filter: { matched: 0, total } } : {}),
  };
}
