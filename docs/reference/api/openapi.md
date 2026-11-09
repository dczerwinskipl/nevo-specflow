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

Both modes use the same generation. `--check` exits non-zero with
``docs/reference/api/openapi.generated.json is stale: run `pnpm api:openapi`.`` when the bytes
differ; CI runs it (see [Continuous integration](../../engineering/repository/ci.md#runtime-openapi-document)).
After changing a route schema, run `pnpm api:openapi` and commit the regenerated file with the
change.

## Known gaps

A route without a `response` schema gets the generic `200 Default Response` and no response body
description. Both commands print these routes to stderr as information; they never fail the check.
Current gaps in the committed document:

| Method   | Path                               |
| -------- | ---------------------------------- |
| `POST`   | `/api/auth/logout`                 |
| `GET`    | `/api/auth/oidc/example/callback`  |
| `DELETE` | `/api/sessions/{sessionId}`        |
| `GET`    | `/api/sessions/{sessionId}/events` |

A gap is closed by adding the response schema to the route, not by editing the document.
