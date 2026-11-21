import { Type, type Static } from 'typebox';

import {
  CreateDocumentEntrySchema,
  DocumentOperationResultSchema,
  SaveResultSchema,
} from '../documents/operations';
import { CatalogueIdSchema, IdSchema } from '../documents/vocabulary';

/**
 * The agent broker (D11): the Runtime's per-user local endpoint through which the product CLI of a
 * running agent Turn sends its Engine writes. It is not HTTP: one connection carries one request
 * frame and one response frame, each a single line of UTF-8 JSON ended by `\n`.
 *
 * The Runtime hands both values to the provider process in its environment; a CLI that finds
 * {@link AGENT_BROKER_ENVIRONMENT.capability} MUST send its writes here and never open the Engine
 * for writing. The broker takes the actor, the claim, the Session, the Turn, the workspace and the
 * scope from the capability alone: a request that names any of them is refused, not ignored.
 */
export const AGENT_BROKER_PROTOCOL = 1;

/** The provider environment entries of a write Turn. */
export const AGENT_BROKER_ENVIRONMENT = {
  /** The endpoint: a Windows named pipe (`\\.\pipe\...`) or a Unix domain socket path. */
  endpoint: 'NEVO_AGENT_BROKER',
  /** The invocation capability, a bearer secret of the Turn. Never print or log it. */
  capability: 'NEVO_AGENT_CAPABILITY',
} as const;

/**
 * A capability value: this prefix and 256 random bits (43 base64url characters). The prefix lets
 * every Runtime sink redact a capability it did not mint itself.
 */
export const AGENT_CAPABILITY_PREFIX = 'nvcap_';
const CAPABILITY_SHAPE = /nvcap_[A-Za-z0-9_-]{43}/g;
export const AGENT_CAPABILITY_REDACTED = '[redacted agent capability]';

/** `text` with anything shaped like an agent capability replaced. */
export function redactAgentCapabilityShapes(text: string): string {
  return text.replace(CAPABILITY_SHAPE, AGENT_CAPABILITY_REDACTED);
}

/** Frame bounds. A request above `requestBytes` is refused unread (`AGENT_REQUEST_INVALID`). */
export const AGENT_BROKER_LIMITS = {
  /** Above the 1 MiB content cap of a document, with room for JSON escaping. */
  requestBytes: 2 * 1024 * 1024,
  responseBytes: 1024 * 1024,
} as const;

/**
 * Agent operations the broker knows. The scope of a Turn admits a subset: an ad-hoc Turn (D11b)
 * the documents of its home Specification; the attempt scope adds Task drafts and the finish
 * proposal. `scope.describe` is always admitted and answers the Turn's scope.
 */
export const AGENT_BROKER_OPERATIONS = [
  'scope.describe',
  'documents.create',
  'documents.save',
  'documents.classify',
] as const;
export type AgentBrokerOperationName = (typeof AGENT_BROKER_OPERATIONS)[number];

/** A client-chosen id of the request; the broker derives the Engine operation id from it and the invocation. */
export const AgentBrokerRequestIdSchema = Type.String({
  minLength: 8,
  maxLength: 128,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$',
});

const SpecIdSchema = Type.String({ minLength: 1, maxLength: 128 });

export const AgentBrokerOperationSchema = Type.Union([
  Type.Object({ name: Type.Literal('scope.describe') }, { additionalProperties: false }),
  Type.Object(
    {
      name: Type.Literal('documents.create'),
      specId: SpecIdSchema,
      documents: Type.Array(CreateDocumentEntrySchema, { minItems: 1 }),
      folders: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
      catalogueRevision: Type.Optional(Type.String({ minLength: 1 })),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      name: Type.Literal('documents.save'),
      specId: SpecIdSchema,
      documentId: IdSchema,
      content: Type.String(),
      expectedRevision: Type.String({ minLength: 1 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      name: Type.Literal('documents.classify'),
      specId: SpecIdSchema,
      documentId: IdSchema,
      type: CatalogueIdSchema,
      expectedRevision: Type.String({ minLength: 1 }),
    },
    { additionalProperties: false },
  ),
]);
export type AgentBrokerOperation = Static<typeof AgentBrokerOperationSchema>;

export const AgentBrokerRequestSchema = Type.Object(
  {
    protocol: Type.Literal(AGENT_BROKER_PROTOCOL),
    capability: Type.String({ minLength: 1, maxLength: 512 }),
    requestId: AgentBrokerRequestIdSchema,
    operation: AgentBrokerOperationSchema,
  },
  { additionalProperties: false },
);
export type AgentBrokerRequest = Static<typeof AgentBrokerRequestSchema>;

/** The scope of the Turn, as `scope.describe` answers it (for the brief and the CLI's refusals). */
export const AgentBrokerScopeSchema = Type.Object(
  {
    /** `ad-hoc`: a Turn without an agent attempt (D11b). The attempt scope joins later. */
    kind: Type.Literal('ad-hoc'),
    specId: SpecIdSchema,
    operations: Type.Array(
      Type.Union([
        Type.Literal('scope.describe'),
        Type.Literal('documents.create'),
        Type.Literal('documents.save'),
        Type.Literal('documents.classify'),
      ]),
    ),
  },
  { additionalProperties: false },
);
export type AgentBrokerScope = Static<typeof AgentBrokerScopeSchema>;

/**
 * Broker refusals. Engine refusals of an admitted operation keep their own code (`SPEC_BUSY`,
 * `DOCUMENT_REVISION_CONFLICT`, ...) and details.
 *
 * - `AGENT_REQUEST_INVALID`: not a request of this protocol (frame, JSON, shape, size).
 * - `AGENT_REQUEST_REFUSED`: the request names what only the broker decides (an actor, a claim, an
 *   owner, `ignoreClaims`, an operation, invocation, Session or Turn id, a workspace or scope).
 * - `AGENT_CAPABILITY_INVALID`: no capability, not one of this Runtime's, or its Turn is not running
 *   (not dispatched yet, ended, or another invocation's).
 * - `AGENT_SCOPE_REFUSED`: the operation or its subject is outside the Turn's scope.
 * - `AGENT_BROKER_UNAVAILABLE`: the broker could not run the operation (internal failure).
 */
export const AGENT_BROKER_ERROR_CODES = [
  'AGENT_REQUEST_INVALID',
  'AGENT_REQUEST_REFUSED',
  'AGENT_CAPABILITY_INVALID',
  'AGENT_SCOPE_REFUSED',
  'AGENT_BROKER_UNAVAILABLE',
] as const;
export type AgentBrokerErrorCode = (typeof AGENT_BROKER_ERROR_CODES)[number];

export const AgentBrokerErrorSchema = Type.Object(
  {
    /** One of {@link AGENT_BROKER_ERROR_CODES}, or the Engine's document error code. */
    code: Type.String({ minLength: 1 }),
    /** What the agent can do about it; never carries the capability or an absolute path. */
    message: Type.String(),
    details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);
export type AgentBrokerError = Static<typeof AgentBrokerErrorSchema>;

export const AgentBrokerResultSchema = Type.Union([
  Type.Object(
    { operation: Type.Literal('scope.describe'), scope: AgentBrokerScopeSchema },
    { additionalProperties: false },
  ),
  Type.Object(
    { operation: Type.Literal('documents.save'), result: SaveResultSchema },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      operation: Type.Union([Type.Literal('documents.create'), Type.Literal('documents.classify')]),
      result: DocumentOperationResultSchema,
    },
    { additionalProperties: false },
  ),
]);
export type AgentBrokerResult = Static<typeof AgentBrokerResultSchema>;

export const AgentBrokerResponseSchema = Type.Union([
  Type.Object(
    { ok: Type.Literal(true), value: AgentBrokerResultSchema },
    { additionalProperties: false },
  ),
  Type.Object(
    { ok: Type.Literal(false), error: AgentBrokerErrorSchema },
    { additionalProperties: false },
  ),
]);
export type AgentBrokerResponse = Static<typeof AgentBrokerResponseSchema>;
