import { Value } from 'typebox/value';
import { Type, type Static } from 'typebox';

import { SPEC_SLUG_MAX_LENGTH, SPEC_SLUG_PATTERN } from './slug';

const UuidSchema = Type.String({
  pattern:
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
});

export const ExistingSpecTargetSchema = Type.Object(
  { kind: Type.Literal('existing'), workspaceId: UuidSchema },
  { additionalProperties: false },
);
export const NewSpecWorktreeTargetSchema = Type.Object(
  {
    kind: Type.Literal('new-worktree'),
    baseRef: Type.Optional(Type.String({ minLength: 1 })),
    branch: Type.Optional(Type.String({ minLength: 1 })),
    integrationTargetWorkspaceId: Type.Optional(UuidSchema),
  },
  { additionalProperties: false },
);

export const CreateSpecRequestSchema = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 200 }),
    goal: Type.Optional(Type.String({ maxLength: 4000 })),
    /**
     * Optional slug override (lowercase kebab-case ASCII). Names the Spec folder, the generated
     * `feature/<slug>` branch and the worktree folder. Omitted: derived from the title.
     */
    slug: Type.Optional(
      Type.String({ minLength: 1, maxLength: SPEC_SLUG_MAX_LENGTH, pattern: SPEC_SLUG_PATTERN }),
    ),
    operationId: Type.Optional(UuidSchema),
    target: Type.Optional(Type.Union([ExistingSpecTargetSchema, NewSpecWorktreeTargetSchema])),
  },
  { additionalProperties: false },
);
export type CreateSpecRequest = Static<typeof CreateSpecRequestSchema>;

export const CreatedSpecSchema = Type.Object(
  {
    operationId: UuidSchema,
    specId: UuidSchema,
    kind: Type.Literal('specification-create'),
    status: Type.Literal('completed'),
    slug: Type.String(),
    workspaceId: UuidSchema,
    relativeManifestPath: Type.String(),
  },
  { additionalProperties: false },
);
export type CreatedSpec = Static<typeof CreatedSpecSchema>;

export const CreateSpecErrorSchema = Type.Object(
  { error: Type.String(), code: Type.String() },
  { additionalProperties: false },
);

/** Lookup key contains no caller-supplied workspace, file path or Spec selector. */
export const CreateOperationParamsSchema = Type.Object(
  { operationId: UuidSchema },
  { additionalProperties: false },
);

/**
 * `POST /api/specs` with `Prefer: respond-async` (RFC 7240): the operation is validated and
 * reserved, then answered with 202 and this body while the work continues detached. Poll the
 * inspection route named by `Location` (or watch its `/events` stream) for the outcome.
 */
export const CREATE_RESPOND_ASYNC_PREFERENCE = 'respond-async';
export const CreateOperationAcceptedSchema = Type.Object(
  {
    operationId: UuidSchema,
    kind: Type.Literal('specification-create'),
    status: Type.Literal('in-progress'),
  },
  { additionalProperties: false },
);
export type CreateOperationAccepted = Static<typeof CreateOperationAcceptedSchema>;

/** A read-only journal projection (plus a retained failure); never exposes filesystem paths or internal stages. */
export const CreateOperationInspectionSchema = Type.Union([
  Type.Object(
    {
      operationId: UuidSchema,
      kind: Type.Literal('specification-create'),
      status: Type.Union([Type.Literal('in-progress'), Type.Literal('recovery-required')]),
      /** Stable code when the cause is known (for example `OPERATION_INTERRUPTED` after a long idle). */
      code: Type.Optional(Type.String()),
    },
    { additionalProperties: false },
  ),
  /**
   * The operation failed after it was reserved and this Runtime observed it (retained for a short
   * time only; the journal itself has no failed state). `code` is the stable Create error code,
   * never server text or a path. Absence of this answer never proves success.
   */
  Type.Object(
    {
      operationId: UuidSchema,
      kind: Type.Literal('specification-create'),
      status: Type.Literal('failed'),
      code: Type.String(),
    },
    { additionalProperties: false },
  ),
  CreatedSpecSchema,
]);
export type CreateOperationInspection = Static<typeof CreateOperationInspectionSchema>;

/** Runtime check of an untrusted value (for example a stored request) against the request schema. */
export function isCreateSpecRequest(value: unknown): value is CreateSpecRequest {
  return Value.Check(CreateSpecRequestSchema, value);
}
