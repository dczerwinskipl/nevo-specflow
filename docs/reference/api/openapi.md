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
  an external tool (Bruno, Postman, Scalar, Swagger Editor).

`info.version` is fixed at `0.0.0`: the document describes the API of the Runtime that serves it and
does not carry the product version.

## Shared contracts

A response contract of `@nevo/specflow-contracts` that more than one operation answers is one
component under `components.schemas`, and every response that answers it is a `$ref` to that
component. For example `GET /api/auth/session` and `POST /api/auth/password/login` both answer
`200` with `{ "$ref": "#/components/schemas/AuthSessionResponse" }`.

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
`CloseWorkspaceResult`, `CreateSpecError`, `DocumentError`, `DocumentOperationResult`,
`DocumentOperationStatus`, `OperationListResponse`, `SessionCommandResult`,
`SpecificationReadError`, `TaskReadError` and `TaskSnapshotExpired`.

Schemas stay inline when they are not one shared response contract:

- a contract answered by one operation only, even under several status codes (for example
  `PasswordLoginErrorResponse` for `401`, `429` and `503` of password login);
- separate contracts that only have the same shape: `StartTurnResult` and `CancelTurnResult` are
  both `{ turnId }`, `CloseError` and `CreateSpecError` differ only by `remedy`, and they keep their
  own schemas;
- request bodies, path and query parameters: their validation keeps its inline schema;
- schemas that are not contracts of `@nevo/specflow-contracts` (such as the operation list error of
  the Runtime operations feature).

Structural equality alone never makes a component; a new shared contract gets an `$id` in the
contracts package and an entry in the shared-contract list.

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
`STATUS_DESCRIPTIONS` in `src/server/openapi.ts`). A route whose response means something more
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

## Responses without a JSON body

Some replies are not serialized from a response schema: logout and Session deletion answer `204`
without a body, the OIDC callback answers a `302` redirect, and the event streams write
`text/event-stream` to the raw socket. A response schema on such a route would take part in Fastify
serialization, so the route declares documentation-only responses in its route `config` instead:

```ts
config: {
  openApiResponses: {
    204: { description: 'The Session is deleted. No body.' },
  },
},
```

Each entry has a `description`, optional response `headers` (name to description) and an optional
`mediaType` (only `text/event-stream`; a JSON body is documented by a response schema). Only the
Swagger `transform` of `src/server/openapi.ts` reads it: a response without `mediaType` becomes a
response without `content`, and a stream becomes `content` of that media type with a `string`
schema. A status code documented both ways is refused when the route is registered. An event
stream route that also answers JSON errors (the operation progress stream) keeps those in its
response schema; the documentation-only `200` is added next to them.

| Method   | Path                                                | Documented response                                            |
| -------- | --------------------------------------------------- | -------------------------------------------------------------- |
| `POST`   | `/api/auth/logout`                                  | `204`, no body; `Set-Cookie` clears the authentication cookies |
| `GET`    | `/api/auth/oidc/<providerId>/callback`              | `302`; `Location` and `Set-Cookie`                             |
| `DELETE` | `/api/sessions/{sessionId}`                         | `204`, no body                                                 |
| `GET`    | `/api/sessions/{sessionId}/events`                  | `200`, `text/event-stream`                                     |
| `GET`    | `/api/specs/create/operations/{operationId}/events` | `200`, `text/event-stream`, besides its JSON error responses   |

## Undocumented routes

A route with neither a `response` schema nor `openApiResponses` gets the generic
`200 Default Response`. Both commands print such routes to stderr as information; they never fail
the check. The committed document currently has none. A route is documented by adding its response
schema, or its documentation-only responses, to the route, never by editing the document.
