import { Type, type Static, type TSchema } from 'typebox';
import { CreateSessionResultSchema, CreateSessionSchema } from './commands';
import { SpecIdSchema, TaskIdSchema } from '../identifiers';
import { SessionIdSchema } from './model';

const closed = { additionalProperties: false } as const;

/** Engine Specification and Task identifiers (the same shape as the Specification read routes). */
export const AssociationTargetIdSchema = Type.String({
  minLength: 1,
  maxLength: 200,
  pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$',
});
export const SessionAssociationLimits = { taskIds: 32 } as const;
const TaskIdsSchema = Type.Array(TaskIdSchema, {
  maxItems: SessionAssociationLimits.taskIds,
  uniqueItems: true,
});

/** Provenance of an association, never authority. */
export const SessionAssociationOriginSchema = Type.Union([
  Type.Literal('user'),
  Type.Literal('workflow'),
]);

/** The home Specification of a Session and the Tasks of it the Session belongs to. */
export const SessionAssociationRefSchema = Type.Object(
  { specId: SpecIdSchema, taskIds: TaskIdsSchema },
  closed,
);

/** Body of `POST /api/specs/:specId/sessions`; `taskIds` must be members of `specId`. */
export const CreateContextSessionSchema = Type.Object(
  { ...CreateSessionSchema.properties, taskIds: Type.Optional(TaskIdsSchema) },
  closed,
);
/** `201` of `POST /api/specs/:specId/sessions`. */
export const CreateContextSessionResultSchema = Type.Object(
  { ...CreateSessionResultSchema.properties, association: SessionAssociationRefSchema },
  closed,
);

/**
 * Query of `GET /api/session-providers`: the start the catalogue is read for, which decides how it
 * is authorized. `specId` reads it for a Session started in that Specification, `sessionId` for
 * the composer of that Session, neither for a standalone Session of the project. At most one of
 * the two: the Runtime answers both together with `400 SESSION_INPUT_INVALID`.
 */
export const ProviderCatalogueQuerySchema = Type.Object(
  {
    specId: Type.Optional(SpecIdSchema),
    sessionId: Type.Optional(SessionIdSchema),
  },
  closed,
);

/** One referenced Engine object of an association, read at request time. */
export const AssociatedFactSchema = <T extends TSchema>(value: T) =>
  Type.Union([
    Type.Object({ state: Type.Literal('available'), value }, closed),
    /** The association exists; the referenced object is gone. */
    Type.Object({ state: Type.Literal('missing'), id: AssociationTargetIdSchema }, closed),
    /** The caller lacks `spec.view`: no id, no title. */
    Type.Object({ state: Type.Literal('forbidden') }, closed),
    /** The Engine source is unreadable. */
    Type.Object({ state: Type.Literal('unavailable') }, closed),
  ]);

const AssociatedSpecificationSchema = Type.Object(
  {
    specId: SpecIdSchema,
    key: Type.Optional(Type.String()),
    title: Type.String(),
    collection: Type.Union([Type.Literal('current'), Type.Literal('archived')]),
  },
  closed,
);
const AssociatedTaskSchema = Type.Object(
  { taskId: TaskIdSchema, key: Type.Optional(Type.String()), title: Type.String() },
  closed,
);

/** `200` of `GET /api/sessions/:sessionId/association`. */
export const SessionAssociationReadSchema = Type.Object(
  {
    sessionId: SessionIdSchema,
    association: Type.Union([
      Type.Object({ kind: Type.Literal('standalone') }, closed),
      Type.Object(
        {
          kind: Type.Literal('specification'),
          specification: AssociatedFactSchema(AssociatedSpecificationSchema),
          /** Empty when the Specification is forbidden. */
          tasks: Type.Array(AssociatedFactSchema(AssociatedTaskSchema)),
        },
        closed,
      ),
    ]),
  },
  closed,
);

export type SessionAssociationOrigin = Static<typeof SessionAssociationOriginSchema>;
export type SessionAssociationRef = Static<typeof SessionAssociationRefSchema>;
export type CreateContextSession = Static<typeof CreateContextSessionSchema>;
export type CreateContextSessionResult = Static<typeof CreateContextSessionResultSchema>;
export type SessionAssociationRead = Static<typeof SessionAssociationReadSchema>;
/** The start a client reads the provider catalogue for: one Specification, one Session or none. */
export type ProviderCatalogueContext =
  { readonly specId: string } | { readonly sessionId: string } | Record<string, never>;
export type AssociatedFact<T> =
  | { state: 'available'; value: T }
  | { state: 'missing'; id: string }
  | { state: 'forbidden' }
  | { state: 'unavailable' };
