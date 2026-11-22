import { Type, type Static } from 'typebox';

import { SpecIdSchema, TaskIdSchema } from '../identifiers';
import {
  BlockingTaskSchema,
  BROKEN_REASONS,
  WorkflowAttentionItemSchema,
} from '../workflow/projection';
import { TASK_STATUS_REASON_MAX_LENGTH } from '../documents/task-resource-files';
import { TaskFactsSchema } from './task-resource';

const literals = <const T extends readonly string[]>(values: T) =>
  Type.Unsafe<T[number]>(Type.Union(values.map((value) => Type.Literal(value))));

/**
 * The Tasks page (`GET /api/specs/:specId/tasks`) and the Tasks part of the Specification
 * Overview: the Engine's neutral Task facts and attention, presented in the Runtime's dashboard
 * grouping (declarative configuration; the default lives in the Runtime). A group is presentation
 * only: a Task is in exactly one group and may independently require attention.
 */

/** The status line of a Task, derived from its facts (display text plus a stable lifecycle). */
export const TaskStatusLineSchema = Type.Object({
  id: Type.String(),
  label: Type.String(),
  lifecycle: Type.Union([
    Type.Literal('pending'),
    Type.Literal('in_progress'),
    Type.Literal('completed'),
    Type.Literal('blocked'),
  ]),
});

const GroupIdSchema = Type.String({ minLength: 1, maxLength: 64, pattern: '^[a-z0-9][a-z0-9-]*$' });

/** How the Overview summary shows a group: its own row, or one compact line with the others. */
export const TaskGroupSummarySchema = Type.Union([Type.Literal('row'), Type.Literal('compact')]);

/**
 * Progress, one definition: done of the Tasks meant to be done, with cancelled, ended and on hold
 * named apart ("1 of 6 done · 1 cancelled · 1 ended · 1 on hold").
 */
export const TaskProgressSchema = Type.Object({
  completed: Type.Integer({ minimum: 0 }),
  /**
   * Every Task except cancelled ones and those ended without completing; a broken Task and one on
   * hold count (unfinished).
   */
  total: Type.Integer({ minimum: 0 }),
  /** Cancelled Tasks, also those an abandon of the Specification cancelled. */
  cancelled: Type.Integer({ minimum: 0 }),
  /** Tasks their own workflow ended without completing (abandoned, not cancelled). */
  ended: Type.Integer({ minimum: 0 }),
  onHold: Type.Integer({ minimum: 0 }),
});

/**
 * At most one filter: `?blocking=specification` keeps only the Tasks the Specification's current
 * `tasks-stuck` covers; `?group=<groupId>` only the Tasks of that dashboard group (the Overview's
 * "N more in <group>"). The two do not combine (refused at the boundary).
 */
export const TaskListQuerySchema = Type.Object(
  {
    blocking: Type.Optional(
      Type.Literal('specification', {
        description:
          "Only the Tasks the Specification's current tasks-stuck names. Cannot be combined with `group` (400).",
      }),
    ),
    group: Type.Optional(
      Type.String({
        ...GroupIdSchema,
        description:
          'Only the Tasks of this dashboard group (a group id). Cannot be combined with `blocking` (400).',
      }),
    ),
  },
  { additionalProperties: false, not: { required: ['blocking', 'group'] } },
);
export type TaskListQuery = Static<typeof TaskListQuerySchema>;

/** The Specification's `tasks-stuck` names this Task: why it keeps the Specification waiting. */
const BlocksSpecification = Type.Optional(
  Type.Object({ cause: BlockingTaskSchema.properties.cause }),
);

/**
 * THE attention item a client shows for the row (its Requires attention overlay): the Task's own
 * Engine item, else the Specification's `task-escalated` that names it. At most one; the
 * Specification's `tasks-stuck` is `blocksSpecification` instead. Absent when nothing names it.
 * Use this for display, not `facts.attention`: that is the Engine's own-item fact only (it never
 * holds a Specification item, and a broken row has no facts).
 */
const RowAttention = Type.Optional(WorkflowAttentionItemSchema);

/** A readable Task: its neutral facts and the status line derived from them. */
export const TaskListRowSchema = Type.Object({
  id: TaskIdSchema,
  title: Type.String(),
  type: Type.Object({ id: Type.String(), title: Type.String() }),
  dependsOn: Type.Array(TaskIdSchema),
  status: TaskStatusLineSchema,
  facts: TaskFactsSchema,
  blocksSpecification: BlocksSpecification,
  /**
   * The reason recorded when it was put on hold (a person's decision or its escalation's feedback),
   * verbatim. Present only while the Task is on hold and a reason was given.
   */
  holdReason: Type.Optional(
    Type.String({ minLength: 1, maxLength: TASK_STATUS_REASON_MAX_LENGTH }),
  ),
  attention: RowAttention,
});
export type TaskListRow = Static<typeof TaskListRowSchema>;

/**
 * A broken Task (its files are inconsistent): only what is readable of it, so it is listed and
 * reachable (for example by `?blocking=specification`) until its files are restored.
 */
export const BrokenTaskListRowSchema = Type.Object({
  id: TaskIdSchema,
  /** Absent when its manifest cannot be read. */
  title: Type.Optional(Type.String()),
  status: TaskStatusLineSchema,
  broken: Type.Object({ reason: literals(BROKEN_REASONS) }),
  blocksSpecification: BlocksSpecification,
  attention: RowAttention,
});
export type BrokenTaskListRow = Static<typeof BrokenTaskListRowSchema>;

/** A row of a group: a readable Task, or a broken one (`broken` present). */
export const TaskListEntrySchema = Type.Union([TaskListRowSchema, BrokenTaskListRowSchema]);
export type TaskListEntry = Static<typeof TaskListEntrySchema>;

export const TaskListGroupSchema = Type.Object({
  id: GroupIdSchema,
  name: Type.String(),
  summary: TaskGroupSummarySchema,
  /** The Tasks page collapses it by default. */
  collapsed: Type.Boolean(),
  tasks: Type.Array(TaskListEntrySchema),
});

export const TaskListResponseSchema = Type.Object({
  specId: SpecIdSchema,
  /**
   * Non-empty groups in configured order, the Tasks of each in importance order (Requires
   * attention, then held or unable to start with a Task waiting on it, then in progress, then the
   * Engine's Task order); with a filter, only the matching Tasks.
   */
  groups: Type.Array(TaskListGroupSchema, {
    description: 'Nonempty Runtime-defined presentation groups, in configured order. Rows ordered by attention, blocked dependents, in-progress then Engine identity. Group labels/order are not Engine-owned.',
  }),
  progress: TaskProgressSchema,
  /** The attention projection (broken Tasks, the Specification, then Tasks in id order). */
  attention: Type.Array(WorkflowAttentionItemSchema),
  /**
   * Present with a filter (`?blocking=specification` or `?group=<groupId>`, as requested): how
   * many Tasks match out of all listed (broken too).
   */
  filter: Type.Optional(
    Type.Union([
      Type.Object({
        blocking: Type.Literal('specification'),
        matched: Type.Integer({ minimum: 0 }),
        total: Type.Integer({ minimum: 0 }),
      }),
      Type.Object({
        group: GroupIdSchema,
        matched: Type.Integer({ minimum: 0 }),
        total: Type.Integer({ minimum: 0 }),
      }),
    ]),
  ),
});
export type TaskListResponse = Static<typeof TaskListResponseSchema>;

/**
 * The Overview's compact Tasks summary. A `row` group names its count and its first two Tasks in
 * the Tasks page's importance order, each the same row as on the Tasks page (`TaskListEntry`, the
 * same Runtime projection, so the two never disagree), then `more`; `compact` groups share one
 * line of counts.
 */
export const TaskOverviewSchema = Type.Object({
  rows: Type.Array(
    Type.Object({
      groupId: GroupIdSchema,
      name: Type.String(),
      count: Type.Integer({ minimum: 1 }),
      tasks: Type.Array(TaskListEntrySchema, { maxItems: 2 }),
      /** Tasks of the group beyond `tasks` (the Tasks page `?group=<groupId>` lists them all). */
      more: Type.Integer({ minimum: 0 }),
    }),
  ),
  compact: Type.Array(
    Type.Object({
      groupId: GroupIdSchema,
      name: Type.String(),
      count: Type.Integer({ minimum: 1 }),
    }),
  ),
  /**
   * Why the Specification cannot progress (its `tasks-stuck`), for Now: each blocking Task with
   * its title (when readable) and cause. Absent when nothing blocks it.
   */
  stuck: Type.Optional(
    Type.Array(
      Type.Object({
        taskId: TaskIdSchema,
        title: Type.Optional(Type.String()),
        cause: BlockingTaskSchema.properties.cause,
      }),
    ),
  ),
});
export type TaskOverview = Static<typeof TaskOverviewSchema>;
