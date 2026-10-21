import { Type, type Static } from 'typebox';

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

/** A read-only journal projection; never exposes filesystem paths or internal stages. */
export const CreateOperationInspectionSchema = Type.Union([
  Type.Object(
    {
      operationId: UuidSchema,
      kind: Type.Literal('specification-create'),
      status: Type.Union([Type.Literal('in-progress'), Type.Literal('recovery-required')]),
    },
    { additionalProperties: false },
  ),
  CreatedSpecSchema,
]);
export type CreateOperationInspection = Static<typeof CreateOperationInspectionSchema>;
