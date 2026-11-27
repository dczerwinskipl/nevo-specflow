import type { AttentionItem, BlockingTask, ExecutionReading } from '@nevo/specflow-engine';
import type { TaskListEntry, TaskListResponse, TaskListRow } from '@nevo/specflow-contracts/tasks';

import { toWire } from '../../workflow';
import type { InspectionBasis } from '../engine/projection';
import { DEFAULT_DASHBOARD_GROUPING, type DashboardGrouping } from './default-grouping';
import { groupTasks } from './group-tasks';
import { BROKEN_GROUPING_FACTS, groupingFactsOf, type GroupingFacts } from './grouping-facts';
import { awaitedTaskIds, byImportance } from './importance';
import { BROKEN_STATUS, taskStatusOf } from './status-line';

/**
 * One presentation of a Specification's Tasks from ONE Engine reading (`tasks: 'all'`): a row per
 * Task (a readable one with its neutral facts and status line, a broken one with what is readable
 * of it, each with the attention item that names it), the configured grouping with each group in
 * importance order (`importance.ts`), the attention projection and, when the Specification is
 * stuck, the Tasks that block it. The Overview section and the Tasks page are both made from it,
 * so they never disagree. Pure.
 */
export interface TaskBoard {
  readonly rows: readonly TaskListEntry[];
  readonly groups: TaskListResponse['groups'];
  readonly attention: readonly AttentionItem[];
  /** The Specification's `tasks-stuck` Tasks with their causes; absent when it is not stuck. */
  readonly stuck?: readonly BlockingTask[];
  readonly progress: ExecutionReading['progress'];
}

export const isReadable = (row: TaskListEntry): row is TaskListRow => !('broken' in row);

export function taskBoardOf(
  basis: Pick<InspectionBasis, 'reading' | 'catalogue'>,
  grouping: DashboardGrouping = DEFAULT_DASHBOARD_GROUPING,
): TaskBoard {
  const { reading, catalogue } = basis;
  const attention = reading.inspection.attention;
  const stuck = attention.find(
    (item) => item.subject.kind === 'specification' && item.reason === 'tasks-stuck',
  )?.blocking;
  const causes = new Map((stuck ?? []).map((task) => [task.taskId, task.cause] as const));
  const naming = attentionByTask(attention);
  const blocks = (taskId: string) => {
    const cause = causes.get(taskId);
    const item = naming.get(taskId);

    return {
      ...(cause ? { blocksSpecification: { cause } } : {}),
      ...(item ? { attention: structuredClone(toWire(item)) } : {}),
    };
  };

  const readable = reading.inspection.tasks.flatMap((entry): TaskListEntry[] => {
    const { record } = entry;
    const facts = reading.facts.get(record.taskId);

    return facts
      ? [
          {
            id: record.taskId,
            title: record.title,
            type: {
              id: record.type,
              title: catalogue.taskType(record.type)?.title ?? record.type,
            },
            dependsOn: [...record.dependsOn],
            status: taskStatusOf(facts),
            facts: toWire(facts),
            ...blocks(record.taskId),
            ...(record.status === 'on-hold' && record.statusChange?.reason
              ? { holdReason: record.statusChange.reason }
              : {}),
          },
        ]
      : [];
  });
  const broken = reading.broken.map((task): TaskListEntry => ({
    id: task.taskId,
    ...(task.title !== undefined ? { title: task.title } : {}),
    status: BROKEN_STATUS,
    broken: { reason: task.reason },
    ...blocks(task.taskId),
  }));
  const factsOf = (row: TaskListEntry): GroupingFacts =>
    isReadable(row) ? groupingFactsOf(row.facts) : BROKEN_GROUPING_FACTS;
  // The Engine's Task order (by id, as it orders its execution), broken Tasks in their place: the
  // order importance ties keep.
  const rows = [...readable, ...broken].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  const awaited = awaitedTaskIds(rows);

  return {
    rows,
    groups: groupTasks(grouping, rows, factsOf).map((group) => ({
      ...group,
      tasks: byImportance(group.tasks, awaited),
    })),
    attention,
    ...(stuck ? { stuck } : {}),
    progress: reading.progress,
  };
}

/**
 * The attention item each Task's row carries (its Requires attention overlay): the Task's own item,
 * else the Specification's `task-escalated` that names it. The Engine reports at most one item per
 * Task; the Specification's `tasks-stuck` is the row's `blocksSpecification` instead.
 */
function attentionByTask(attention: readonly AttentionItem[]): Map<string, AttentionItem> {
  const items = new Map<string, AttentionItem>();
  for (const item of attention) {
    if (item.subject.kind === 'specification' && item.reason === 'task-escalated') {
      for (const taskId of item.taskIds ?? []) {
        if (!items.has(taskId)) {
          items.set(taskId, item);
        }
      }
    }
  }

  for (const item of attention) {
    if (item.subject.kind === 'task') {
      items.set(item.subject.taskId, item);
    }
  }

  return items;
}

/** The Tasks an attention item names: its own Task, and the Tasks a Specification item covers. */
export function namedTaskIds(attention: readonly AttentionItem[]): Set<string> {
  const ids = new Set<string>();
  for (const item of attention) {
    if (item.subject.kind === 'task') {
      ids.add(item.subject.taskId);
    } else {
      for (const taskId of item.taskIds ?? []) {
        ids.add(taskId);
      }
    }
  }

  return ids;
}

/** The Task ids the structured facts of an attention item name. */
export function itemTaskIds(
  item: Pick<AttentionItem, 'taskIds' | 'blocking' | 'blocks'>,
): string[] {
  return [
    ...(item.taskIds ?? []),
    ...(item.blocking ?? []).map((task) => task.taskId),
    ...(item.blocks && 'taskIds' in item.blocks ? item.blocks.taskIds : []),
  ];
}

/**
 * The titles of the Tasks that `entries` and `attention` name in their structured facts (a row's
 * dependencies and dependency wait, an item's `taskIds`, `blocking` and `blocks`), from `rows`, the
 * whole board: a client words its blocker and dependency lines from the facts with these titles,
 * also for a Task it does not list. Broken Tasks without a readable title are left out; nothing
 * when no titled Task is named.
 */
export function namedTaskTitles(
  rows: readonly TaskListEntry[],
  entries: readonly TaskListEntry[],
  attention: readonly AttentionItem[] = [],
): { taskTitles?: Record<string, string> } {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (isReadable(entry)) {
      entry.dependsOn.forEach((id) => ids.add(id));
      entry.facts.dependencyWait?.waitingFor.forEach((id) => ids.add(id));
      entry.facts.dependencyWait?.unsatisfiable.forEach((id) => ids.add(id));
    }

    if (entry.attention) {
      itemTaskIds(entry.attention).forEach((id) => ids.add(id));
    }
  }

  attention.forEach((item) => itemTaskIds(item).forEach((id) => ids.add(id)));
  const titles: Record<string, string> = {};
  for (const row of rows) {
    if (ids.has(row.id) && row.title !== undefined) {
      titles[row.id] = row.title;
    }
  }

  return Object.keys(titles).length > 0 ? { taskTitles: titles } : {};
}
