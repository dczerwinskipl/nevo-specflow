import { Type, type Static } from 'typebox';
import { AssociationTargetIdSchema, SessionReferenceIdSchema } from './associations';
import { SessionIdSchema, SessionInfoSchema, TurnStateSchema } from './model';

const closed = { additionalProperties: false } as const;

export const SessionListLimits = { defaultLimit: 50, maxLimit: 100, scanBudget: 500 } as const;

export const SessionListArchivedSchema = Type.Union([
  Type.Literal('exclude'),
  Type.Literal('include'),
  Type.Literal('only'),
]);

/**
 * Selects Sessions; it never grants. `specId` and `standalone` are mutually exclusive and `taskId`
 * requires `specId`.
 */
export const SessionListFilterSchema = Type.Union([
  Type.Object({ archived: SessionListArchivedSchema }, closed),
  Type.Object(
    {
      specId: AssociationTargetIdSchema,
      taskId: Type.Optional(AssociationTargetIdSchema),
      archived: SessionListArchivedSchema,
    },
    closed,
  ),
  Type.Object({ standalone: Type.Literal(true), archived: SessionListArchivedSchema }, closed),
]);

/** Query of `GET /api/sessions`; the Runtime derives a {@link SessionListFilter} from it. */
export const SessionListQuerySchema = Type.Object(
  {
    specId: Type.Optional(AssociationTargetIdSchema),
    taskId: Type.Optional(AssociationTargetIdSchema),
    standalone: Type.Optional(Type.Literal(true)),
    archived: Type.Optional(SessionListArchivedSchema),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: SessionListLimits.maxLimit })),
    cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })),
  },
  closed,
);

/** A row's association, redacted unless the caller has `spec.view` at its `specId`. */
export const ListAssociationSchema = Type.Union([
  Type.Object({ kind: Type.Literal('standalone') }, closed),
  Type.Object(
    {
      kind: Type.Literal('specification'),
      specId: AssociationTargetIdSchema,
      taskIds: Type.Array(AssociationTargetIdSchema, { uniqueItems: true }),
    },
    closed,
  ),
  /** Associated, but the caller lacks `spec.view`: no identifiers. */
  Type.Object({ kind: Type.Literal('restricted') }, closed),
]);

export const SessionListItemSchema = Type.Object(
  {
    // A managed Session UUID or a demo catalogue Session id.
    sessionId: SessionReferenceIdSchema,
    title: Type.Optional(SessionInfoSchema.properties.title),
    providerId: SessionInfoSchema.properties.providerId,
    modelId: Type.Optional(SessionInfoSchema.properties.modelId),
    readiness: SessionInfoSchema.properties.readiness,
    activeTurn: Type.Optional(
      Type.Object({ turnId: SessionIdSchema, state: TurnStateSchema }, closed),
    ),
    archivedAt: Type.Optional(SessionInfoSchema.properties.archivedAt),
    createdAt: SessionInfoSchema.properties.createdAt,
    updatedAt: SessionInfoSchema.properties.updatedAt,
    association: ListAssociationSchema,
  },
  closed,
);

/** A page may hold fewer than `limit` items, even none, while `nextCursor` is present. */
export const SessionListPageSchema = Type.Object(
  {
    items: Type.Array(SessionListItemSchema, { maxItems: SessionListLimits.maxLimit }),
    nextCursor: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })),
  },
  closed,
);

export type SessionListArchived = Static<typeof SessionListArchivedSchema>;
export type SessionListFilter = Static<typeof SessionListFilterSchema>;
export type SessionListQuery = Static<typeof SessionListQuerySchema>;
export type ListAssociation = Static<typeof ListAssociationSchema>;
export type SessionListItem = Static<typeof SessionListItemSchema>;
export type SessionListPage = Static<typeof SessionListPageSchema>;
