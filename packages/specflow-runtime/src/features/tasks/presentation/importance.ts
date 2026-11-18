import type { TaskListEntry } from '@nevo/specflow-contracts/tasks';

/**
 * The importance order of the Tasks inside a group (owner decision A-Q2), one comparator for the
 * Tasks page groups and the Overview preview: a Task that requires attention (the Engine's item
 * that names it, the Specification's `tasks-stuck`, or broken files), then one on hold or Cannot
 * start that an open Task waits on directly, then one in progress, then the rest. Ties keep the
 * input order, the Engine's Task order (by id, broken Tasks in their place; `board.ts`), so the
 * order is deterministic.
 */
const Rank = { Attention: 0, HoldsUpDependents: 1, InProgress: 2, Other: 3 } as const;
type Rank = (typeof Rank)[keyof typeof Rank];

const isBroken = (row: TaskListEntry) => 'broken' in row;

function rankOf(row: TaskListEntry, awaited: ReadonlySet<string>): Rank {
  if (row.attention !== undefined || row.blocksSpecification !== undefined || isBroken(row)) {
    return Rank.Attention;
  }

  // Only a Task that can still move holds others up: on hold or Cannot start, never a cancelled,
  // ended or broken one (broken is attention above).
  const held = row.status.id === 'on-hold' || row.status.id === 'blocked';
  if (held && awaited.has(row.id)) {
    return Rank.HoldsUpDependents;
  }

  return row.status.lifecycle === 'in_progress' ? Rank.InProgress : Rank.Other;
}

/** The Tasks some open Task waits on directly (its `dependencyWait.waitingFor` names them). */
export function awaitedTaskIds(rows: readonly TaskListEntry[]): Set<string> {
  const awaited = new Set<string>();
  for (const row of rows) {
    for (const taskId of 'facts' in row ? (row.facts.dependencyWait?.waitingFor ?? []) : []) {
      awaited.add(taskId);
    }
  }

  return awaited;
}

/** `tasks` in importance order (a new array; the sort is stable). Pure. */
export function byImportance<T extends TaskListEntry>(
  tasks: readonly T[],
  awaited: ReadonlySet<string>,
): T[] {
  return tasks
    .map((task, index) => ({ task, index, rank: rankOf(task, awaited) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ task }) => task);
}
