import { Type, type Static } from 'typebox';

import { SpecIdSchema, TaskIdSchema } from '../identifiers';
import { BlockingTaskSchema, WorkflowAttentionItemSchema } from '../workflow/projection';
import { TaskFactsSchema } from './task-resource';

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

/** Progress, one definition: done of the Tasks meant to be done, with cancelled and on hold apart. */
export const TaskProgressSchema = Type.Object({
  completed: Type.Integer({ minimum: 0 }),
  /** Every Task except cancelled ones (and those ended by an abandon); on hold counts. */
  total: Type.Integer({ minimum: 0 }),
  cancelled: Type.Integer({ minimum: 0 }),
  onHold: Type.Integer({ minimum: 0 }),
});

/** `?blocking=specification`: only the Tasks the Specification's current `tasks-stuck` covers. */
export const TaskListQuerySchema = Type.Object(
  { blocking: Type.Optional(Type.Literal('specification')) },
  { additionalProperties: false },
);
export type TaskListQuery = Static<typeof TaskListQuerySchema>;

export const TaskListRowSchema = Type.Object({
  id: TaskIdSchema,
  title: Type.String(),
  type: Type.Object({ id: Type.String(), title: Type.String() }),
  dependsOn: Type.Array(TaskIdSchema),
  status: TaskStatusLineSchema,
  facts: TaskFactsSchema,
  /** The Specification's `tasks-stuck` names this Task: why it keeps the Specification waiting. */
  blocksSpecification: Type.Optional(Type.Object({ cause: BlockingTaskSchema.properties.cause })),
});
export type TaskListRow = Static<typeof TaskListRowSchema>;

export const TaskListGroupSchema = Type.Object({
  id: GroupIdSchema,
  name: Type.String(),
  summary: TaskGroupSummarySchema,
  /** The Tasks page collapses it by default. */
  collapsed: Type.Boolean(),
  tasks: Type.Array(TaskListRowSchema),
});

export const TaskListResponseSchema = Type.Object({
  specId: SpecIdSchema,
  /** Non-empty groups in configured order; with a filter, only the matching Tasks. */
  groups: Type.Array(TaskListGroupSchema),
  progress: TaskProgressSchema,
  /** The attention projection (broken Tasks, the Specification, then Tasks in id order). */
  attention: Type.Array(WorkflowAttentionItemSchema),
  /** Present with `?blocking=specification`: how many Tasks match out of all readable ones. */
  filter: Type.Optional(
    Type.Object({
      blocking: Type.Literal('specification'),
      matched: Type.Integer({ minimum: 0 }),
      total: Type.Integer({ minimum: 0 }),
    }),
  ),
});
export type TaskListResponse = Static<typeof TaskListResponseSchema>;

/**
 * The Overview's compact Tasks summary. A `row` group names its count and up to two Tasks (a Task
 * already named by an attention item or by Now carries no title, so it is not shown twice in full);
 * `compact` groups share one line of counts.
 */
export const TaskOverviewSchema = Type.Object({
  rows: Type.Array(
    Type.Object({
      groupId: GroupIdSchema,
      name: Type.String(),
      count: Type.Integer({ minimum: 1 }),
      tasks: Type.Array(
        Type.Object({
          id: TaskIdSchema,
          /** Absent: the Task is already named elsewhere on the Overview (id only). */
          title: Type.Optional(Type.String()),
        }),
        { maxItems: 2 },
      ),
      /** Tasks of the group beyond `tasks`. */
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
