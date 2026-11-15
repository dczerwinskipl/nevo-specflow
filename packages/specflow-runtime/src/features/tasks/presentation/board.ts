import type { AttentionItem, BlockingTask, ExecutionReading } from '@nevo/specflow-engine';
import type { TaskListEntry, TaskListResponse, TaskListRow } from '@nevo/specflow-contracts/tasks';

import { toWire } from '../../workflow';
import type { InspectionBasis } from '../engine/projection';
import { DEFAULT_DASHBOARD_GROUPING, type DashboardGrouping } from './default-grouping';
import { groupTasks } from './group-tasks';
import { BROKEN_GROUPING_FACTS, groupingFactsOf, type GroupingFacts } from './grouping-facts';
import { BROKEN_STATUS, taskStatusOf } from './status-line';

/**
 * One presentation of a Specification's Tasks from ONE Engine reading (`tasks: 'all'`): a row per
 * Task (a readable one with its neutral facts and status line, a broken one with what is readable
 * of it), the configured grouping, the attention projection and, when the Specification is stuck,
 * the Tasks that block it. The Overview section and the Tasks page are both made from it, so they
 * never disagree. Pure.
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
  const blocks = (taskId: string) => {
    const cause = causes.get(taskId);

    return cause ? { blocksSpecification: { cause } } : {};
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
  const rows = [...readable, ...broken];

  return {
    rows,
    groups: groupTasks(grouping, rows, factsOf),
    attention,
    ...(stuck ? { stuck } : {}),
    progress: reading.progress,
  };
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
