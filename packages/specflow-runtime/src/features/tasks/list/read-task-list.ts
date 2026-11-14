import type { TaskListQuery, TaskListResponse } from '@nevo/specflow-contracts/tasks';

import { toWire } from '../../workflow';
import { inspectSpecification, type TaskEngine } from '../engine/sources';
import type { InspectionBasis } from '../engine/projection';
import { taskBoardOf } from '../presentation/board';
import {
  DEFAULT_DASHBOARD_GROUPING,
  type DashboardGrouping,
} from '../presentation/default-grouping';

/**
 * The Tasks page of a Specification, read by `GET /api/specs/:specId/tasks`. `null`: the
 * Specification does not exist. An execution the Engine cannot read throws
 * `TaskSourceUnavailableError` (503).
 */
export interface TaskListSource {
  read(specId: string, query: TaskListQuery): Promise<TaskListResponse | null>;
}

/**
 * The Tasks page of one Engine reading (`tasks: 'all'`), in the configured grouping. With
 * `blocking: 'specification'` only the Tasks the Specification's current `tasks-stuck` names stay,
 * in their normal groups; they are resolved from this reading, never from ids a client sends, so a
 * stale link never shows stale Tasks (none when nothing blocks any more). Pure.
 */
export function taskListOf(
  basis: Pick<InspectionBasis, 'reading' | 'catalogue'>,
  query: TaskListQuery,
  grouping: DashboardGrouping = DEFAULT_DASHBOARD_GROUPING,
): TaskListResponse {
  const board = taskBoardOf(basis, grouping);
  const common = {
    specId: basis.reading.inspection.specId,
    progress: { ...board.progress },
    attention: board.attention.map((item) => structuredClone(toWire(item))),
  };
  if (query.blocking !== 'specification') {
    return { ...common, groups: board.groups };
  }

  const groups = board.groups.flatMap((group) => {
    const tasks = group.tasks.filter((row) => row.blocksSpecification !== undefined);

    return tasks.length > 0 ? [{ ...group, tasks }] : [];
  });

  return {
    ...common,
    groups,
    filter: {
      blocking: 'specification',
      matched: groups.reduce((sum, group) => sum + group.tasks.length, 0),
      total: board.rows.length,
    },
  };
}

/** Project mode: one Engine reading per request. */
export function createEngineTaskList(source: TaskEngine): TaskListSource {
  return {
    async read(specId, query) {
      const basis = await inspectSpecification(source, specId, 'all');

      return basis ? taskListOf(basis, query) : null;
    },
  };
}
