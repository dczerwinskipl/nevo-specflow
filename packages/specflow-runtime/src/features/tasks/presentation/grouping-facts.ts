import type { TaskFacts } from '@nevo/specflow-engine';

/**
 * The facts a dashboard grouping predicate reads, derived from the Engine's neutral Task facts.
 * Attention is deliberately not one of them: a Task is grouped the same whether or not it requires
 * attention.
 */
export interface GroupingFacts {
  /** Its files are inconsistent: nothing else about it is known. */
  readonly broken: boolean;
  /** Absent for a broken Task. */
  readonly preparation?: TaskFacts['preparation'];
  /** Absent for a broken Task. */
  readonly position?: TaskFacts['position']['state'];
  /** For a terminal position. */
  readonly outcome?: 'completed' | 'abandoned';
  readonly startable: boolean;
  /**
   * A start blocker other than the preparation status and an expected wait (dependencies that can
   * all still complete, an awaited process artifact): the Task cannot start although approved. A
   * broken Task cannot start either.
   */
  readonly startBlocked: boolean;
  /** It cannot start only because it waits for dependencies or an awaited process artifact. */
  readonly waiting: boolean;
}

type Blocker = TaskFacts['startBlockers'][number];

/** Waiting that resolves by itself as the process goes on. */
function isExpectedWait(blocker: Blocker): boolean {
  return (
    (blocker.kind === 'dependencies' && blocker.unsatisfiable.length === 0) ||
    blocker.kind === 'context-awaited'
  );
}

export function groupingFactsOf(facts: TaskFacts): GroupingFacts {
  const blockers = facts.startBlockers.filter((blocker) => blocker.kind !== 'status');
  const startBlocked = blockers.some((blocker) => !isExpectedWait(blocker));
  const position = facts.position;

  return {
    broken: false,
    preparation: facts.preparation,
    position: position.state,
    ...(position.state === 'terminal' ? { outcome: position.outcome } : {}),
    startable: facts.startable,
    startBlocked,
    waiting: !startBlocked && blockers.some(isExpectedWait),
  };
}

/** A broken Task: its files are inconsistent, so only that is known (`BrokenTaskFacts`). */
export const BROKEN_GROUPING_FACTS: GroupingFacts = {
  broken: true,
  startable: false,
  startBlocked: true,
  waiting: false,
};
