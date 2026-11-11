---
id: reference.api.openapi
type: reference
title: Runtime OpenAPI document
status: current
scope: specflow
areas: [runtime, server, security, docs]
tags: [openapi, fastify, typebox, generated]
read_when:
  - reading or importing the Runtime HTTP API description
  - changing a Runtime route schema and regenerating the committed OpenAPI document
  - the `pnpm api:openapi --check` drift check fails
summary: >
  Runtime serves an OpenAPI 3.1 document of its HTTP API at GET /api/openapi.json, generated from
  the TypeBox route schemas; a committed copy of the project-mode surface lives in
  docs/reference/api/openapi.generated.json and is regenerated with pnpm api:openapi.
related:
  - architecture.runtime.endpoint-policy
  - architecture.runtime.authorization
  - engineering.repository.ci
---

# Runtime OpenAPI document

Runtime derives an OpenAPI 3.1 document from the route schemas it already registers (TypeBox, via
`@fastify/swagger`). No part of the document is written by hand: a route appears with the
parameters, request body and responses its schema declares.

The generation lives in `packages/specflow-runtime/src/server/openapi/`: `register.ts` (Swagger
registration and the registration checks), `transform.ts` (the per-route schema transform),
`responses.ts`, `parameters.ts`, `security.ts`, `tags.ts`, `operations.ts` (paths and operation
ids), `components.ts`, `request-error-guard.ts`, `document-route.ts` and `config.ts` (the route
`config` it reads); `index.ts` is its public entry. Shared contracts and identifiers are registered
in `src/server/shared-contracts.ts`.

## Served document

```http
GET /api/openapi.json
```

- **Content:** the document of the running Runtime. It lists only HTTP API routes (`/api/...`); web
  application routes, the `/` fallback and the demo seams under `/api/demo/` are hidden. The routes
  of the authentication providers appear only when that provider is enabled in the running
  configuration.
- **Access:** an ordinary Runtime read. It requires an authenticated principal, or the trusted local
  identity in trusted local mode (`authentication.mode: none`); an unauthenticated request under
  required authentication gets the same `401` as other reads. No dedicated capability is needed.
- **Admission and caching:** the shared default rate limit of the
  [endpoint policy](../../architecture/runtime/endpoint-policy.md) and `Cache-Control: no-store`.
- **Format:** JSON only. Runtime ships no interactive viewer; open the URL or the committed file in
  an external tool that supports OpenAPI 3.1 (see [Viewers](#viewers)).

`info.version` is fixed at `0.0.0`: the document describes the API of the Runtime that serves it and
does not carry the product version.

## Viewers

The document is OpenAPI **3.1**; a viewer must support 3.1 (JSON Schema 2020-12 keywords such as
`type: 'null'` and `const`).

| Viewer                                         | Result                                                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Swagger UI 5 (`swagger-ui-dist` 5.34)          | Works: operations grouped by tag with summaries, parameters, bodies, responses with headers, components under Schemas, `Authorize` for the session cookie.                |
| Scalar API Reference (1.77)                    | Works: the same groups in the sidebar, operations with their responses and models, the session cookie in the request examples.                                            |
| Classic Swagger Editor 4 (`editor.swagger.io`) | Does not work: it validates against the OpenAPI **3.0** schema and lists structural errors (`openapi` must match `3.0.x`, `null` is not a 3.0 type) instead of a preview. |

Use Swagger UI, Scalar or another 3.1 viewer. The next-generation Swagger Editor
(`editor-next.swagger.io`) supports 3.1 but was not part of the check. The results come from a
one-off local render of the committed file in headless Chromium; there is no automated viewer test.

## Shared contracts

A response contract of `@nevo/specflow-contracts` that more than one operation answers, or that one
operation answers and another product surface emits too, is one component under
`components.schemas`, and every response that answers it is a `$ref` to that component. For
example `GET /api/auth/session` and `POST /api/auth/password/login` both answer `200` with
`{ "$ref": "#/components/schemas/AuthSessionResponse" }`.

It works with the Fastify shared-schema mechanism, without a second copy of any schema:

- **Identity:** the contract carries a stable `$id` in the contracts package, equal to its type name
  without the `Schema` suffix (`AuthSessionResponseSchema` has `$id: 'AuthSessionResponse'`). The
  contracts package has no Fastify or Swagger dependency; the `$id` is plain JSON Schema.
- **Registration:** `src/server/shared-contracts.ts` lists the shared contracts and registers them
  with `addSchema` on the root instance before any route, so every encapsulated plugin sees them.
  Registering an `$id` twice fails at startup (Fastify `FST_ERR_SCH_ALREADY_PRESENT`).
- **Reference:** a route answers `contractRef(XSchema)`, a `{ "$ref": "<$id>" }` schema typed with
  the contract's static type, so handler reply types stay those of the contract. Validation and
  serialization resolve the reference to the registered definition. `contractRef` throws for a
  contract that is not in the list, and a composition that registers a referencing route without
  the shared contracts fails at startup, because the reference cannot be resolved.
- **Component name:** `@fastify/swagger` names the component with `refResolver.buildLocalReference`;
  Runtime returns the `$id` (the default would be a positional `def-N`) and refuses an `$id` that is
  not a valid component name.

Current shared contracts: `AuthSessionResponse`, `AuthenticationRequiredErrorResponse`,
`AuthorizationForbiddenErrorResponse`, `CloseError`, `ClosePreview`, `CloseResult`,
`CloseWorkspaceResult`, `CreateSpecError`, `DocsSearchResult` and `DocsStatus` (also the output of
`nevo-specflow docs search --json` and `docs semantic status --json`), `DocumentError`,
`DocumentOperationResult`, `DocumentOperationStatus`, `OperationListResponse`,
`RateLimitedErrorResponse`, `RequestErrorResponse`, `SessionCommandResult`, `SessionError`,
`SpecificationReadError`, `TaskReadError` and `TaskSnapshotExpired`.

A test that registers Runtime routes on a bare Fastify instance (without `createRuntimeApp`) creates
it with `routeTestApp()` from `test/support/route-app.ts`, which registers the shared contracts that
route schemas reference.

Schemas stay inline when they are not one shared response contract:

- a contract answered by one operation only and emitted by no other surface, even under several
  status codes (for example `PasswordLoginErrorResponse` for `401`, `429` and `503` of password
  login);
- separate contracts that only have the same shape: `StartTurnResult` and `CancelTurnResult` are
  both `{ turnId }`, `CloseError` and `CreateSpecError` differ only by `remedy`, and they keep their
  own schemas;
- request bodies, path and query parameters: their validation keeps its inline schema;
- schemas that are not contracts of `@nevo/specflow-contracts` (such as the operation list error of
  the Runtime operations feature).

Structural equality alone never makes a component; a new shared contract gets an `$id` in the
contracts package and an entry in the shared-contract list.

## Shared identifiers

Domain identifiers that several operations use are components too, and every use in a route schema
is a `$ref` to them:

| Component                                                     | Contract (`@nevo/specflow-contracts`)                                                                  | Format                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `SessionId`, `TurnId`, `WorkId`, `ContentId`, `InteractionId` | `SessionIdSchema`, `TurnIdSchema`, `WorkIdSchema`, `ContentIdSchema`, `InteractionIdSchema` (sessions) | lowercase UUID                                   |
| `OperationId`                                                 | `OperationIdSchema` (operations)                                                                       | RFC 4122 UUID (version 1-8), any case            |
| `WorkspaceId`                                                 | `WorkspaceIdSchema` (`src/identifiers.ts`)                                                             | RFC 4122 UUID (version 1-8), any case            |
| `SpecId`, `TaskId`                                            | `SpecIdSchema`, `TaskIdSchema` (`src/identifiers.ts`)                                                  | `^[a-zA-Z0-9][a-zA-Z0-9._-]*$`, 1-200 characters |

How it works:

- **Identity:** an identifier is used inline in many schemas (path and query parameters, bodies and
  other contracts), so it cannot carry an `$id`: a request schema with two uses would resolve the
  same `$id` twice, which Ajv refuses (`reference "SessionId" resolves to more than one schema`).
  The contract carries its name as the JSON Schema annotation `title` instead. Validation,
  serialization and route types keep using the inline schema, unchanged.
- **Registration:** `src/server/shared-contracts.ts` lists the identifiers and registers each with
  `addSchema` under its `title` as `$id`, so `@fastify/swagger` emits it once under
  `components.schemas`.
- **Reference:** the Swagger `transform` replaces every subschema whose `title` names an identifier
  with a reference to it (`referenceSharedIdentifiers`); only the document reads that copy. A
  subschema with such a `title` and another definition fails the generation: one name, one
  definition.
- **Inside shared contracts:** a shared object contract is emitted from the registered contract
  itself, after the route `transform`. The Swagger `transformObject` applies the same replacement
  to `components.schemas` of the finished document (`referenceIdentifiersInComponents`), except to
  an identifier's own component, which stays its definition: `SessionCommandResult` references
  `SessionId`, `SessionError` references `TurnId`. The registered contracts keep their inline
  identifiers, so validation and serialization do not change.

Only a schema that is the identifier becomes a reference, never one that merely has the same
pattern. The two UUID formats are different contracts (lowercase without a version check, against
RFC 4122 with version 1-8 in any case); they stay separate and neither is `format: uuid`. Fields of
these formats that are not one of the identifiers keep their inline schema: the `requestId` of a
Session command, ToolAction and conversation entry ids (`SessionUuidSchema`), the Specification ids
of Create and close (an RFC 4122 UUID, stricter than `SpecId`), document ids and the other ids of
the generic id pattern.

## Groups and summaries

Every operation belongs to exactly one group (`tags`) and has a short `summary`, both declared in
the route schema by the feature that owns the route:

```ts
schema: {
  tags: ['Sessions'],
  summary: 'Cancel a Turn',
  body: CancelTurnSchema,
}
```

The groups and their descriptions are `OPENAPI_TAGS` in `src/server/openapi/tags.ts`; the document lists
them in this order as its top-level `tags`: Authentication, Authorization, Sessions, Session
Providers, Session Telemetry, Specifications, Documents, Tasks, Operations, Workspaces,
Documentation and Runtime. A documented route (under `/api/`, not a demo seam) without exactly one
known group or without a non-empty `summary` is refused when it is registered, so no operation
reaches the document without them; the OpenAPI test also checks every operation of the canonical
document. A group is never derived from the URL: document and Task operations live under
`/api/specs/` too.

Operations holds the cross-feature operation lists, the operation progress stream and the status of
a Specification creation (the shared list and stream mechanisms declare the group, the feature
gives the summary). The status of a close or document operation stays with its feature
(Specifications, Workspaces, Documents). Workspaces holds closing a linked worktree and closing a
whole workspace. Documentation holds the search and the semantic search status of the project's
own documentation (`/api/docs/`); Documents are the documents of a Specification.

## Shared error responses

Some refusals come from shared Runtime mechanisms, not from the route. The Swagger `transform`
documents them for every operation that documents its responses and does not document that status
code itself:

| Status | Added to                                                                                            | Body (component)                                                           | Source                                                                     |
| ------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `401`  | operations with `security` (required authentication, not `openApiPublic`)                           | `AuthenticationRequiredErrorResponse`                                      | `request.authz` without a principal, answered by the Runtime error handler |
| `429`  | every operation without a rate limit of its own (no route sets `rateLimit: false`)                  | `RateLimitedErrorResponse`, with `Retry-After` and `x-ratelimit-*` headers | the default rate limit of the endpoint policy                              |
| `400`  | operations with a request schema (path, query, headers or body), outside the Session error handling | `RequestErrorResponse`                                                     | Fastify request validation, answered by the Runtime error handler          |

The transform never adds `403`: whether an operation can refuse a capability is the route's own
knowledge. A route whose authorization can deny documents `403` with
`AuthorizationForbiddenErrorResponse` in its response schema. Every Session route does (the
capability checks of the Session or of the start), as the Specification, document, Task, close,
operation and documentation search routes already did. `GET /api/openapi.json` and `POST /api/authorization/capabilities`
only require a principal and never answer `403`. In trusted local mode no operation has `security`,
so none has the `401`.

`RateLimitedErrorResponse` is `{ "error": "rate_limited" }`, with `statusCode: 429` from the
limiter's error on a route without a `429` schema of its own. Routes with a stricter limit of their
own (password login, OIDC start) and routes with their own `429` (Session telemetry refresh, the
operation progress stream, the Session event stream) keep their own `429`; every other route,
logout and the OIDC callback included, is under the default limit only.

A request that does not match its route schema fails Fastify validation, and the Runtime error
handler answers the error as it is: Fastify's error body, the shared contract
`RequestErrorResponse` (`{ "statusCode": 400, "code": "FST_ERR_VALIDATION", "error": "Bad Request",
"message": "..." }`). The `400` names `FST_ERR_VALIDATION`; for a route with a JSON body also the
malformed and empty body errors (`FST_ERR_CTP_INVALID_JSON_BODY`, `FST_ERR_CTP_EMPTY_JSON_BODY`),
which have the same body. Two kinds of routes do not get it:

- **Session and Session association routes:** the Session error handling answers their validation
  failures as `400 SESSION_INPUT_INVALID` (next section). It marks every route of its context with
  the route `config` `openApiOwnValidation: true` (an `onRoute` hook), which the transform reads, so
  this holds in every data mode.
- **Routes with a `400` schema of their own** (Create, close and the operation lists): Fastify
  serializes the validation error through that schema, so the body is that contract, for example
  `{ "error": "Bad Request", "code": "FST_ERR_VALIDATION" }` for `CloseError`, and the route's own
  `400` documents it. Unless the route describes its `400` itself, the transform describes it as
  also answering a failed validation (and, with a body, JSON parsing) in that shape, with `error`
  `Bad Request` and the `FST_ERR_*` code. A `400` schema whose `error` is an enum would refuse that
  body and turn the answer into `500 FST_ERR_FAILED_ERROR_SERIALIZATION`; such a schema is a union
  with `RequestErrorResponse` instead (the OIDC start: `invalid_return_to` or the request error).
  The contract is not closed, because the serializer matches the error object itself, which has
  more fields (`validation`); only the four declared fields are written. The Runtime refuses to
  start (`onReady`, when every route and its final `config` are known) with a documented route
  whose own `400` schema cannot serialize the request error: one that is not an object
  (`Type.Null()`, a string), an object without an `error` field (`Type.Object({})` would write the
  error as `{}`, a body that no longer says what was refused), one that requires another field or
  constrains `statusCode`, `code`, `error` or `message` against it (a field `$ref` is resolved
  through the registered schemas), a union (`anyOf`, `oneOf`) without an open member that accepts
  it, or an `allOf` composition, which the check does not support. The error names the rule that
  failed. Routes of the Session error handling are exempt.

`test/server/request-validation.http.test.ts` sends a request with an invalid path parameter, query
and body, checks each answer against `RequestErrorResponse` and checks that the operation documents
it, that a Session route in demo mode does not, and that an invalid OIDC start body is a `400` with
exactly the four fields while `invalid_return_to` keeps its body.

The transform adds no other refusal; each Session route documents its own Session refusals (next
section).

## Session error responses

Every Session and Session association route answers a Session refusal with the `session_error`
envelope of its Session error handling (`registerSessionErrorHandling`): a `SessionError` thrown on
its path, a failed request validation (`SESSION_INPUT_INVALID`) or an exceeded body limit
(`SESSION_PAYLOAD_TOO_LARGE`). The body is the shared contract `SessionError` (`SessionErrorSchema`
of `@nevo/specflow-contracts/sessions`, `$id: 'SessionError'`).

The error handling sends the envelope without a response schema, and a schema would take part in
its serialization, so a route documents its refusals as documentation-only responses
(`openApiResponses` with `contract: SessionErrorSchema`, see below). `sessionErrors(...codes)` in
`src/features/sessions/http/route-docs.ts` builds them: each code goes under its
`SessionError.statusCode`, one response per status, and the description lists the codes:

```json
"409": {
  "description": "Conflicts with the current state of the resource: a `session_error` with `code` one of `IDEMPOTENCY_CONFLICT`, `SESSION_ARCHIVED`, `TURN_CONFLICT`, `SESSION_RECOVERY_REQUIRED`.",
  "content": { "application/json": { "schema": { "$ref": "#/components/schemas/SessionError" } } }
}
```

A route lists only the codes that have a thrower on its own path (`sessionRouteErrors`). Every
Session route can answer `400 SESSION_INPUT_INVALID` and `503` with `SESSION_DISABLED`,
`SESSION_STORE_BUSY` or `SESSION_STORE_UNAVAILABLE`; a route that looks the Session up answers
`404 SESSION_NOT_FOUND`, a route with a body `413 SESSION_PAYLOAD_TOO_LARGE`; the other codes follow
the store operation and the provider validation the route runs (for example `TURN_CONFLICT` only
for a start, archive or delete). Invariant guards that a consistent store never reaches (one page
item over its byte budget, an undecodable row) are not documented. The composed create
(`POST /api/specs/{specId}/sessions`) answers its `503` from its response schema, a union of the
Specification read error and `SessionError`, whose description lists both.

Not every `400` of a route with a JSON body is a `session_error`. The Session error handling leaves
a body the framework cannot read to the Runtime error handling, which answers Fastify's own error
body, the shared contract `RequestErrorResponse` (`{ statusCode, code, error, message }`,
`@nevo/specflow-contracts/runtime`): `400` for a malformed or empty JSON body
(`FST_ERR_CTP_INVALID_JSON_BODY`, `FST_ERR_CTP_EMPTY_JSON_BODY`) and `415` for a media type
without a parser (`FST_ERR_CTP_INVALID_MEDIA_TYPE`; a `text/plain` body is parsed and fails
validation as `SESSION_INPUT_INVALID`). `sessionBodyErrors(...codes)` documents the `400` of such
a route as `anyOf` `SessionError` and `RequestErrorResponse`, and the `415`. A
documentation-only response with several bodies has `contract: [A, B]`.

The documented codes describe the project-mode surface; the demo Runtime's read-only Session routes
keep only their success and `403` documentation. `test/sessions/error-contracts.http.test.ts` drives
a refusal of every documented Session error status, and the two request errors, through
`inject`, and checks the status, the body against its contract and the code against the documented
response of the operation. It also checks that every Session operation documents its refusals,
that each documented code is under its own `SessionError.statusCode`, and, statically, that each
has a throw site in the Session or Session association code (`new SessionError(`,
`new StoreFault(`, `fail(`) or is answered by the Session error handling; that check does not
prove the throw site is on the route's path.

## Authentication

The document describes the session cookie of the Runtime that serves it:

- **Required authentication** (`authentication.mode: required`): `components.securitySchemes` has
  one scheme, `sessionCookie`, an `apiKey` in a cookie whose name is the Runtime session cookie of
  the configured server port (`authCookieNames(port).session`, for example `nevo_session_4318`).
  Every operation that needs an authenticated principal carries
  `"security": [{ "sessionCookie": [] }]`; a public operation carries no `security`. The document
  has no global `security`.
- **Trusted local mode** (`authentication.mode: none`): no operation needs a credential, so the
  document has no security scheme and no operation `security`.

Runtime authorizes inside each route (`request.authz`, `requireCapability`), so a route does not
declare whether it needs a principal in a form the document could read. A route that answers
without an authenticated principal says so in its route `config` with `openApiPublic: true`; every
other documented route needs access. The public operations are login and logout
(`/api/auth/password/login`, `/api/auth/oidc/<providerId>/start`,
`/api/auth/oidc/<providerId>/callback`, `/api/auth/logout`), the authentication state
(`GET /api/auth/session`) and `GET /api/runtime/info`. A new route that answers without a principal
MUST set `openApiPublic: true`. The security of an operation is never derived from its URL or from
its `401` and `403` responses.

## Operation ids

Every operation has an `operationId` made from its method and path: the lower-case method, then
each path segment below `/api/`, with a path parameter written as `By<Name>`. A segment is written
in PascalCase: a letter at the start of the segment or after a `-` (or `.`) is upper-cased and that
separator dropped, and a separator that is not followed by a letter becomes `_`.

| Operation                                         | `operationId`                           |
| ------------------------------------------------- | --------------------------------------- |
| `GET /api/specs/{specId}/workspace`               | `getSpecsBySpecIdWorkspace`             |
| `POST /api/specs/{specId}/document-commits/flush` | `postSpecsBySpecIdDocumentCommitsFlush` |
| `DELETE /api/sessions/{sessionId}`                | `deleteSessionsBySessionId`             |
| `POST /api/auth/oidc/sso-1/start`                 | `postAuthOidcSso_1Start`                |
| `POST /api/auth/oidc/sso1/start`                  | `postAuthOidcSso1Start`                 |

The id depends only on the method and the path, never on registration order, so it changes only
when the route does. For a segment of lower-case letters, digits and hyphens the encoding is
reversible (an upper-case letter after the first is a `-` and that letter, `_` is a `-`). The only
segment that comes from configuration is the OIDC provider id, which is such a segment, so every
valid configuration has distinct ids; an OIDC provider route carries its provider id
(`postAuthOidcExampleStart` in the committed document). All other segments are fixed in code; two
code-defined routes whose paths produce the same id (such as `/api/a-b` and `/api/a/b`) are
refused when the second is registered.

## Response descriptions

A response documented by a schema without its own `description` is described by its status code,
for the status codes whose meaning is the same on every Runtime route (`200` Success, `202`
Accepted: the operation continues asynchronously, `304` Not modified, `401` Not authenticated,
`403` The principal lacks a required capability, `409`, `422`, `429`, `503` and so on; the list is
`STATUS_DESCRIPTIONS` in `src/server/openapi/responses.ts`). A route whose response means something more
specific gives it its own description with `x-response-description` on the response schema (which
only the document reads); password login describes its `401` this way, since that `401` means
rejected credentials. A documentation-only response carries the
description written in its route `config` (see below). The description belongs to the response,
not to the schema: a shared component keeps no description of its own.

## Committed document

`docs/reference/api/openapi.generated.json` is the document of one canonical **project-mode**
composition, so every API shape change shows up in pull request diffs:

- project data mode, no demo routes;
- `authentication.mode: required` with every authentication provider enabled: password login
  (`/api/auth/password/login`) and one OIDC provider with the id `example`
  (`/api/auth/oidc/example/start`, `/api/auth/oidc/example/callback`). A real Runtime serves these
  OIDC routes once per configured provider id, under `/api/auth/oidc/<providerId>/`;
- fixed in-code configuration: nothing is read from the workstation, no listener is started and no
  network is used.

The route surface of project mode depends only on the enabled authentication providers, so this
composition is the full project-mode surface. A served document of another configuration is the
same document minus the routes of disabled providers (and with its own OIDC provider ids).

The file is written in a fixed byte form so Linux and Windows produce the same bytes: `paths` sorted
by path, JSON with 2-space indentation, LF line endings and a trailing newline. `.gitattributes`
marks it `linguist-generated` (collapsed in pull requests, still diffable) with `eol=lf`; Prettier
ignores it as a generated file.

## Regenerating and checking

```bash
pnpm api:openapi          # build @nevo/specflow-runtime and write the committed document
pnpm api:openapi --check  # fail when the committed document differs from a fresh generation
```

Both modes use the same generation and validate the document before they write or compare it:

- the document is validated as OpenAPI 3.1 by
  [`@seriousme/openapi-schema-validator`](https://github.com/seriousme/openapi-schema-validator)
  (a development dependency of the command script only, never part of the Runtime build). This
  checks conformance to the OpenAPI 3.1 schema, including `required: true` on every path parameter,
  and that every `$ref` resolves;
- every parameter of a path template is declared as a path parameter of each of its operations, and
  no other path parameter is declared.

An invalid document fails both modes with `The generated OpenAPI document is invalid:` and the list
of problems; nothing is written. Component names cannot collide: each is the `$id` of a shared
contract, and Fastify refuses a second registration of an `$id` at startup.

`--check` exits non-zero with
``docs/reference/api/openapi.generated.json is stale: run `pnpm api:openapi`.`` when the bytes
differ; CI runs it (see [Continuous integration](../../engineering/repository/ci.md#runtime-openapi-document)).
After changing a route schema, run `pnpm api:openapi` and commit the regenerated file with the
change.

## Responses not serialized from a response schema

Some replies are not serialized from a response schema: logout and Session deletion answer `204`
without a body, the OIDC callback answers a `302` redirect, the event streams write
`text/event-stream` to the raw socket, and the Session event stream refuses a stream above its
admission limit with a `429` JSON body sent without a schema. A response schema on such a route
would take part in Fastify serialization (for a JSON body, a schema would reorder the default rate
limit's `{ statusCode, error }`), so the route declares documentation-only responses in its route
`config` instead:

```ts
config: {
  openApiResponses: {
    204: { description: 'The Session is deleted. No body.' },
  },
},
```

Each entry has a `description`, optional response `headers` (name to description) and either an
optional `mediaType` (only `text/event-stream`) or a `contract` (a registered shared contract, for a
JSON body; any other JSON body is documented by a response schema). Only the Swagger `transform` of
`src/server/openapi/transform.ts` reads it: a response without `mediaType` or `contract` becomes a response
without `content`, a stream becomes `content` of that media type with a `string` schema, and a
contract becomes JSON `content` referencing its component. A documentation-only status replaces a
shared response of the same status code (the default rate limit's `429`). A status code documented both ways is refused when the route is registered. An event
stream route that also answers JSON errors (the operation progress stream) keeps those in its
response schema; the documentation-only `200` is added next to them.

| Method   | Path                                                | Documented response                                                                                                         |
| -------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/auth/logout`                                  | `204`, no body; `Set-Cookie` clears the authentication cookies                                                              |
| `GET`    | `/api/auth/oidc/<providerId>/callback`              | `302`; `Location` and `Set-Cookie`                                                                                          |
| `DELETE` | `/api/sessions/{sessionId}`                         | `204`, no body                                                                                                              |
| `GET`    | `/api/sessions/{sessionId}/events`                  | `200`, `text/event-stream`; `429` (`RateLimitedErrorResponse`, `Retry-After`) of the stream limit or the default rate limit |
| `GET`    | `/api/specs/create/operations/{operationId}/events` | `200`, `text/event-stream`, besides its JSON error responses                                                                |

The Session routes also document their `session_error` refusals this way (see
[Session error responses](#session-error-responses)).

## Protocol parameters

Some request parameters belong to a protocol the handler implements itself and are not in the route
schema: a schema would validate them before the handler, which accepts or refuses them in its own
way. The route declares them as documentation-only parameters in its route `config`, by location
(`header` or `query`), name and description:

```ts
config: {
  openApiParameters: {
    header: { 'Last-Event-ID': 'The sequence of the last Session event the client received ...' },
  },
},
```

The Swagger `transform` adds each as an optional `string` parameter of the operation; validation is
unchanged. A name that the route schema also declares for that location is refused when the route
is registered.

| Operation                                               | Parameters                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/sessions/{sessionId}/events`                  | header `Last-Event-ID`: replay after that event sequence, the same cursor as `after` (both present: equal); a repeated or unequal value, one that is not a non-negative integer or one beyond the latest event is `400 SESSION_CURSOR_INVALID`; an empty value reads as `0` |
| `GET /api/specs/create/operations/{operationId}/events` | header `Last-Event-ID`: continue after that progress event id; when absent, not a number or beyond the latest id, the stream starts with the current snapshot                                                                                                               |
| `GET /api/auth/oidc/<providerId>/callback`              | query `code`, `state`, `iss` and `error` of the authorization response (OpenID Connect Core, RFC 9207); every failure, a missing parameter included, ends in the redirect to the login page                                                                                 |

## Undocumented routes

A route with neither a `response` schema nor `openApiResponses` gets the generic
`200 Default Response`. Both commands print such routes to stderr as information; they never fail
the check. The committed document currently has none. A route is documented by adding its response
schema, or its documentation-only responses, to the route, never by editing the document.
