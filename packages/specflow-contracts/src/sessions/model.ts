import { Type, type Static } from 'typebox';

/** A human-readable display title resolved by the Runtime (provider or model name). */
export const DisplayTitleSchema = Type.String({ minLength: 1, maxLength: 512 });

const closed = { additionalProperties: false } as const;
export const SessionLimits = {
  page: 40,
  previewBytes: 2048,
  pageBytes: 256 * 1024,
  contentBytes: 64 * 1024,
  chunkBytes: 16 * 1024,
  messageBytes: 128 * 1024,
  eventBytes: 64 * 1024,
  subscriberBytes: 256 * 1024,
  replayCount: 10_000,
  replayAgeMs: 86_400_000,
} as const;
/** The UUID format of every Sessions API identifier: lowercase, as the Session store generates it. */
const SESSION_UUID_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
/**
 * The identifiers of the Sessions API share one format. The `title` of an entity id names its
 * shared OpenAPI component: the Runtime document references it wherever the id is used.
 */
const sessionEntityId = (title: string) => Type.String({ title, pattern: SESSION_UUID_PATTERN });
export const SessionIdSchema = sessionEntityId('SessionId');
export const TurnIdSchema = sessionEntityId('TurnId');
export const WorkIdSchema = sessionEntityId('WorkId');
export const ContentIdSchema = sessionEntityId('ContentId');
export const InteractionIdSchema = sessionEntityId('InteractionId');
/** A Sessions API UUID without a component of its own: command request ids, ToolActions, entries. */
export const SessionUuidSchema = Type.String({ pattern: SESSION_UUID_PATTERN });
export const SessionSequenceSchema = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const text = (maxLength: number) => Type.String({ maxLength });
export const SessionModeSchema = Type.Union([
  Type.Literal('read-only'),
  Type.Literal('workspace-write'),
]);
export const TurnStateSchema = Type.Union([
  Type.Literal('active'),
  Type.Literal('waiting'),
  Type.Literal('waitingForUser'),
  Type.Literal('cancelling'),
  Type.Literal('unknown'),
  Type.Literal('terminal'),
]);
export const TurnOutcomeSchema = Type.Union([
  Type.Literal('completed'),
  Type.Literal('failed'),
  Type.Literal('cancelled'),
  Type.Literal('interrupted'),
]);
export const WorkKindSchema = Type.Union([
  Type.Literal('commentary'),
  Type.Literal('reasoning'),
  Type.Literal('interaction'),
  Type.Literal('tool'),
]);
export const WorkStateSchema = Type.Union([
  Type.Literal('queued'),
  Type.Literal('active'),
  Type.Literal('waiting'),
  Type.Literal('completed'),
  Type.Literal('failed'),
  Type.Literal('cancelled'),
  Type.Literal('interrupted'),
  Type.Literal('expired'),
]);
export const ContentRefSchema = Type.Object(
  {
    contentId: ContentIdSchema,
    revision: text(128),
    byteLength: SessionSequenceSchema,
  },
  closed,
);
export const TextPreviewSchema = Type.Union([
  Type.Object(
    { text: text(2048), complete: Type.Literal(true), content: Type.Optional(ContentRefSchema) },
    closed,
  ),
  Type.Object(
    { text: text(2048), complete: Type.Literal(false), content: ContentRefSchema },
    closed,
  ),
]);
export const CommandPermissionActionSchema = Type.Object(
  {
    operation: Type.Literal('command'),
    command: Type.String({ minLength: 1, maxLength: 7000 }),
    cwd: Type.String({ minLength: 1, maxLength: 1024 }),
    authority: Type.Union([Type.Literal('workspace-write'), Type.Literal('host-execution')]),
    approval: Type.Literal('once'),
  },
  closed,
);
export const InteractionSchema = Type.Union([
  Type.Object(
    {
      interactionId: InteractionIdSchema,
      turnId: TurnIdSchema,
      workId: WorkIdSchema,
      revision: SessionSequenceSchema,
      kind: Type.Literal('question'),
      /** A short label of the question the provider gave (Claude's `header`, e.g. "Scope"). */
      header: Type.Optional(text(128)),
      prompt: text(8192),
      options: Type.Optional(
        Type.Array(Type.Object({ id: text(128), label: text(512) }, closed), { maxItems: 20 }),
      ),
      allowText: Type.Boolean(),
      maxSelections: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
    },
    closed,
  ),
  Type.Object(
    {
      interactionId: InteractionIdSchema,
      turnId: TurnIdSchema,
      workId: WorkIdSchema,
      revision: SessionSequenceSchema,
      kind: Type.Literal('permission'),
      prompt: text(8192),
      actionSummary: text(8192),
      action: Type.Optional(CommandPermissionActionSchema),
    },
    closed,
  ),
]);
/**
 * The agent step attempt an agent step execution Session was made for (its first attempt; a reused
 * Session keeps it), derived on each read from the committed attempt records, never stored: the
 * step's id and title in the pinned workflow (the id when the workflow no longer defines it), the
 * attempt number and, for a Task subject, the Task. Present only to a caller who may view the
 * Session's Specification. A client words the Session's lines from it; the Session `title` stays
 * the title line when the owner gave one.
 */
export const AgentStepOriginSchema = Type.Object(
  {
    stepId: text(128),
    stepTitle: text(512),
    attempt: Type.Integer({ minimum: 1 }),
    taskId: Type.Optional(text(128)),
    taskTitle: Type.Optional(text(512)),
  },
  closed,
);
export type AgentStepOrigin = Static<typeof AgentStepOriginSchema>;

export const SessionInfoSchema = Type.Object(
  {
    sessionId: SessionIdSchema,
    projectId: Type.String({ minLength: 1, maxLength: 256 }),
    title: Type.Optional(text(256)),
    providerId: Type.String({ minLength: 1, maxLength: 128 }),
    /**
     * Presentational: the provider's display title from the Runtime's catalogue, resolved like a
     * list row's, so `session.view` alone can name the executor. Absent when it is not listed.
     */
    providerTitle: Type.Optional(DisplayTitleSchema),
    modelId: Type.Optional(text(256)),
    /** Presentational: the display title of `modelId` in that catalogue; absent when not listed. */
    modelTitle: Type.Optional(DisplayTitleSchema),
    mode: SessionModeSchema,
    providerModeId: Type.Optional(text(128)),
    effort: Type.Optional(text(64)),
    readiness: Type.Union([
      Type.Literal('ready'),
      Type.Literal('busy'),
      Type.Literal('requiresAttention'),
      Type.Literal('unavailable'),
      Type.Literal('authenticationRequired'),
    ]),
    capabilities: Type.Object(
      {
        view: Type.Boolean(),
        manage: Type.Boolean(),
        start: Type.Boolean(),
        cancel: Type.Boolean(),
        questions: Type.Boolean(),
        permissions: Type.Boolean(),
        executeWrite: Type.Optional(Type.Boolean()),
        delete: Type.Optional(Type.Boolean()),
      },
      closed,
    ),
    /** Present while archived: the Session is read-only until unarchived. */
    archivedAt: Type.Optional(text(40)),
    createdAt: text(40),
    updatedAt: text(40),
    agentStep: Type.Optional(AgentStepOriginSchema),
    /**
     * Present while the Session's agent attempt is open: an owner message would be refused
     * (`TURN_CONFLICT`, reason `agent-attempt-open`), so a client disables the Composer up front
     * and shows `message`, which says what to do instead.
     */
    ownerMessageHold: Type.Optional(
      Type.Object({ reason: Type.Literal('agent-attempt-open'), message: text(1024) }, closed),
    ),
  },
  closed,
);
export const ActiveTurnSchema = Type.Object(
  {
    mode: Type.Optional(SessionModeSchema),
    providerModeId: Type.Optional(text(128)),
    turnId: TurnIdSchema,
    state: Type.Union([
      Type.Literal('active'),
      Type.Literal('waiting'),
      Type.Literal('waitingForUser'),
      Type.Literal('cancelling'),
      Type.Literal('unknown'),
    ]),
    revision: SessionSequenceSchema,
    startedAt: text(40),
  },
  closed,
);
export const CurrentActivitySchema = Type.Object(
  {
    kind: Type.Union([
      Type.Literal('responding'),
      Type.Literal('commentary'),
      Type.Literal('reasoning'),
      Type.Literal('tool'),
      Type.Literal('waiting'),
      Type.Literal('attention'),
      Type.Literal('cancelling'),
      Type.Literal('unknown'),
    ]),
    turnId: TurnIdSchema,
    workId: Type.Optional(WorkIdSchema),
    label: text(1024),
  },
  closed,
);
/** Closed ToolAction classification, taken only from the provider's own tool identity. */
export const ToolOperationSchema = Type.Union([
  Type.Literal('read'),
  Type.Literal('edit'),
  Type.Literal('write'),
  Type.Literal('list'),
  Type.Literal('search'),
  Type.Literal('command'),
  Type.Literal('test'),
  Type.Literal('web'),
  Type.Literal('other'),
]);
/**
 * What a tool operation acts on, language-neutral and short: a path relative to the Session's
 * workspace for a file tool, the first line of a command, a search pattern, a URL. The client
 * names the operation in its own words before it.
 */
export const ToolSubjectSchema = text(1024);
const operationCounts = Type.Object(
  {
    read: Type.Optional(SessionSequenceSchema),
    edit: Type.Optional(SessionSequenceSchema),
    write: Type.Optional(SessionSequenceSchema),
    list: Type.Optional(SessionSequenceSchema),
    search: Type.Optional(SessionSequenceSchema),
    command: Type.Optional(SessionSequenceSchema),
    test: Type.Optional(SessionSequenceSchema),
    web: Type.Optional(SessionSequenceSchema),
    other: Type.Optional(SessionSequenceSchema),
  },
  closed,
);
/** Turn-wide ToolAction tally by operation: `opened` counts every opened action, `failed` those
 * that ended failed. Maintained transactionally by Runtime, never computed at read time. */
export const WorkDigestSchema = Type.Object(
  {
    /** Every ToolAction the Turn opened, per operation, regardless of the state it reached
     * (active, completed, failed, cancelled or interrupted). */
    opened: operationCounts,
    /** The ToolActions whose state became `failed`; each is also counted in `opened`. */
    failed: Type.Optional(operationCounts),
  },
  closed,
);
/** How serious a notice SpecFlow writes into a conversation is. */
export const NoticeSeveritySchema = Type.Union([
  Type.Literal('error'),
  Type.Literal('warning'),
  Type.Literal('info'),
]);
export const TurnErrorSchema = Type.Object(
  {
    code: text(64),
    message: text(2048),
    /** A stable reason a client words itself (e.g. `claude-policy-check-failed`); `message` is the
     * Runtime's English fallback for a reason the client does not know. */
    reason: Type.Optional(text(128)),
  },
  closed,
);
/**
 * Who wrote a `request` entry when it was not a person: `specflow-step-brief`, the brief agent step
 * execution sent to start or continue an agent attempt. The entry's `text` is the full brief (its
 * `content` reference reads all of it); a client shows a short line naming the step and the attempt
 * and opens the brief on demand. `handoff` is what the previous step handed over, as data.
 */
export const RequestOriginSchema = Type.Object(
  {
    kind: Type.Literal('specflow-step-brief'),
    specId: text(128),
    /** The Task subject of the attempt, with its title. */
    task: Type.Optional(Type.Object({ id: text(128), title: text(512) }, closed)),
    step: Type.Object({ id: text(128), title: text(512) }, closed),
    attempt: Type.Integer({ minimum: 1 }),
    /** The agent archetype the step runs with, by its id and title. Absent on older briefs. */
    archetype: Type.Optional(Type.Object({ id: text(128), title: text(512) }, closed)),
    /**
     * The request continues the same attempt (a Continue of its Session's agent) instead of
     * starting it: a client says "execution resumed", never a new attempt. Absent for the brief
     * that started the attempt.
     */
    continuation: Type.Optional(Type.Literal(true)),
    /**
     * The owner's note sent with this brief (after it, in the same Turn): a client shows it as the
     * owner's own message, after the brief (after "execution resumed" for a Continue).
     */
    ownerNote: Type.Optional(text(4000)),
    handoff: Type.Optional(
      Type.Object(
        {
          kind: Type.Union([Type.Literal('transition'), Type.Literal('return')]),
          /** A transition: the step and attempt that finished, and its result. */
          from: Type.Optional(
            Type.Object(
              {
                step: text(128),
                attempt: Type.Integer({ minimum: 1 }),
                /** The step's title in the pinned definition; absent on older briefs. */
                title: Type.Optional(text(512)),
              },
              closed,
            ),
          ),
          transition: Type.Optional(text(128)),
          /** The transition's display label in the definition, when it gives one. */
          label: Type.Optional(text(256)),
          result: Type.Optional(text(128)),
          feedback: Type.Optional(text(8192)),
          artifacts: Type.Optional(Type.Array(text(1024), { maxItems: 64 })),
        },
        closed,
      ),
    ),
  },
  closed,
);
export type RequestOrigin = Static<typeof RequestOriginSchema>;
export const ConversationEntrySchema = Type.Object(
  {
    id: SessionUuidSchema,
    ordinal: SessionSequenceSchema,
    revision: SessionSequenceSchema,
    turnId: TurnIdSchema,
    kind: Type.Union([
      Type.Literal('request'),
      Type.Literal('commentary'),
      Type.Literal('work-summary'),
      Type.Literal('answer'),
      Type.Literal('outcome'),
    ]),
    text: TextPreviewSchema,
    workId: Type.Optional(WorkIdSchema),
    /** The Turn's latest `work-summary` entry carries the current digest once a ToolAction opened;
     * an earlier entry keeps the value it had while it was the latest. */
    digest: Type.Optional(WorkDigestSchema),
    /** An `outcome` entry of a Turn that ended with an error: the Turn's safe reason (`code` lets a
     * client say why and what to do). */
    error: Type.Optional(TurnErrorSchema),
    /**
     * Only on a `commentary` entry SpecFlow wrote itself (a provider error it relays, a process it
     * stopped, a recovery it made), never on the agent's own words: a client shows it as a notice
     * of this severity, apart from the agent's commentary.
     */
    notice: Type.Optional(Type.Object({ severity: NoticeSeveritySchema }, closed)),
    /** Only on a `request` entry SpecFlow wrote itself (the brief of an agent attempt). */
    origin: Type.Optional(RequestOriginSchema),
    createdAt: text(40),
  },
  closed,
);
export const HistoryCursorSchema = Type.Object(
  { hasOlder: Type.Boolean(), before: Type.Optional(text(2048)) },
  closed,
);
export const SessionSnapshotSchema = Type.Object(
  {
    session: SessionInfoSchema,
    revision: SessionSequenceSchema,
    eventSeq: SessionSequenceSchema,
    activeTurn: Type.Optional(ActiveTurnSchema),
    currentActivity: Type.Optional(CurrentActivitySchema),
    interaction: Type.Optional(InteractionSchema),
    entries: Type.Array(ConversationEntrySchema, { maxItems: 40 }),
    history: HistoryCursorSchema,
  },
  closed,
);
export const HistoryPageSchema = Type.Object(
  {
    sessionId: SessionIdSchema,
    eventSeq: SessionSequenceSchema,
    entries: Type.Array(ConversationEntrySchema, { maxItems: 40 }),
    history: HistoryCursorSchema,
  },
  closed,
);
export const ContentPageSchema = Type.Object(
  {
    contentId: ContentIdSchema,
    revision: text(128),
    offset: SessionSequenceSchema,
    text: text(65536),
    nextOffset: Type.Optional(SessionSequenceSchema),
    complete: Type.Boolean(),
  },
  closed,
);
const turnFields = {
  mode: Type.Optional(SessionModeSchema),
  providerModeId: Type.Optional(text(128)),
  turnId: TurnIdSchema,
  revision: SessionSequenceSchema,
  createdAt: text(40),
  updatedAt: text(40),
  userMessage: TextPreviewSchema,
  finalAnswer: Type.Optional(TextPreviewSchema),
  error: Type.Optional(TurnErrorSchema),
  usage: Type.Optional(
    Type.Object(
      {
        inputTokens: Type.Optional(SessionSequenceSchema),
        outputTokens: Type.Optional(SessionSequenceSchema),
        cachedTokens: Type.Optional(SessionSequenceSchema),
        cacheWriteTokens: Type.Optional(SessionSequenceSchema),
        reasoningTokens: Type.Optional(SessionSequenceSchema),
      },
      closed,
    ),
  ),
};
export const TurnSummarySchema = Type.Union([
  Type.Object({ ...turnFields, state: ActiveTurnSchema.properties.state }, closed),
  Type.Object(
    {
      ...turnFields,
      state: Type.Literal('terminal'),
      outcome: TurnOutcomeSchema,
      completedAt: text(40),
    },
    closed,
  ),
]);
export const WorkSummarySchema = Type.Object(
  {
    workId: WorkIdSchema,
    ordinal: SessionSequenceSchema,
    revision: SessionSequenceSchema,
    kind: WorkKindSchema,
    state: WorkStateSchema,
    title: TextPreviewSchema,
    content: Type.Optional(ContentRefSchema),
    actionCount: Type.Optional(SessionSequenceSchema),
    /** Tool Work: its first ToolAction's operation and subject; a permission: what it asks for. */
    operation: Type.Optional(ToolOperationSchema),
    subject: Type.Optional(ToolSubjectSchema),
    /** Tool Work with a failed ToolAction: the first one's subject and the provider's reason. */
    failure: Type.Optional(
      Type.Object(
        {
          subject: Type.Optional(ToolSubjectSchema),
          message: text(1024),
          /** A stable reason a client words itself (`outside-worktree`); `message` stays raw. */
          reason: Type.Optional(text(128)),
        },
        closed,
      ),
    ),
    /** An interaction Work: whether it asks for a permission or asks a question. */
    interaction: Type.Optional(Type.Union([Type.Literal('permission'), Type.Literal('question')])),
    /** A permission the person answered: what they decided. */
    decision: Type.Optional(Type.Union([Type.Literal('allowed'), Type.Literal('denied')])),
    /**
     * A question the person answered, as asked and as answered, recorded when the answer is
     * accepted (bounded: the question's first paragraph, the option labels, the free text). Absent
     * for questions answered before it was recorded; a client then never guesses the answer.
     */
    question: Type.Optional(
      Type.Object(
        {
          header: Type.Optional(text(128)),
          text: text(1024),
          options: Type.Optional(
            Type.Array(Type.Object({ id: text(128), label: text(512) }, closed), { maxItems: 20 }),
          ),
          answer: Type.Object(
            {
              optionIds: Type.Array(text(128), { maxItems: 20 }),
              text: Type.Optional(text(2048)),
            },
            closed,
          ),
        },
        closed,
      ),
    ),
    createdAt: text(40),
    updatedAt: text(40),
  },
  closed,
);
export const ToolActionSummarySchema = Type.Object(
  {
    actionId: SessionUuidSchema,
    ordinal: SessionSequenceSchema,
    revision: SessionSequenceSchema,
    state: WorkStateSchema,
    title: TextPreviewSchema,
    operation: Type.Optional(ToolOperationSchema),
    subject: Type.Optional(ToolSubjectSchema),
    input: Type.Optional(ContentRefSchema),
    output: Type.Optional(ContentRefSchema),
    error: Type.Optional(TurnErrorSchema),
    createdAt: text(40),
    updatedAt: text(40),
  },
  closed,
);
/** Turn-wide Work aggregate, maintained transactionally with each Work open/state change. */
export const WorkCountsSchema = Type.Object(
  {
    total: SessionSequenceSchema,
    inProgress: SessionSequenceSchema,
    byKind: Type.Object(
      {
        commentary: SessionSequenceSchema,
        reasoning: SessionSequenceSchema,
        interaction: SessionSequenceSchema,
        tool: SessionSequenceSchema,
      },
      closed,
    ),
    /**
     * Of `byKind.commentary`, the notes SpecFlow wrote itself (a notice: an automatic approval, a
     * relayed error), not the agent's progress notes. Absent for Turns counted before it existed.
     */
    notices: Type.Optional(SessionSequenceSchema),
  },
  closed,
);
export const WorkPageSchema = Type.Object(
  {
    sessionId: SessionIdSchema,
    turn: TurnSummarySchema,
    eventSeq: SessionSequenceSchema,
    items: Type.Array(WorkSummarySchema, { maxItems: 40 }),
    history: HistoryCursorSchema,
    /** Omitted for Turns created before Runtime maintained the aggregate. */
    counts: Type.Optional(WorkCountsSchema),
  },
  closed,
);
export const ActionPageSchema = Type.Object(
  {
    sessionId: SessionIdSchema,
    workId: WorkIdSchema,
    eventSeq: SessionSequenceSchema,
    items: Type.Array(ToolActionSummarySchema, { maxItems: 40 }),
    history: HistoryCursorSchema,
  },
  closed,
);
export const LiveProjectionSchema = Type.Object(
  {
    session: SessionInfoSchema,
    activeTurn: Type.Union([ActiveTurnSchema, Type.Null()]),
    currentActivity: Type.Union([CurrentActivitySchema, Type.Null()]),
    interaction: Type.Union([InteractionSchema, Type.Null()]),
  },
  closed,
);
const event = { sessionId: SessionIdSchema, eventSeq: SessionSequenceSchema };
export const SessionChangeSchema = Type.Union([
  Type.Object(
    {
      ...event,
      kind: Type.Literal('telemetry'),
      changes: Type.Object({ telemetryRevision: SessionSequenceSchema }, closed),
    },
    closed,
  ),
  Type.Object(
    {
      ...event,
      kind: Type.Literal('session'),
      // The full projection, not the bare SessionInfo: Turn-dependent capabilities (Start,
      // Cancel) and effective readiness are only correct with the activeTurn of this eventSeq.
      changes: Type.Object({ projection: LiveProjectionSchema }, closed),
    },
    closed,
  ),
  Type.Object(
    {
      ...event,
      kind: Type.Literal('turn'),
      changes: Type.Object({ turn: TurnSummarySchema, projection: LiveProjectionSchema }, closed),
    },
    closed,
  ),
  Type.Object(
    {
      ...event,
      kind: Type.Literal('conversation'),
      changes: Type.Object(
        {
          entries: Type.Array(ConversationEntrySchema, { maxItems: 8 }),
          projection: Type.Optional(LiveProjectionSchema),
        },
        closed,
      ),
    },
    closed,
  ),
  Type.Object(
    {
      ...event,
      kind: Type.Literal('work'),
      changes: Type.Object(
        {
          turnId: TurnIdSchema,
          items: Type.Array(WorkSummarySchema, { maxItems: 8 }),
          projection: Type.Optional(LiveProjectionSchema),
        },
        closed,
      ),
    },
    closed,
  ),
  Type.Object(
    {
      ...event,
      kind: Type.Literal('interaction'),
      changes: Type.Object({ projection: LiveProjectionSchema }, closed),
    },
    closed,
  ),
]);
export type SessionInfo = Static<typeof SessionInfoSchema>;
export type SessionSnapshot = Static<typeof SessionSnapshotSchema>;
export type ConversationEntry = Static<typeof ConversationEntrySchema>;
export type NoticeSeverity = Static<typeof NoticeSeveritySchema>;
export type TextPreview = Static<typeof TextPreviewSchema>;
export type ContentRef = Static<typeof ContentRefSchema>;
export type ContentPage = Static<typeof ContentPageSchema>;
export type HistoryPage = Static<typeof HistoryPageSchema>;
export type WorkPage = Static<typeof WorkPageSchema>;
export type ActionPage = Static<typeof ActionPageSchema>;
export type WorkSummary = Static<typeof WorkSummarySchema>;
export type WorkCounts = Static<typeof WorkCountsSchema>;
export type WorkDigest = Static<typeof WorkDigestSchema>;
export type ToolOperation = Static<typeof ToolOperationSchema>;
export type ToolActionSummary = Static<typeof ToolActionSummarySchema>;
export type TurnSummary = Static<typeof TurnSummarySchema>;
export type TurnState = Static<typeof TurnStateSchema>;
export type TurnOutcome = Static<typeof TurnOutcomeSchema>;
export type Interaction = Static<typeof InteractionSchema>;
export type SessionChange = Static<typeof SessionChangeSchema>;
export type LiveProjection = Static<typeof LiveProjectionSchema>;
