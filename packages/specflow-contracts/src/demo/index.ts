import { Type, type Static } from 'typebox';
import { ExistingSpecTargetSchema, NewSpecWorktreeTargetSchema } from '../specs/create';
import { CreateOptionsSchema } from '../specs/create-options';
import { SPEC_SLUG_MAX_LENGTH, SPEC_SLUG_PATTERN } from '../specs/slug';
const Id = Type.String({ minLength: 1, maxLength: 200, pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$' });
const Text = Type.String({ maxLength: 200000 });
export const DemoLocationSchema = Type.Object({
  kind: Type.Union([Type.Literal('current'), Type.Literal('simulated-worktree')]),
  path: Type.String(),
  branch: Type.String(),
  simulated: Type.Boolean(),
});
const Template = Type.Object({
  id: Id,
  title: Type.String(),
  filename: Type.String(),
  required: Type.Boolean(),
  content: Text,
});
const Archetype = Type.Object({
  id: Id,
  version: Type.String(),
  title: Type.String(),
  description: Type.String(),
  documents: Type.Array(Template),
  workflow: Type.Optional(
    Type.Object({
      phases: Type.Array(Type.String()),
      requiredDocuments: Type.Array(Type.String()),
      suggestedDocuments: Type.Array(Type.String()),
    }),
  ),
});
const Model = Type.Object({
  id: Id,
  title: Type.String(),
  efforts: Type.Array(Type.String()),
  modes: Type.Array(Type.String()),
});
const Provider = Type.Object({
  id: Id,
  title: Type.String(),
  mark: Type.Union([Type.Literal('codex'), Type.Literal('claude'), Type.Literal('neutral')]),
  version: Type.String(),
  access: Type.String(),
  connection: Type.Optional(
    Type.Union([Type.Literal('api'), Type.Literal('subscription'), Type.Literal('unknown')]),
  ),
  profile: Type.Optional(Type.String()),
  quota: Type.Optional(Type.Object({ state: Type.Literal('unknown') })),
  available: Type.Boolean(),
  reason: Type.Optional(Type.String()),
  models: Type.Array(Model),
});
export const DemoCatalogueSchema = Type.Object({
  revision: Type.String(),
  demo: Type.Literal(true),
  project: Type.Object({ id: Id, title: Type.String() }),
  currentLocation: DemoLocationSchema,
  archetypes: Type.Array(Archetype),
  providers: Type.Array(Provider),
  defaultArchetypeId: Type.Optional(Id),
});
export const DemoAddedDocumentSchema = Type.Object(
  {
    path: Type.String({ minLength: 1, maxLength: 500 }),
    title: Type.Optional(Type.String({ minLength: 1, maxLength: 240 })),
    content: Text,
  },
  { additionalProperties: false },
);
export const DemoDocumentsInputSchema = Type.Object(
  {
    requestId: Id,
    documents: Type.Array(DemoAddedDocumentSchema, { maxItems: 10 }),
    folders: Type.Optional(
      Type.Array(Type.String({ minLength: 1, maxLength: 500 }), {
        maxItems: 100,
        uniqueItems: true,
      }),
    ),
  },
  { additionalProperties: false },
);
export const DemoDocumentsResultSchema = Type.Object({
  documentIds: Type.Array(Id),
  folders: Type.Array(Type.String()),
});
export const DemoFolderInputSchema = Type.Object(
  { requestId: Id, path: Type.String({ minLength: 1, maxLength: 500 }) },
  { additionalProperties: false },
);
export const DemoFolderResultSchema = Type.Object({ folders: Type.Array(Type.String()) });
const Uuid = Type.String({
  pattern:
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
});
/**
 * The demo answers EXACTLY the real create contract: these are the real schemas, re-exported under
 * demo names, so the two can never drift (swapping to the real Engine changes no shape). See
 * `specs/create-options.ts` (`CreateOptionsSchema`, incl. the pinned `integrationDestination`
 * and the `integrationSelectable` rule) and `specs/create.ts` (the targets).
 */
export const DemoCreateOptionsSchema = CreateOptionsSchema;
export const DemoExistingTargetSchema = ExistingSpecTargetSchema;
/** Omitted fields mean "use the default". */
export const DemoNewWorktreeTargetSchema = NewSpecWorktreeTargetSchema;
/** Absent target = the main (primary) workspace. */
export const DemoCreateTargetSchema = Type.Union([
  DemoExistingTargetSchema,
  DemoNewWorktreeTargetSchema,
]);
/**
 * Create error codes (shape `{ error, code }` as in the real `CreateSpecErrorSchema`, where `error`
 * repeats the code). The first five are the REAL Engine codes with their real HTTP statuses:
 * `BRANCH_ALREADY_EXISTS` 409, `BASE_REF_NOT_FOUND` 422, `CREATE_CONFLICT` 409,
 * `CREATE_OPERATION_INVALID` 400, `CREATE_RECOVERY_REQUIRED` 503, plus the commit codes
 * `BRANCH_PROTECTED` 422, `COMMIT_BLOCKED` 409 and `COMMIT_FAILED` 503. The Engine reuses
 * `CREATE_OPERATION_INVALID` for an unusable integration target and for bad input alike.
 * Demo-only additions (no Engine counterpart): `DEMO_WORKSPACE_UNAVAILABLE` (409; the Engine
 * overloads `CREATE_RECOVERY_REQUIRED`/`REGISTRY_CONFLICT` for this) and `DEMO_INVALID_SCENARIO` (400).
 * A 403 answers `{ error: 'forbidden' }` without a code, like the real authorization handler.
 */
export const DemoCreateErrorCodeSchema = Type.Union([
  Type.Literal('BRANCH_ALREADY_EXISTS'),
  Type.Literal('BASE_REF_NOT_FOUND'),
  Type.Literal('CREATE_CONFLICT'),
  Type.Literal('CREATE_OPERATION_INVALID'),
  Type.Literal('CREATE_RECOVERY_REQUIRED'),
  Type.Literal('BRANCH_PROTECTED'),
  Type.Literal('COMMIT_BLOCKED'),
  Type.Literal('COMMIT_FAILED'),
  /** The project Git policy is invalid: every Create fails closed (503), nothing is created. */
  Type.Literal('GIT_POLICY_INVALID'),
  Type.Literal('DEMO_WORKSPACE_UNAVAILABLE'),
  Type.Literal('DEMO_INVALID_SCENARIO'),
]);
export const DemoCreateErrorSchema = Type.Object(
  { error: Type.String(), code: DemoCreateErrorCodeSchema },
  { additionalProperties: false },
);
export const DemoCreateInputSchema = Type.Object(
  {
    /** Idempotency key of the atomic create (the real `operationId`). */
    operationId: Uuid,
    /** Where the specification lives. Absent = main (primary) workspace. */
    target: Type.Optional(DemoCreateTargetSchema),
    title: Type.String({ minLength: 1, maxLength: 240 }),
    /** Mirror of the real `slug`: optional lowercase kebab-case override of the title-derived slug. */
    slug: Type.Optional(
      Type.String({ minLength: 1, maxLength: SPEC_SLUG_MAX_LENGTH, pattern: SPEC_SLUG_PATTERN }),
    ),
    catalogueRevision: Type.String(),
    archetypeId: Id,
    archetypeVersion: Type.String(),
    optionalDocumentIds: Type.Array(Id, { uniqueItems: true }),
    addedDocuments: Type.Optional(Type.Array(DemoAddedDocumentSchema, { maxItems: 10 })),
    folders: Type.Optional(
      Type.Array(Type.String({ minLength: 1, maxLength: 500 }), {
        maxItems: 100,
        uniqueItems: true,
      }),
    ),
  },
  { additionalProperties: false },
);
/** The real `CreatedSpec` plus the demo-only `documentIds` of the scaffolded documents. */
export const DemoCreateResultSchema = Type.Object({
  specId: Id,
  documentIds: Type.Array(Id),
  operationId: Uuid,
  kind: Type.Literal('specification-create'),
  status: Type.Literal('completed'),
  slug: Type.String(),
  workspaceId: Uuid,
  relativeManifestPath: Type.String(),
});
/** Demo-PROPOSED operation status read (not part of the real contract). */
export const DemoOperationStatusSchema = Type.Object(
  {
    operationId: Uuid,
    status: Type.Union([
      Type.Literal('completed'),
      Type.Literal('in-progress'),
      Type.Literal('recovery-required'),
      Type.Literal('not-started'),
      Type.Literal('failed'),
    ]),
    step: Type.Optional(Type.String()),
    workspaceId: Type.Optional(Uuid),
    branch: Type.Optional(Type.String()),
    updatedAt: Type.Optional(Type.String()),
    result: Type.Optional(DemoCreateResultSchema),
  },
  { additionalProperties: false },
);
export const DemoSessionInputSchema = Type.Object(
  {
    requestId: Id,
    catalogueRevision: Type.String(),
    providerId: Id,
    modelId: Id,
    effort: Type.Optional(Type.String()),
    mode: Type.String(),
  },
  { additionalProperties: false },
);
export const DemoSessionResultSchema = Type.Object({ sessionId: Id, location: DemoLocationSchema });
export const DemoSessionDetailSchema = Type.Object({
  sessionId: Id,
  specId: Id,
  title: Type.String(),
  configuration: Type.Object({
    providerId: Id,
    providerTitle: Type.String(),
    modelId: Id,
    modelTitle: Type.String(),
    effort: Type.Optional(Type.String()),
    mode: Type.String(),
    profile: Type.String(),
  }),
  location: DemoLocationSchema,
  context: Type.Object({
    project: Type.String(),
    specification: Type.String(),
    archetype: Type.String(),
    documents: Type.Array(Type.String()),
    instructions: Type.Array(Type.String()),
  }),
});
export const DemoSaveInputSchema = Type.Object(
  { content: Text, expectedRevision: Type.String() },
  { additionalProperties: false },
);
export const DemoSaveResultSchema = Type.Object({ revision: Type.String() });
export const DemoErrorSchema = Type.Object({
  error: Type.Union([
    Type.Literal('demo_specification_creation_failed'),
    Type.Literal('demo_session_allocation_failed'),
    Type.Literal('demo_document_save_failed'),
    Type.Literal('demo_document_required'),
    Type.Literal('demo_document_operations_unavailable'),
    Type.Literal('demo_document_path_conflict'),
    Type.Literal('demo_catalogue_stale'),
    Type.Literal('demo_document_revision_conflict'),
    Type.Literal('demo_request_conflict'),
    Type.Literal('demo_invalid_selection'),
    Type.Literal('demo_session_detail_unavailable'),
    Type.Literal('demo_create_options_unavailable'),
    Type.Literal('specification_not_found'),
    Type.Literal('specification_document_not_found'),
    Type.Literal('session_not_found'),
  ]),
});
export type DemoCatalogue = Static<typeof DemoCatalogueSchema>;
/** Create body keyed by `operationId` with the optional `target` (the real create request shape). */
export type DemoCreateRequest = Static<typeof DemoCreateInputSchema>;
/** Full create response (the real `CreatedSpec` + `documentIds`). */
export type DemoCreatedSpec = Static<typeof DemoCreateResultSchema>;
export type DemoCreateOptions = Static<typeof DemoCreateOptionsSchema>;
export type DemoCreateTarget = Static<typeof DemoCreateTargetSchema>;
export type DemoExistingTarget = Static<typeof DemoExistingTargetSchema>;
export type DemoNewWorktreeTarget = Static<typeof DemoNewWorktreeTargetSchema>;
export type DemoCreateErrorCode = Static<typeof DemoCreateErrorCodeSchema>;
export type DemoCreateError = Static<typeof DemoCreateErrorSchema>;
export type DemoOperationStatus = Static<typeof DemoOperationStatusSchema>;
export type DemoSessionInput = Static<typeof DemoSessionInputSchema>;
export type DemoSessionDetail = Static<typeof DemoSessionDetailSchema>;
export type DemoSessionResult = Static<typeof DemoSessionResultSchema>;
export type DemoLocation = Static<typeof DemoLocationSchema>;
export type DemoSaveInput = Static<typeof DemoSaveInputSchema>;
export type DemoError = Static<typeof DemoErrorSchema>;

export type DemoAddedDocument = Static<typeof DemoAddedDocumentSchema>;
export type DemoDocumentsInput = Static<typeof DemoDocumentsInputSchema>;
export type DemoDocumentsResult = Static<typeof DemoDocumentsResultSchema>;
export type DemoFolderInput = Static<typeof DemoFolderInputSchema>;

const DemoActionSchema = Type.Object({
  available: Type.Boolean(),
  reason: Type.Optional(Type.String()),
});
const DemoDocumentActionsSchema = Type.Object({
  rename: DemoActionSchema,
  move: DemoActionSchema,
  delete: DemoActionSchema,
});
export const DemoDocumentTreeSchema = Type.Object({
  revision: Type.String(),
  folders: Type.Array(Type.Object({ path: Type.String(), actions: DemoDocumentActionsSchema })),
  documents: Type.Array(
    Type.Object({
      id: Id,
      path: Type.String(),
      required: Type.Optional(Type.Boolean()),
      revision: Type.String(),
      actions: DemoDocumentActionsSchema,
    }),
  ),
  capabilities: Type.Object({
    createFile: DemoActionSchema,
    createFolder: DemoActionSchema,
    import: DemoActionSchema,
    formats: Type.Array(Type.String()),
  }),
});
export const DemoDocumentOperationInputSchema = Type.Object(
  {
    requestId: Id,
    action: Type.Union([Type.Literal('rename'), Type.Literal('move'), Type.Literal('delete')]),
    kind: Type.Union([Type.Literal('document'), Type.Literal('folder')]),
    documentId: Type.Optional(Id),
    path: Type.Optional(Type.String({ maxLength: 500 })),
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 240 })),
    targetFolder: Type.Optional(Type.String({ maxLength: 500 })),
    expectedRevision: Type.String(),
  },
  { additionalProperties: false },
);
export const DemoDocumentOperationResultSchema = Type.Object({
  revision: Type.String(),
  documents: Type.Array(Type.Object({ id: Id, path: Type.String(), revision: Type.String() })),
  removedDocumentIds: Type.Array(Id),
  folders: Type.Array(Type.String()),
});
export type DemoDocumentTree = Static<typeof DemoDocumentTreeSchema>;
export type DemoDocumentOperationInput = Static<typeof DemoDocumentOperationInputSchema>;
export type DemoDocumentOperationResult = Static<typeof DemoDocumentOperationResultSchema>;
