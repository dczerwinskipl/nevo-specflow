import { Type, type Static } from 'typebox';
import { TaskGroupSummarySchema, TaskOverviewSchema, WorkspaceTaskSchema } from '../../tasks';
import { ATTENTION_ACTIONS, BlockingTaskSchema } from '../../workflow/projection';
import { SessionIdSchema } from '../../sessions/model';
import { SpecIdSchema, TaskIdSchema } from '../../identifiers';
export * from '../../tasks';
export * from '../../documents';

const IdSchema = Type.String({
  minLength: 1,
  maxLength: 200,
  pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$',
});
export const SpecificationWorkspaceParamsSchema = Type.Object(
  { specId: SpecIdSchema },
  { additionalProperties: false },
);
export const ReadSectionSchema = <T extends ReturnType<typeof Type.Object>>(data: T) =>
  Type.Union([
    Type.Object({ state: Type.Literal('available'), data }),
    Type.Object({
      state: Type.Literal('unavailable'),
      reason: Type.Union([Type.Literal('not_implemented'), Type.Literal('source_unavailable')]),
    }),
    Type.Object({ state: Type.Literal('forbidden') }),
  ]);

export const WorkspaceTaskGroupSchema = Type.Object({
  id: IdSchema,
  name: Type.String(),
  /** How the Overview summary shows the group (its own row, or the compact line). */
  summary: TaskGroupSummarySchema,
  /** The Tasks page collapses it by default. */
  collapsed: Type.Boolean(),
  tasks: Type.Array(WorkspaceTaskSchema),
});
export const WorkspaceDocumentSchema = Type.Object({
  id: IdSchema,
  title: Type.String(),
  filename: Type.Optional(Type.String()),
  required: Type.Optional(Type.Boolean()),
  revision: Type.Optional(Type.String()),
  /**
   * The document TYPE id of the archetype vocabulary (for example `behaviour`), not the content kind
   * (`text`, `image`, `binary`) of the document tree. The name is kept for wire compatibility.
   */
  kind: Type.String(),
  summary: Type.Optional(Type.String()),
});
export const WorkspaceSessionSchema = Type.Object(
  {
    id: SessionIdSchema,
    /** Absent for an untitled Session; the server never invents a title. */
    title: Type.Optional(Type.String()),
    taskIds: Type.Array(TaskIdSchema),
    /** Effective Session readiness only (the single-Session read's provider projection). */
    status: Type.Union([
      Type.Literal('active'),
      Type.Literal('attention'),
      Type.Literal('quiet'),
      /** The provider needs a sign-in and no Turn is active. */
      Type.Literal('authenticationRequired'),
      Type.Literal('unknown'),
    ]),
    providerId: Type.String({ minLength: 1, maxLength: 128 }),
    /** Display titles from the Runtime's provider catalogue; absent when not listed. */
    providerTitle: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
    modelId: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    modelTitle: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
    updatedAt: Type.String({ minLength: 1, maxLength: 40 }),
  },
  { additionalProperties: false },
);
/**
 * The actions of workspace attention items: the workflow's, and `answer-session` for a Session that
 * waits for the person's input (the Session owner's item).
 */
export const WORKSPACE_ATTENTION_ACTIONS = [...ATTENTION_ACTIONS, 'answer-session'] as const;
export const WorkspaceAttentionSchema = Type.Object({
  id: IdSchema,
  kind: Type.Union([
    Type.Literal('task'),
    Type.Literal('session'),
    Type.Literal('git'),
    Type.Literal('specification'),
  ]),
  title: Type.String(),
  reason: Type.String(),
  targetId: Type.Optional(IdSchema),
  priority: Type.Optional(
    Type.Union([Type.Literal('critical'), Type.Literal('high'), Type.Literal('normal')]),
  ),
  /**
   * Workflow items (the Tasks owner, from the Engine's attention projection): the stable reason
   * code (`reason` is then its display text), who has to act, the one action and the Tasks it names
   * (`tasks-stuck`: the Tasks to resolve, with why each blocks). Absent on other items.
   */
  code: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  /** The title of the step the item is about (its action names it: "Start Implementation"). */
  stepTitle: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  actor: Type.Optional(Type.Union([Type.Literal('owner'), Type.Literal('agent')])),
  action: Type.Optional(
    Type.Unsafe<(typeof WORKSPACE_ATTENTION_ACTIONS)[number]>(
      Type.Union(WORKSPACE_ATTENTION_ACTIONS.map((action) => Type.Literal(action))),
    ),
  ),
  secondaryAction: Type.Optional(
    Type.Unsafe<(typeof WORKSPACE_ATTENTION_ACTIONS)[number]>(
      Type.Union(WORKSPACE_ATTENTION_ACTIONS.map((action) => Type.Literal(action))),
    ),
  ),
  taskIds: Type.Optional(Type.Array(TaskIdSchema)),
  blocking: Type.Optional(Type.Array(BlockingTaskSchema)),
});
const ActivitySchema = Type.Object({
  id: IdSchema,
  occurredAt: Type.String(),
  kind: Type.Union([
    Type.Literal('task'),
    Type.Literal('session'),
    Type.Literal('doc'),
    Type.Literal('info'),
  ]),
  /**
   * The semantic event of a known Runtime event, which clients localize; `title` and `description`
   * then carry English fallback text. Absent for a source-written event shown as delivered.
   */
  event: Type.Optional(
    Type.Union([Type.Literal('specification_created'), Type.Literal('session_started')]),
  ),
  title: Type.String(),
  description: Type.String(),
  targetId: Type.Optional(IdSchema),
  /** Session provenance for generic events carrying Session data. */
  relatedSessionId: Type.Optional(SessionIdSchema),
});
const RepoSchema = Type.Object({
  repositoryName: Type.Optional(Type.String()),
  branch: Type.Optional(Type.String()),
  baseBranch: Type.Optional(Type.String()),
  uncommittedCount: Type.Optional(Type.Integer({ minimum: 0 })),
  attention: Type.Array(WorkspaceAttentionSchema),
});
const ChangesSchema = Type.Object({
  base: Type.Array(Type.String()),
  uncommitted: Type.Array(Type.String()),
  mr: Type.Array(Type.String()),
});
const TaskCollectionSchema = Type.Object({
  /** The configured dashboard grouping, non-empty groups in display order. */
  groups: Type.Array(WorkspaceTaskGroupSchema),
  completed: Type.Integer({ minimum: 0 }),
  total: Type.Integer({ minimum: 0 }),
  /** Cancelled, ended and on hold Tasks, named apart from the progress; absent in the demo. */
  cancelled: Type.Optional(Type.Integer({ minimum: 0 })),
  /** Ended without completing by their own workflow (abandoned, not cancelled). */
  ended: Type.Optional(Type.Integer({ minimum: 0 })),
  onHold: Type.Optional(Type.Integer({ minimum: 0 })),
  attention: Type.Array(WorkspaceAttentionSchema),
  /** The Overview's compact summary of the groups and Now's explanation when stuck. */
  overview: TaskOverviewSchema,
});
const DocumentCollectionSchema = Type.Object({
  items: Type.Array(WorkspaceDocumentSchema),
  folders: Type.Optional(Type.Array(Type.String())),
  /**
   * The id of the Specification's overview among `items` (the document the workspace description is
   * read from), whatever its position. Absent when the overview is not listed; clients then offer no
   * expand action and never substitute another document.
   */
  overviewDocumentId: Type.Optional(IdSchema),
});
const SessionCollectionSchema = Type.Object({
  items: Type.Array(WorkspaceSessionSchema),
  /** More associated Sessions exist than the bounded section returns. */
  hasMore: Type.Optional(Type.Boolean()),
  attention: Type.Array(WorkspaceAttentionSchema),
});
const ActivityCollectionSchema = Type.Object({ items: Type.Array(ActivitySchema) });
const ActionSchema = Type.Object({
  available: Type.Boolean(),
  reason: Type.Optional(Type.String()),
});
const StartSessionActionSchema = Type.Object({
  ...ActionSchema.properties,
  /**
   * The start route when it is not the composed `POST /api/specs/:specId/sessions`: the demo
   * Runtime starts Sessions at `/api/demo/specs/:specId/sessions`.
   */
  path: Type.Optional(Type.String()),
});
export const SpecificationWorkspaceResponseSchema = Type.Object({
  revision: Type.String(),
  recommendedSessionId: Type.Optional(SessionIdSchema),
  specification: Type.Object({
    id: IdSchema,
    /** Optional human-facing Specification key (for example `UI-1234`). */
    key: Type.Optional(Type.String()),
    title: Type.String(),
    summary: Type.String(),
    preparationState: Type.Union([
      Type.Literal('empty'),
      Type.Literal('preparing'),
      Type.Literal('prepared'),
    ]),
    attention: Type.Array(WorkspaceAttentionSchema),
  }),
  sections: Type.Object({
    tasks: ReadSectionSchema(TaskCollectionSchema),
    documents: ReadSectionSchema(DocumentCollectionSchema),
    sessions: ReadSectionSchema(SessionCollectionSchema),
    activity: ReadSectionSchema(ActivityCollectionSchema),
    repository: ReadSectionSchema(RepoSchema),
    changes: ReadSectionSchema(ChangesSchema),
  }),
  actions: Type.Object({
    startSession: StartSessionActionSchema,
  }),
});
export const SpecificationReadErrorSchema = Type.Object(
  {
    error: Type.Union([
      Type.Literal('specification_not_found'),
      Type.Literal('specification_document_not_found'),
      Type.Literal('specification_task_not_found'),
      Type.Literal('specification_source_unavailable'),
    ]),
  },
  { $id: 'SpecificationReadError' },
);
export type SpecificationWorkspaceResponse = Static<typeof SpecificationWorkspaceResponseSchema>;
export type WorkspaceTaskGroup = Static<typeof WorkspaceTaskGroupSchema>;
export type WorkspaceDocument = Static<typeof WorkspaceDocumentSchema>;
export type WorkspaceSession = Static<typeof WorkspaceSessionSchema>;
export type WorkspaceAttention = Static<typeof WorkspaceAttentionSchema>;
