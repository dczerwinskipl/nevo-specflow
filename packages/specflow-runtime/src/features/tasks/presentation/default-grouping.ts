import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';

/**
 * The dashboard grouping: declarative presentation data, not Engine code. Each group names a
 * predicate over the grouping facts (`grouping-facts.ts`; every listed fact must match, and a list
 * of predicates matches when one of them does), how the
 * Overview summary shows it and whether the Tasks page collapses it. Display order is the array
 * order, the first matching group wins and a Task matching none falls into `other`. The default
 * below is internal data for now; a per-project or per-user grouping can replace it later as a
 * value of the same schema, with no code change.
 */

const literals = <const T extends readonly string[]>(values: T) =>
  Type.Unsafe<T[number]>(Type.Union(values.map((value) => Type.Literal(value))));
const GroupId = Type.String({ minLength: 1, maxLength: 64, pattern: '^[a-z0-9][a-z0-9-]*$' });

const PredicateSchema = Type.Object(
  {
    broken: Type.Optional(Type.Boolean()),
    preparation: Type.Optional(
      Type.Array(literals(['draft', 'ready', 'on-hold', 'cancelled'] as const), {
        minItems: 1,
      }),
    ),
    position: Type.Optional(
      Type.Array(literals(['not-started', 'active', 'ready', 'terminal'] as const), {
        minItems: 1,
      }),
    ),
    outcome: Type.Optional(
      Type.Array(literals(['completed', 'abandoned'] as const), { minItems: 1 }),
    ),
    startable: Type.Optional(Type.Boolean()),
    startBlocked: Type.Optional(Type.Boolean()),
    waiting: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type GroupPredicate = Static<typeof PredicateSchema>;

const GroupSchema = Type.Object(
  {
    id: GroupId,
    name: Type.String({ minLength: 1, maxLength: 80 }),
    summary: literals(['row', 'compact'] as const),
    collapsed: Type.Boolean(),
    when: Type.Union([PredicateSchema, Type.Array(PredicateSchema, { minItems: 1, maxItems: 8 })]),
  },
  { additionalProperties: false },
);

export const DashboardGroupingSchema = Type.Object(
  {
    groups: Type.Array(GroupSchema, { minItems: 1, maxItems: 32 }),
    /** Where a Task matching no group goes. */
    other: Type.Object(
      {
        id: GroupId,
        name: Type.String({ minLength: 1, maxLength: 80 }),
        summary: literals(['row', 'compact'] as const),
        collapsed: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type DashboardGrouping = Static<typeof DashboardGroupingSchema>;
export type GroupDefinition = DashboardGrouping['groups'][number];

/** Validates a grouping (shape and unique group ids); a grouping that does not hold is refused. */
export function parseDashboardGrouping(value: unknown): DashboardGrouping {
  if (!Value.Check(DashboardGroupingSchema, value)) {
    throw new Error('The dashboard grouping does not match its schema.');
  }

  const ids = [...value.groups.map((group) => group.id), value.other.id];
  if (new Set(ids).size !== ids.length) {
    throw new Error('The dashboard grouping repeats a group id.');
  }

  return value;
}

/**
 * The default grouping (owner decisions 4A, 5A, 7A): what the owner must do first. "Ready to start"
 * holds only Tasks that can start; an approved Task that cannot start for another reason than an
 * expected wait is "Cannot start". On hold is a summary row: it is not terminal and keeps the
 * Specification from finishing.
 */
export const DEFAULT_DASHBOARD_GROUPING: DashboardGrouping = parseDashboardGrouping({
  groups: [
    {
      id: 'needs-approval',
      name: 'Needs approval',
      summary: 'row',
      collapsed: false,
      when: { preparation: ['draft'] },
    },
    {
      id: 'in-progress',
      name: 'In progress',
      summary: 'row',
      collapsed: false,
      when: { preparation: ['ready'], position: ['active', 'ready'] },
    },
    {
      id: 'ready',
      name: 'Ready to start',
      summary: 'row',
      collapsed: false,
      when: { preparation: ['ready'], position: ['not-started'], startable: true },
    },
    {
      id: 'cannot-start',
      name: 'Cannot start',
      summary: 'row',
      collapsed: false,
      // A broken Task cannot start either: it is listed here until its files are restored.
      when: [
        { preparation: ['ready'], position: ['not-started'], startBlocked: true },
        { broken: true },
      ],
    },
    {
      id: 'waiting',
      name: 'Waiting',
      summary: 'row',
      collapsed: false,
      when: { preparation: ['ready'], position: ['not-started'], waiting: true },
    },
    {
      id: 'on-hold',
      name: 'On hold',
      summary: 'row',
      collapsed: false,
      when: { preparation: ['on-hold'] },
    },
    {
      id: 'done',
      name: 'Done',
      summary: 'compact',
      collapsed: false,
      when: { position: ['terminal'], outcome: ['completed'] },
    },
    {
      id: 'cancelled',
      name: 'Cancelled',
      summary: 'compact',
      collapsed: true,
      when: { preparation: ['cancelled'] },
    },
    {
      // Its own workflow ended it without completing (not cancelled by a decision).
      id: 'ended',
      name: 'Ended',
      summary: 'compact',
      collapsed: true,
      when: { position: ['terminal'], outcome: ['abandoned'] },
    },
  ],
  other: { id: 'other', name: 'Other', summary: 'row', collapsed: false },
});
