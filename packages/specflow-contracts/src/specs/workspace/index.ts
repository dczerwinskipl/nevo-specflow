import { Type, type Static } from 'typebox';
import { TaskGroupSummarySchema, TaskOverviewSchema, WorkspaceTaskSchema } from '../../tasks';
import {
  ATTENTION_ACTIONS,
  BlockingTaskSchema,
  HeldTaskBlocksSchema,
} from '../../workflow/projection';
import { AgentStepOriginSchema, SessionIdSchema } from '../../sessions/model';
import { SpecIdSchema, TaskIdSchema, WorkspaceIdSchema } from '../../identifiers';
import { DocumentContentStateSchema } from '../../documents/vocabulary';
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
      /**
       * `source_busy`: the source is held by another writer (the project control lock) longer than
       * a read waits; a retry soon can succeed. `source_recovery`: the lock is held by a process
       * nothing proves stopped (or is corrupt); only an operator's recovery helps.
       * `source_unavailable`: it cannot be read now.
       */
      reason: Type.Union([
        Type.Literal('not_implemented'),
        Type.Literal('source_unavailable'),
        Type.Literal('source_busy'),
        Type.Literal('source_recovery'),
      ]),
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
  kind: Type.String({
    description: 'Archetype document type id, not the document content kind text/image/binary.',
  }),
  summary: Type.Optional(Type.String()),
  /** `DocumentContentState`; absent when the source cannot tell (the demo Runtime). */
  contentState: Type.Optional(DocumentContentStateSchema),
});
export const WorkspaceSessionSchema = Type.Object(
  {
    id: SessionIdSchema,
    /** Absent for an untitled Session; the server never invents a title. */
    title: Type.Optional(Type.String()),
    taskIds: Type.Array(TaskIdSchema),
    /** Effective Session readiness only (the single-Session read's provider projection). */
    status: Type.Union(
      [
        Type.Literal('active'),
        Type.Literal('attention'),
        Type.Literal('quiet'),
        /** The provider needs a sign-in and no Turn is active. */
        Type.Literal('authenticationRequired'),
        Type.Literal('unknown'),
      ],
      {
        description:
          'Effective Session provider readiness, not Task run status: active, attention, quiet, authenticationRequired or unknown.',
      },
    ),
    providerId: Type.String({ minLength: 1, maxLength: 128 }),
    /** Display titles from the Runtime's provider catalogue; absent when not listed. */
    providerTitle: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
    modelId: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    modelTitle: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
    /** The title of the provider mode the Session runs in (for Claude: Auto, Manual, ...). */
    providerModeTitle: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
    updatedAt: Type.String({ minLength: 1, maxLength: 40 }),
    /** An agent step execution Session's step and attempt (sessions `AgentStepOrigin`). */
    agentStep: Type.Optional(AgentStepOriginSchema),
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
   * (`tasks-stuck`: the Tasks to resolve, with why each blocks; `on-hold-blocking`: what the held
   * Task holds up, `blocks`). Absent on other items.
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
  brokenTaskIds: Type.Optional(Type.Array(TaskIdSchema)),
  blocking: Type.Optional(Type.Array(BlockingTaskSchema)),
  blocks: Type.Optional(HeldTaskBlocksSchema),
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
    Type.Union([Type.Literal('specification_created'), Type.Literal('session_started')], {
      description:
        'Known Runtime event for client localization (specification_created or session_started); title and description are fallbacks.',
    }),
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
  /** Cancelled, ended and on hold Tasks, named apart from the progress. */
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
  hasMore: Type.Optional(
    Type.Boolean({
      description: 'True when more than the bounded 100 non-archived associated Sessions exist.',
    }),
  ),
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
  path: Type.Optional(
    Type.String({
      description:
        'Temporary route override in demo; absent when the normal composed Specification Session route is used.',
    }),
  ),
});
export const SpecificationWorkspaceResponseSchema = Type.Object({
  revision: Type.String({
    description:
      'Manifest sourceRevision only; it does not change when Session details, Task progress or overview text change.',
  }),
  /** The registered workspace (UUID) the Specification is bound to; its documentation corpus is read there. */
  workspaceId: WorkspaceIdSchema,
  recommendedSessionId: Type.Optional(SessionIdSchema),
  specification: Type.Object({
    id: IdSchema,
    /** The human key Create gave the Specification (`nevo-2`); absent for one created without. */
    key: Type.Optional(
      Type.String({
        description:
          'Human key of the Specification from its manifest (for example nevo-2), as the Specifications list shows it; absent when the manifest has none.',
      }),
    ),
    title: Type.String(),
    summary: Type.String({
      description:
        'Plain text from the overview Goal paragraph, else the first body paragraph. Read bounded to 32 KiB and output to 320 graphemes; empty when unavailable.',
    }),
    preparationState: Type.Union(
      [Type.Literal('empty'), Type.Literal('preparing'), Type.Literal('prepared')],
      {
        description:
          'Engine Task preparation: empty with no readable Tasks, preparing while a Task is draft, otherwise prepared.',
      },
    ),
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
    /** Why the source is unavailable, when only an operator's recovery helps. */
    code: Type.Optional(Type.Literal('CONTROL_LOCK_RECOVERY_REQUIRED')),
  },
  { $id: 'SpecificationReadError' },
);
export type SpecificationWorkspaceResponse = Static<typeof SpecificationWorkspaceResponseSchema>;
export type WorkspaceTaskGroup = Static<typeof WorkspaceTaskGroupSchema>;
export type WorkspaceDocument = Static<typeof WorkspaceDocumentSchema>;
export type WorkspaceSession = Static<typeof WorkspaceSessionSchema>;
export type WorkspaceAttention = Static<typeof WorkspaceAttentionSchema>;
