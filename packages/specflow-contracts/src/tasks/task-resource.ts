import { Type, type Static } from 'typebox';

import {
  TASK_CONTEXT_ENTRIES_MAX,
  TASK_DEPENDENCIES_MAX,
  TASK_ID_PATTERN,
  TASK_STATUS_REASON_MAX_LENGTH,
  TASK_SUMMARY_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
  TaskContextEntrySchema,
  TaskDocumentEntrySchema,
  TaskOriginSchema,
  TaskStatusChangeSchema,
} from '../documents/task-resource-files';
import {
  CATALOGUE_ID_PATTERN,
  ClassificationSchema,
  ContentKindSchema,
} from '../documents/vocabulary';
import { TaskIdSchema } from '../identifiers';

/**
 * The Task as a resource of its Specification (`tasks/<id>/task.yaml`) on the wire: what the owner
 * creates, edits, decides and removes over HTTP (`reference.api.task-reads`, "Task commands"). The
 * file formats and their bounds are `../documents/task-resource-files.ts`; these schemas reuse them.
 */

const Revision = Type.String({ minLength: 1, maxLength: 200 });
const NewTaskId = Type.String({ pattern: TASK_ID_PATTERN });
const Title = Type.String({ minLength: 1, maxLength: TASK_TITLE_MAX_LENGTH });
const Summary = Type.String({ minLength: 1, maxLength: TASK_SUMMARY_MAX_LENGTH });
const Dependencies = Type.Array(NewTaskId, {
  maxItems: TASK_DEPENDENCIES_MAX,
  uniqueItems: true,
});
const Context = Type.Array(TaskContextEntrySchema, { maxItems: TASK_CONTEXT_ENTRIES_MAX });

export const TaskPreparationStatusSchema = Type.Union([
  Type.Literal('draft'),
  Type.Literal('ready'),
  Type.Literal('on-hold'),
  Type.Literal('cancelled'),
]);

/** Whether the Task may start now (`ready`), or what keeps it: its status or unfinished dependencies. */
export const TaskReadinessSchema = Type.Union([
  Type.Object({ kind: Type.Literal('ready') }),
  Type.Object({
    kind: Type.Literal('status'),
    status: Type.Union([Type.Literal('draft'), Type.Literal('on-hold'), Type.Literal('cancelled')]),
  }),
  Type.Object({ kind: Type.Literal('dependencies'), waitingFor: Type.Array(TaskIdSchema) }),
]);

/** The run position of the Task, as the workflow core stores it. */
export const TaskRunPositionSchema = Type.Union([
  Type.Object({ state: Type.Literal('not-started') }),
  Type.Object({
    state: Type.Literal('active'),
    step: Type.String(),
    attempt: Type.Integer({ minimum: 1 }),
  }),
  Type.Object({ state: Type.Literal('ready'), step: Type.String() }),
  Type.Object({
    state: Type.Literal('terminal'),
    outcome: Type.Union([Type.Literal('completed'), Type.Literal('abandoned')]),
  }),
]);

/** The resource facts of one Task, read from one Engine inspection of its Specification. */
export const TaskResourceFactsSchema = Type.Object({
  /** The manifest revision an edit or a removal names as `expectedRevision`. */
  revision: Revision,
  /** The task type id; immutable after creation. */
  type: Type.String({ pattern: CATALOGUE_ID_PATTERN }),
  status: TaskPreparationStatusSchema,
  statusChange: Type.Optional(TaskStatusChangeSchema),
  dependsOn: Type.Array(TaskIdSchema),
  origin: TaskOriginSchema,
  documents: Type.Array(TaskDocumentEntrySchema),
  /** The explicit context list; `null`: the default context. */
  context: Type.Union([Type.Array(TaskContextEntrySchema), Type.Null()]),
  readiness: TaskReadinessSchema,
  position: TaskRunPositionSchema,
  /** The workflow the run is pinned to changed: its next operation is refused. */
  definitionChanged: Type.Boolean(),
});
export type TaskResourceFacts = Static<typeof TaskResourceFactsSchema>;

/** `POST /api/specs/:specId/tasks`: a draft Task. The actor is the authenticated subject, never the body. */
export const CreateTaskInputSchema = Type.Object(
  {
    /** Lowercase letters, digits and dashes; it names the Task folder. */
    taskId: NewTaskId,
    title: Title,
    summary: Type.Optional(Summary),
    /** The task type id; immutable after creation. */
    type: Type.String({ pattern: CATALOGUE_ID_PATTERN }),
    dependsOn: Type.Optional(Dependencies),
    /** Absent: the default context. */
    context: Type.Optional(Context),
    /** The first text of `task.md`; absent: the title and summary. */
    document: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type CreateTaskInput = Static<typeof CreateTaskInputSchema>;

/** `PATCH /api/specs/:specId/tasks/:taskId`: only the fields given change. The type is immutable. */
export const EditTaskInputSchema = Type.Object(
  {
    expectedRevision: Revision,
    title: Type.Optional(Title),
    /** `null` removes the summary. */
    summary: Type.Optional(Type.Union([Summary, Type.Null()])),
    /** The whole list; only before the Task's first start. */
    dependsOn: Type.Optional(Dependencies),
    /** The whole list; `null` restores the default context. */
    context: Type.Optional(Type.Union([Context, Type.Null()])),
  },
  { additionalProperties: false },
);
export type EditTaskInput = Static<typeof EditTaskInputSchema>;

/** `DELETE /api/specs/:specId/tasks/:taskId?expectedRevision=...`. */
export const RemoveTaskQuerySchema = Type.Object(
  { expectedRevision: Revision },
  { additionalProperties: false },
);
export type RemoveTaskQuery = Static<typeof RemoveTaskQuerySchema>;

/** `PUT /api/specs/:specId/tasks/:taskId/status`: approve (`ready`), hold, resume (`ready`), cancel. */
export const SetTaskStatusInputSchema = Type.Object(
  {
    status: Type.Union([Type.Literal('ready'), Type.Literal('on-hold'), Type.Literal('cancelled')]),
    reason: Type.Optional(Type.String({ minLength: 1, maxLength: TASK_STATUS_REASON_MAX_LENGTH })),
  },
  { additionalProperties: false },
);
export type SetTaskStatusInput = Static<typeof SetTaskStatusInputSchema>;

/** The answer of a create or an edit: the manifest revision for the next edit or removal. */
export const TaskChangeResultSchema = Type.Object(
  { taskId: TaskIdSchema, revision: Revision },
  { $id: 'TaskChangeResult', additionalProperties: false },
);
export type TaskChangeResult = Static<typeof TaskChangeResultSchema>;

export const TaskRemoveResultSchema = Type.Object(
  { taskId: TaskIdSchema },
  { additionalProperties: false },
);
export type TaskRemoveResult = Static<typeof TaskRemoveResultSchema>;

export const TaskStatusResultSchema = Type.Object(
  { taskId: TaskIdSchema, status: TaskPreparationStatusSchema },
  { additionalProperties: false },
);
export type TaskStatusResult = Static<typeof TaskStatusResultSchema>;

/**
 * A refused Task command. `code` is the Engine's workflow error code (`WORKFLOW_*`), or
 * `WORKFLOW_SOURCE_UNAVAILABLE` when the Runtime has no workflow source; `message` is the Engine's
 * explanation of a refusal (404, 409, 422), never present for an outage (503).
 */
export const TaskCommandErrorSchema = Type.Object(
  {
    error: Type.String({ pattern: '^WORKFLOW_[A-Z_]+$' }),
    code: Type.String({ pattern: '^WORKFLOW_[A-Z_]+$' }),
    message: Type.Optional(Type.String()),
  },
  { $id: 'TaskCommandError' },
);
export type TaskCommandError = Static<typeof TaskCommandErrorSchema>;

/** One document of a Task as `GET /api/specs/:specId/tasks/:taskId/document-tree` lists it. */
export const TaskDocumentListingSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 200 }),
  /** Relative to the Task folder. */
  path: Type.String({ minLength: 1 }),
  type: Type.Optional(Type.String({ pattern: CATALOGUE_ID_PATTERN })),
  classification: ClassificationSchema,
  /** The required `task` document (`task.md`): it cannot be deleted or renamed. */
  required: Type.Boolean(),
  /** Absent for a registered document without a readable file. */
  file: Type.Optional(
    Type.Object({
      kind: ContentKindSchema,
      mediaType: Type.String({ minLength: 1 }),
      size: Type.Integer({ minimum: 0 }),
      /** The revision a save names as `expectedRevision`. */
      revision: Type.String({ minLength: 1 }),
      editable: Type.Boolean(),
    }),
  ),
});

export const TaskDocumentTreeSchema = Type.Object({
  taskId: TaskIdSchema,
  /** sha256 of the `task.yaml` bytes the registry was read from. */
  registryRevision: Revision,
  /** False when the Specification is archived: nothing can be changed. */
  writable: Type.Boolean(),
  /** Registered documents in registry order, then unclassified files by path. */
  documents: Type.Array(TaskDocumentListingSchema),
});
export type TaskDocumentTree = Static<typeof TaskDocumentTreeSchema>;
