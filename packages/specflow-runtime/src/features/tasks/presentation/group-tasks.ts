import type { TaskOverview } from '@nevo/specflow-contracts/tasks';

import type { DashboardGrouping, GroupDefinition, GroupPredicate } from './default-grouping';
import type { GroupingFacts } from './grouping-facts';

type Presented = Pick<GroupDefinition, 'id' | 'name' | 'summary' | 'collapsed'>;

function holds(predicate: GroupPredicate, facts: GroupingFacts): boolean {
  const { broken, preparation, position, outcome, startable, startBlocked, waiting } = predicate;

  return (
    (broken === undefined || broken === facts.broken) &&
    (!preparation ||
      (facts.preparation !== undefined && preparation.includes(facts.preparation))) &&
    (!position || (facts.position !== undefined && position.includes(facts.position))) &&
    (!outcome || (facts.outcome !== undefined && outcome.includes(facts.outcome))) &&
    (startable === undefined || startable === facts.startable) &&
    (startBlocked === undefined || startBlocked === facts.startBlocked) &&
    (waiting === undefined || waiting === facts.waiting)
  );
}

function matches(group: GroupDefinition, facts: GroupingFacts): boolean {
  const predicates = Array.isArray(group.when) ? group.when : [group.when];

  return predicates.some((predicate) => holds(predicate, facts));
}

/** The group a Task falls into: the first matching one, else the grouping's `other`. */
export function groupOf(grouping: DashboardGrouping, facts: GroupingFacts): Presented {
  const group = grouping.groups.find((candidate) => matches(candidate, facts)) ?? grouping.other;

  return { id: group.id, name: group.name, summary: group.summary, collapsed: group.collapsed };
}

/** The non-empty groups in configured order, each with its members in input order. Pure. */
export function groupTasks<T>(
  grouping: DashboardGrouping,
  items: readonly T[],
  factsOf: (item: T) => GroupingFacts,
): (Presented & { readonly tasks: T[] })[] {
  const placed = new Map<string, T[]>();
  for (const item of items) {
    const { id } = groupOf(grouping, factsOf(item));
    placed.set(id, [...(placed.get(id) ?? []), item]);
  }

  return [...grouping.groups, grouping.other].flatMap((group) => {
    const tasks = placed.get(group.id);

    return tasks
      ? [
          {
            id: group.id,
            name: group.name,
            summary: group.summary,
            collapsed: group.collapsed,
            tasks,
          },
        ]
      : [];
  });
}

/** How many Tasks a summary row names before "N more". */
const SUMMARY_TASKS = 2;

/**
 * The Overview's compact summary of grouped Tasks (owner decisions 4A, 7A): a `row` group names its
 * count and its first two Tasks, a `compact` group only its count. A Task the Overview already names
 * elsewhere (`named`: attention items, Now) appears by id only.
 */
export function overviewSummary(
  groups: readonly (Presented & {
    readonly tasks: readonly { readonly id: string; readonly title: string }[];
  })[],
  named: ReadonlySet<string>,
): Pick<TaskOverview, 'rows' | 'compact'> {
  return {
    rows: groups
      .filter((group) => group.summary === 'row')
      .map((group) => ({
        groupId: group.id,
        name: group.name,
        count: group.tasks.length,
        tasks: group.tasks
          .slice(0, SUMMARY_TASKS)
          .map((task) =>
            named.has(task.id) ? { id: task.id } : { id: task.id, title: task.title },
          ),
        more: Math.max(0, group.tasks.length - SUMMARY_TASKS),
      })),
    compact: groups
      .filter((group) => group.summary === 'compact')
      .map((group) => ({ groupId: group.id, name: group.name, count: group.tasks.length })),
  };
}
