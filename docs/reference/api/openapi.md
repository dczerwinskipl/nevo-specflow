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

The Runtime exposes its HTTP API as [OpenAPI 3.1](openapi.generated.json).
The schema contains the actual paths, parameters, response bodies, refusal codes,
headers, security requirements and operation identifiers.

For a list of API resources and the most relevant starting point for each task, see
[Reference documentation](../README.md).

## Served document

```http
GET /api/openapi.json
```

The served document reflects the running Runtime configuration. Routes for enabled
authentication providers are included; disabled providers are omitted. Only
`/api/` HTTP operations are described. Demo-only `/api/demo/**` routes are
not included.

The operation requires an authenticated Runtime principal when authentication
is required, or the trusted local identity in trusted-local mode.
It returns JSON with `Cache-Control: no-store`. Runtime does not embed
an interactive API viewer. `info.version` is `0.0.0`; it does not identify
the released product version.

## View the API

Open the [committed JSON schema](openapi.generated.json) in an OpenAPI **3.1**
viewer, such as Swagger UI 5 or Scalar. A viewer that only supports
OpenAPI 3.0 cannot correctly interpret 3.1 constructs such as JSON Schema
`null` types and `const`.

Operations are grouped under these tags:

- Authentication and Authorization
- Specifications, Workspaces and Operations
- Documents, Tasks and Workflow
- Sessions, Session Providers and Session Telemetry
- Documentation and Runtime

Search the schema by path, tag or `operationId`. A method and path determine a
stable operation identifier, for example
`GET /api/specs/{specId}/workspace` is
`getSpecsBySpecIdWorkspace`.

## Schemas and security

Request and response schemas come from the Runtime's TypeBox route contracts.
Shared response contracts and identifiers are emitted under `components.schemas`
and referenced by their stable schema names. Request validation, authorization and
actual HTTP serialization continue to use the Runtime's route definitions.

A required-authentication Runtime documents its configured Session cookie under
`components.securitySchemes` and applies it to protected operations. Public
authentication/session-discovery routes do not require that scheme. In trusted local
mode the generated security requirement is absent.

The document includes shared refusals such as:

- `400` for request validation failures where applicable;
- `401` when a protected route requires authentication;
- `429` for rate limiting, including retry and rate-limit headers;
- `403`, feature-specific conflicts and unavailable states only where the
  route documents them.

Session commands can return typed `session_error` refusals; invalid JSON and
unsupported media types may use the Runtime's common request-error shape instead.
For the available errors on a particular operation, consult its responses in
the generated schema.

SSE, redirects and no-body responses use documented transport descriptions
without changing their runtime serialization.

## Committed document

`docs/reference/api/openapi.generated.json` is generated using one canonical
project-mode configuration, with required authentication, password login and an
example OIDC provider enabled. Live documents can differ by authentication
configuration and provider identifiers. The committed file is generated with
stable ordering and LF line endings for reproducible review.

For separate demo-mode behavior, see
[Demo creation API](specification-creation-demo.md).

## Regeneration and validation

```bash
pnpm api:openapi
pnpm api:openapi --check
pnpm docs:check
```

The first command generates the committed schema from Runtime route contracts.
The second validates the OpenAPI 3.1 schema, local references, path parameters and
whether the committed bytes match fresh generation. `docs:check` validates the
documentation corpus and its links.

When an HTTP route or schema changes, update its TypeBox definition and route
documentation, regenerate the JSON and commit both together. Every published
operation needs a group, a summary, typed responses and accurate authorization
and transport details. Do not manually edit the generated JSON.
