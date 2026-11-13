import type { MockTask, PreparationStatus } from './fixtures.stories-support';

/*
 * PRESENTATION MOCK ONLY (ux-contract.md, "Three concerns, kept apart"). The Engine exposes neutral
 * facts about a Task; the dashboard configuration (data, not Engine code) maps facts to named,
 * ordered groups. Attention is not a fact used here: a Task is grouped the same whether or not it
 * requires attention.
 */

/** Neutral facts of a Task as the Engine's read model would expose them. */
export interface TaskFacts {
  readonly preparation: PreparationStatus;
  readonly position: MockTask['workflow']['position']['kind'];
  /** A run exists (the workflow has started at least once). */
  readonly started: boolean;
}

export function factsOf(item: MockTask): TaskFacts {
  return {
    preparation: item.status,
    position: item.workflow.position.kind,
    started: item.started,
  };
}

/** One group of the dashboard configuration; every listed fact must match. */
export interface GroupDefinition {
  readonly id: string;
  readonly name: string;
  readonly tone: 'info' | 'neutral' | 'success';
  readonly when: {
    readonly preparation?: readonly PreparationStatus[];
    readonly position?: readonly TaskFacts['position'][];
    readonly started?: boolean;
  };
  /** Overview summary: its own row, or one compact line with the other compact groups. */
  readonly summary: 'row' | 'compact';
  /** Tasks page: collapsed by default. */
  readonly collapsed?: boolean;
}

/**
 * The default dashboard grouping (internal data for now; per project or per user later). Display
 * order is the array order. On hold is its own row: it is not terminal and keeps the
 * Specification from finishing.
 */
export const defaultGrouping: readonly GroupDefinition[] = [
  {
    id: 'needs-approval',
    name: 'Needs approval',
    tone: 'neutral',
    when: { preparation: ['draft'] },
    summary: 'row',
  },
  {
    id: 'in-progress',
    name: 'In progress',
    tone: 'info',
    when: { preparation: ['ready'], position: ['active', 'ready'], started: true },
    summary: 'row',
  },
  {
    id: 'ready',
    name: 'Ready to start',
    tone: 'neutral',
    when: { preparation: ['ready'], position: ['not-started'] },
    summary: 'row',
  },
  {
    id: 'waiting',
    name: 'Waiting',
    tone: 'neutral',
    when: { preparation: ['ready'], position: ['waiting'] },
    summary: 'row',
  },
  {
    id: 'on-hold',
    name: 'On hold',
    tone: 'neutral',
    when: { preparation: ['on-hold'] },
    summary: 'row',
  },
  {
    id: 'done',
    name: 'Done',
    tone: 'success',
    when: { preparation: ['ready'], position: ['terminal'] },
    summary: 'compact',
  },
  {
    id: 'cancelled',
    name: 'Cancelled',
    tone: 'neutral',
    when: { preparation: ['cancelled'] },
    summary: 'compact',
    collapsed: true,
  },
];

function matches(group: GroupDefinition, facts: TaskFacts): boolean {
  const { preparation, position, started } = group.when;

  return (
    (!preparation || preparation.includes(facts.preparation)) &&
    (!position || position.includes(facts.position)) &&
    (started === undefined || started === facts.started)
  );
}

/** The non-empty groups in configured order; a Task matching no group goes to "Other". */
export function groupTasks(
  list: readonly MockTask[],
  grouping: readonly GroupDefinition[] = defaultGrouping,
): readonly { group: GroupDefinition; members: readonly MockTask[] }[] {
  const other: GroupDefinition = {
    id: 'other',
    name: 'Other',
    tone: 'neutral',
    when: {},
    summary: 'row',
  };
  const placed = new Map<string, MockTask[]>();
  for (const item of list) {
    const group = grouping.find((candidate) => matches(candidate, factsOf(item))) ?? other;
    placed.set(group.id, [...(placed.get(group.id) ?? []), item]);
  }

  return [...grouping, other]
    .map((group) => ({ group, members: placed.get(group.id) ?? [] }))
    .filter((row) => row.members.length > 0);
}
