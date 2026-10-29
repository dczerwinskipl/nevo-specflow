import { Type, type Static } from 'typebox';
import {
  ArchetypeCatalogueSchema,
  CreateDocumentsInputSchema,
  DocumentContentSchema,
  DocumentErrorSchema,
  DocumentOperationInputSchema,
  DocumentOperationResultSchema,
  DocumentTreeSchema,
  RegisteredDocumentIdSchema,
  SaveInputSchema,
  SaveResultSchema,
  UuidSchema,
} from '../documents';
import {
  CreateSpecRequestSchema,
  CreatedSpecSchema,
  ExistingSpecTargetSchema,
  NewSpecWorktreeTargetSchema,
} from '../specs/create';
import { CreateOptionsSchema } from '../specs/create-options';
const Id = Type.String({ minLength: 1, maxLength: 200, pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$' });
export const DemoLocationSchema = Type.Object({
  kind: Type.Union([Type.Literal('current'), Type.Literal('simulated-worktree')]),
  path: Type.String(),
  branch: Type.String(),
  simulated: Type.Boolean(),
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
/**
 * The demo archetype catalogue IS the real `ArchetypeCatalogue` (`GET /api/specs/archetypes`),
 * re-exported under a demo name so the two can never drift.
 */
export const DemoArchetypeCatalogueSchema = ArchetypeCatalogueSchema;
/**
 * `GET /api/demo/specification-creation`: the real `ArchetypeCatalogue` fields (same property
 * schemas) plus the demo-only part: `demo`, the project, the simulated location and the providers.
 * `revision` is the archetype catalogue revision; Create and Session allocation check it.
 */
export const DemoCatalogueSchema = Type.Object(
  {
    ...ArchetypeCatalogueSchema.properties,
    demo: Type.Literal(true),
    project: Type.Object({ id: Id, title: Type.String() }),
    currentLocation: DemoLocationSchema,
    providers: Type.Array(Provider),
  },
  { additionalProperties: false },
);
const Uuid = UuidSchema;
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
 * repeats the code). The REAL Engine codes keep their real HTTP statuses:
 * `BRANCH_ALREADY_EXISTS` 409, `BASE_REF_NOT_FOUND` 422, `CREATE_CONFLICT` 409,
 * `CREATE_OPERATION_INVALID` 400, `CREATE_RECOVERY_REQUIRED` 503, the commit codes
 * `BRANCH_PROTECTED` 422, `COMMIT_BLOCKED` 409 and `COMMIT_FAILED` 503, and the archetype admission
 * codes `CATALOGUE_STALE` 409, `ARCHETYPE_UNKNOWN` 422, `DOCUMENT_PATH_INVALID` 400,
 * `DOCUMENT_PATH_CONFLICT` 409 and `DOCUMENT_OPERATION_INVALID` 400 (limits, an added document type
 * that cannot be registered). The Engine reuses `CREATE_OPERATION_INVALID` for an unusable
 * integration target and for bad input alike.
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
  Type.Literal('CATALOGUE_STALE'),
  Type.Literal('ARCHETYPE_UNKNOWN'),
  Type.Literal('DOCUMENT_PATH_INVALID'),
  Type.Literal('DOCUMENT_PATH_CONFLICT'),
  Type.Literal('DOCUMENT_OPERATION_INVALID'),
  Type.Literal('DEMO_WORKSPACE_UNAVAILABLE'),
  Type.Literal('DEMO_INVALID_SCENARIO'),
]);
export const DemoCreateErrorSchema = Type.Object(
  { error: Type.String(), code: DemoCreateErrorCodeSchema },
  { additionalProperties: false },
);
/**
 * The real `CreateSpecRequest` (same property schemas: target, slug, archetype selection, added
 * documents, folders) with one demo restriction: `operationId` is required, because the demo keys
 * its idempotent create on it.
 */
export const DemoCreateInputSchema = Type.Object(
  { ...CreateSpecRequestSchema.properties, operationId: Uuid },
  { additionalProperties: false },
);
/**
 * The real `CreatedSpec` (including `documentIds`, the registered ids in manifest order) except that
 * a demo `specId` is a demo id (`demo-...`), not a UUID.
 */
export const DemoCreateResultSchema = Type.Object(
  {
    ...CreatedSpecSchema.properties,
    specId: Id,
    documentIds: Type.Array(RegisteredDocumentIdSchema),
  },
  { additionalProperties: false },
);
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
/**
 * Demo errors outside the documents layer (Session allocation, demo options, catalogue lookups).
 * Every document endpoint answers the real `DocumentErrorSchema` (`{ error, code, details? }`).
 */
export const DemoErrorSchema = Type.Object({
  error: Type.Union([
    Type.Literal('demo_specification_creation_failed'),
    Type.Literal('demo_session_allocation_failed'),
    Type.Literal('demo_catalogue_stale'),
    Type.Literal('demo_request_conflict'),
    Type.Literal('demo_invalid_selection'),
    Type.Literal('demo_session_detail_unavailable'),
    Type.Literal('demo_create_options_unavailable'),
    Type.Literal('specification_not_found'),
    Type.Literal('session_not_found'),
  ]),
});

/*
 * Documents. The demo answers EXACTLY the real documents contract (`../documents`): the schemas
 * below are the real ones re-exported under demo names. The reads are the real routes
 * (`/api/specs/:specId/document-tree`, `/documents/:documentId`, `/raw`) served from the demo data;
 * the writes, which the real backend does not serve yet, are emulated under `/api/demo/specs/...`
 * with the operation shapes of the contract.
 */
export const DemoDocumentTreeSchema = DocumentTreeSchema;
export const DemoDocumentContentSchema = DocumentContentSchema;
export const DemoDocumentErrorSchema = DocumentErrorSchema;
/** `PUT /api/demo/specs/:specId/documents/:documentId`. */
export const DemoSaveInputSchema = SaveInputSchema;
export const DemoSaveResultSchema = SaveResultSchema;
/** `POST /api/demo/specs/:specId/document-operations` (rename, move, delete, classify). */
export const DemoDocumentOperationInputSchema = DocumentOperationInputSchema;
export const DemoDocumentOperationResultSchema = DocumentOperationResultSchema;
/**
 * `POST /api/demo/specs/:specId/documents`. The contract names no result for this route; the demo
 * answers the operation result (`documents` holds the created documents).
 */
export const DemoCreateDocumentsInputSchema = CreateDocumentsInputSchema;
/**
 * `POST /api/demo/specs/:specId/folders`. The contract names the route but no body; this demo-only
 * body follows the operation shape. The answer is the operation result.
 */
export const DemoFolderInputSchema = Type.Object(
  { operationId: Uuid, path: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);

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
export type DemoError = Static<typeof DemoErrorSchema>;
export type DemoFolderInput = Static<typeof DemoFolderInputSchema>;
