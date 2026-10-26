import { Type, type Static } from 'typebox';

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
export const SessionIdSchema = Type.String({
  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
});
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
    contentId: SessionIdSchema,
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
export const InteractionSchema = Type.Union([
  Type.Object(
    {
      interactionId: SessionIdSchema,
      turnId: SessionIdSchema,
      workId: SessionIdSchema,
      revision: SessionSequenceSchema,
      kind: Type.Literal('question'),
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
      interactionId: SessionIdSchema,
      turnId: SessionIdSchema,
      workId: SessionIdSchema,
      revision: SessionSequenceSchema,
      kind: Type.Literal('permission'),
      prompt: text(8192),
      actionSummary: text(8192),
    },
    closed,
  ),
]);
export const SessionInfoSchema = Type.Object(
  {
    sessionId: SessionIdSchema,
    projectId: Type.String({ minLength: 1, maxLength: 256 }),
    title: Type.Optional(text(256)),
    providerId: Type.String({ minLength: 1, maxLength: 128 }),
    modelId: Type.Optional(text(256)),
    mode: SessionModeSchema,
    providerModeId: Type.Optional(text(128)),
    effort: Type.Optional(text(64)),
    readiness: Type.Union([
      Type.Literal('ready'),
      Type.Literal('busy'),
      Type.Literal('requiresAttention'),
      Type.Literal('unavailable'),
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
      },
      closed,
    ),
    createdAt: text(40),
    updatedAt: text(40),
  },
  closed,
);
export const ActiveTurnSchema = Type.Object(
  {
    mode: Type.Optional(SessionModeSchema),
    providerModeId: Type.Optional(text(128)),
    turnId: SessionIdSchema,
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
    turnId: SessionIdSchema,
    workId: Type.Optional(SessionIdSchema),
    label: text(1024),
  },
  closed,
);
export const ConversationEntrySchema = Type.Object(
  {
    id: SessionIdSchema,
    ordinal: SessionSequenceSchema,
    revision: SessionSequenceSchema,
    turnId: SessionIdSchema,
    kind: Type.Union([
      Type.Literal('request'),
      Type.Literal('commentary'),
      Type.Literal('work-summary'),
      Type.Literal('answer'),
      Type.Literal('outcome'),
    ]),
    text: TextPreviewSchema,
    workId: Type.Optional(SessionIdSchema),
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
    contentId: SessionIdSchema,
    revision: text(128),
    offset: SessionSequenceSchema,
    text: text(65536),
    nextOffset: Type.Optional(SessionSequenceSchema),
    complete: Type.Boolean(),
  },
  closed,
);
export const TurnErrorSchema = Type.Object({ code: text(64), message: text(2048) }, closed);
const turnFields = {
  mode: Type.Optional(SessionModeSchema),
  providerModeId: Type.Optional(text(128)),
  turnId: SessionIdSchema,
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
    workId: SessionIdSchema,
    ordinal: SessionSequenceSchema,
    revision: SessionSequenceSchema,
    kind: WorkKindSchema,
    state: WorkStateSchema,
    title: TextPreviewSchema,
    content: Type.Optional(ContentRefSchema),
    actionCount: Type.Optional(SessionSequenceSchema),
    createdAt: text(40),
    updatedAt: text(40),
  },
  closed,
);
export const ToolActionSummarySchema = Type.Object(
  {
    actionId: SessionIdSchema,
    ordinal: SessionSequenceSchema,
    revision: SessionSequenceSchema,
    state: WorkStateSchema,
    title: TextPreviewSchema,
    input: Type.Optional(ContentRefSchema),
    output: Type.Optional(ContentRefSchema),
    error: Type.Optional(TurnErrorSchema),
    createdAt: text(40),
    updatedAt: text(40),
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
  },
  closed,
);
export const ActionPageSchema = Type.Object(
  {
    sessionId: SessionIdSchema,
    workId: SessionIdSchema,
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
      kind: Type.Literal('session'),
      changes: Type.Object({ session: SessionInfoSchema }, closed),
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
          turnId: SessionIdSchema,
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
export type TextPreview = Static<typeof TextPreviewSchema>;
export type ContentRef = Static<typeof ContentRefSchema>;
export type ContentPage = Static<typeof ContentPageSchema>;
export type HistoryPage = Static<typeof HistoryPageSchema>;
export type WorkPage = Static<typeof WorkPageSchema>;
export type ActionPage = Static<typeof ActionPageSchema>;
export type WorkSummary = Static<typeof WorkSummarySchema>;
export type ToolActionSummary = Static<typeof ToolActionSummarySchema>;
export type TurnSummary = Static<typeof TurnSummarySchema>;
export type TurnState = Static<typeof TurnStateSchema>;
export type TurnOutcome = Static<typeof TurnOutcomeSchema>;
export type Interaction = Static<typeof InteractionSchema>;
export type SessionChange = Static<typeof SessionChangeSchema>;
export type LiveProjection = Static<typeof LiveProjectionSchema>;
