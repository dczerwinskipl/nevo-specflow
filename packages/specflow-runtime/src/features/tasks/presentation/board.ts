import type { AttentionItem, BlockingTask, ExecutionReading } from '@nevo/specflow-engine';
import type { TaskListRow, TaskListResponse } from '@nevo/specflow-contracts/tasks';

import { toWire } from '../../workflow';
import type { InspectionBasis } from '../engine/projection';
import { DEFAULT_DASHBOARD_GROUPING, type DashboardGrouping } from './default-grouping';
import { groupTasks } from './group-tasks';
import { groupingFactsOf } from './grouping-facts';
import { taskStatusOf } from './status-line';

/**
 * One presentation of a Specification's Tasks from ONE Engine reading (`tasks: 'all'`): a row per
 * readable Task with its neutral facts and status line, the configured grouping, the attention
 * projection and, when the Specification is stuck, the Tasks that block it. The Overview section
 * and the Tasks page are both made from it, so they never disagree. Pure.
 */
export interface TaskBoard {
  readonly rows: readonly TaskListRow[];
  readonly groups: TaskListResponse['groups'];
  readonly attention: readonly AttentionItem[];
  /** The Specification's `tasks-stuck` Tasks with their causes; absent when it is not stuck. */
  readonly stuck?: readonly BlockingTask[];
  readonly progress: ExecutionReading['progress'];
}

export function taskBoardOf(
  basis: Pick<InspectionBasis, 'reading' | 'catalogue'>,
  grouping: DashboardGrouping = DEFAULT_DASHBOARD_GROUPING,
): TaskBoard {
  const { reading, catalogue } = basis;
  const stuck = reading.attention.find(
    (item) => item.subject.kind === 'specification' && item.reason === 'tasks-stuck',
  )?.blocking;
  const causes = new Map((stuck ?? []).map((task) => [task.taskId, task.cause] as const));
  const rows = reading.inspection.tasks.flatMap((entry): TaskListRow[] => {
    const { record } = entry;
    const facts = reading.facts.get(record.taskId);
    if (!facts) {
      return [];
    }

    const cause = causes.get(record.taskId);

    return [
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
        ...(cause ? { blocksSpecification: { cause } } : {}),
      },
    ];
  });

  return {
    rows,
    groups: groupTasks(grouping, rows, (row) => groupingFactsOf(row.facts)),
    attention: reading.attention,
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
