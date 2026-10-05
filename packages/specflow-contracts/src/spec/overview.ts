import { Type, type Static } from 'typebox';

export const SpecsCollectionSchema = Type.Union([Type.Literal('active'), Type.Literal('archive')]);
export type SpecsCollection = Static<typeof SpecsCollectionSchema>;
export const SpecsOverviewGroupIdSchema = Type.Union([
  Type.Literal('requires-attention'),
  Type.Literal('active'),
  Type.Literal('ready'),
  Type.Literal('draft'),
]);
export type SpecsOverviewGroupId = Static<typeof SpecsOverviewGroupIdSchema>;
export const SpecsOverviewGroupSchema = Type.Object({
  id: SpecsOverviewGroupIdSchema,
  order: Type.Integer(),
});
export type SpecsOverviewGroup = Static<typeof SpecsOverviewGroupSchema>;
// Backend-decided aggregate facts. Rich evidence below remains inspection-only.
export const SpecsOverviewSummarySchema = Type.Union([
  Type.Object({
    kind: Type.Literal('attention'),
    reason: Type.Union([
      Type.Literal('input'),
      Type.Literal('decision'),
      Type.Literal('review'),
      Type.Literal('blocked'),
      Type.Literal('approval'),
    ]),
    count: Type.Optional(Type.Integer({ minimum: 1 })),
  }),
  Type.Object({ kind: Type.Literal('active'), executionCount: Type.Integer({ minimum: 1 }) }),
  Type.Object({ kind: Type.Literal('ready') }),
  Type.Object({ kind: Type.Literal('draft') }),
  Type.Object({ kind: Type.Literal('unavailable') }),
]);
export type SpecsOverviewSummary = Static<typeof SpecsOverviewSummarySchema>;
export const SteeringKindSchema = Type.Union([
  Type.Literal('attention'),
  Type.Literal('ready'),
  Type.Literal('working'),
  Type.Literal('issue'),
  Type.Literal('quiet'),
]);
export type SteeringKind = Static<typeof SteeringKindSchema>;
export const SteeringTargetSchema = Type.Union([
  Type.Object({ kind: Type.Literal('specification'), specId: Type.String() }),
  Type.Object({ kind: Type.Literal('task'), specId: Type.String(), taskId: Type.String() }),
  Type.Object({ kind: Type.Literal('session'), specId: Type.String(), sessionId: Type.String() }),
]);
export type SteeringTarget = Static<typeof SteeringTargetSchema>;
export const SpecSteeringSignalSchema = Type.Object({
  id: Type.String(),
  kind: SteeringKindSchema,
  label: Type.String(),
  reason: Type.Optional(Type.String()),
  attentionReason: Type.Optional(
    Type.Union([
      Type.Literal('input'),
      Type.Literal('decision'),
      Type.Literal('review'),
      Type.Literal('blocked'),
    ]),
  ),
  priority: Type.Number(),
  target: SteeringTargetSchema,
});
export type SpecSteeringSignal = Static<typeof SpecSteeringSignalSchema>;
export const SpecOverviewIdentitySchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  key: Type.Optional(Type.String()),
  pullRequests: Type.Optional(
    Type.Array(Type.Object({ number: Type.Integer(), url: Type.String() })),
  ),
  tags: Type.Optional(Type.Array(Type.String())),
  updatedAt: Type.String(),
  progress: Type.Object({
    completed: Type.Integer({ minimum: 0 }),
    total: Type.Integer({ minimum: 0 }),
  }),
});
export type SpecOverviewIdentity = Static<typeof SpecOverviewIdentitySchema>;
export const SpecArchiveItemProjectionSchema = Type.Object(
  {
    ...SpecOverviewIdentitySchema.properties,
    completedAt: Type.Optional(Type.String()),
    archivedAt: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type SpecArchiveItemProjection = Static<typeof SpecArchiveItemProjectionSchema>;
export const SpecSteeringItemProjectionSchema = Type.Object({
  ...SpecOverviewIdentitySchema.properties,
  groupId: SpecsOverviewGroupIdSchema,
  overviewSummary: SpecsOverviewSummarySchema,
  concurrentWork: Type.Optional(Type.Object({ executionCount: Type.Integer({ minimum: 1 }) })),
  signals: Type.Array(SpecSteeringSignalSchema),
  currentExecutions: Type.Array(
    Type.Object({
      sessionId: Type.String(),
      agentRole: Type.String(),
      taskIds: Type.Array(Type.String()),
    }),
  ),
  steeringAvailable: Type.Optional(Type.Boolean()),
});
export type SpecSteeringItemProjection = Static<typeof SpecSteeringItemProjectionSchema>;
const envelope = {
  revision: Type.String(),
  sample: Type.Optional(Type.Boolean()),
};
export const CurrentSpecsOverviewProjectionSchema = Type.Object({
  ...envelope,
  collection: Type.Literal('active'),
  groups: Type.Array(SpecsOverviewGroupSchema),
  items: Type.Array(SpecSteeringItemProjectionSchema),
});
export type CurrentSpecsOverviewProjection = Static<typeof CurrentSpecsOverviewProjectionSchema>;
export const ArchiveSpecsOverviewProjectionSchema = Type.Object({
  ...envelope,
  collection: Type.Literal('archive'),
  groups: Type.Array(SpecsOverviewGroupSchema, { maxItems: 0 }),
  items: Type.Array(SpecArchiveItemProjectionSchema),
});
export type ArchiveSpecsOverviewProjection = Static<typeof ArchiveSpecsOverviewProjectionSchema>;
export const SpecsOverviewProjectionSchema = Type.Union([
  CurrentSpecsOverviewProjectionSchema,
  ArchiveSpecsOverviewProjectionSchema,
]);
export type SpecsOverviewProjection = Static<typeof SpecsOverviewProjectionSchema>;
export const SpecsOverviewQuerySchema = Type.Object(
  { collection: Type.Optional(SpecsCollectionSchema) },
  { additionalProperties: false },
);
