---
id: ideas.semantic-docs.execution-plan.task-b07
type: engineering
title: 'B07 — Runtime documentation search endpoint and start refresh'
status: draft
scope: specflow
areas: [runtime, server, security, configuration, testing]
tags: [execution-task, temporary, implementation, semantic-search, authorization]
read_when:
  - implementing B07 of the semantic documentation search plan
summary: >
  Add the Runtime docs feature serving GET /api/docs/search with the docs.search authorization
  resource granted to viewer, validate docs and ai sections in Runtime config loading, refresh the
  index in the background on start, and regenerate the committed OpenAPI document.
related:
  - ideas.semantic-docs.execution-plan
  - ideas.semantic-docs.execution-plan.task-b05
  - ideas.semantic-docs.docs-capability
  - ideas.semantic-docs.index-freshness
  - ideas.specflow-runtime.execution-plans.openapi-publication
  - architecture.runtime.endpoint-policy
  - architecture.runtime.authorization
  - architecture.runtime.ownership-and-lifecycle
---

# B07 — Runtime documentation search endpoint

Temporary task of the [semantic docs execution plan](../README.md).

## Goal and ownership

A running Runtime answers `GET /api/docs/search` with the same result contract as the CLI, under its
own authorization resource, without delaying start, and the endpoint appears in the published
OpenAPI document.

- Kind/profile: backend / `nevo-agents:implementer`.
- Owner paths: new `packages/specflow-runtime/src/features/docs/**` (feature factory, route,
  background refresh, tests); `packages/specflow-runtime/src/config/load.ts` and `config/types.ts`
  (call B05's validation entry, carry the resolved docs settings); `server/app.ts` (register the
  feature); `server/roles.ts` and `server/roles.test.ts` (viewer grant); a capability definition file
  in `packages/specflow-contracts/src/docs/` next to B05's contract (the result contract itself is
  B05's and is consumed unchanged); `packages/specflow-runtime/package.json`; `pnpm-lock.yaml`;
  `tools/eslint/specflow-runtime.mjs` only if its rules need the new dependency;
  `docs/reference/api/docs-search.md` (new), `docs/reference/api/authorization.md` (resource list);
  `docs/reference/api/openapi.generated.json` (regenerated).
- Prerequisites: B05; the OpenAPI publication PR merged (A01/A02: generation, committed file and
  drift check exist).
- Minimal context: `architecture.runtime.endpoint-policy`, `architecture.runtime.authorization`,
  `architecture.runtime.ownership-and-lifecycle`, `engineering.shared.async-and-lifecycle`,
  `server/app.ts`, `features/settings/feature.ts` and one route-owning feature as patterns, B05's
  search API and validation entry.

## Scope

- Authorization (B-D7, planning assumption): resource `docs`, action `search`, granted to `viewer`
  and therefore every higher role; registered through `authorizationResources` so capability
  discovery lists it without a second catalogue.
- Query (B-D8): `q` (required, bounded length), `limit` (bounded), the non-authoritative inclusion
  switch with the same default as the CLI; no `context` parameter. Response schema is B05's
  contract; the default rate limit applies.
- Corpus (B-D9): the project's own `docs.root`; index location as in B05.
- Config: `loadRuntimeConfig` validates `docs` and `ai` with B05's entry (project and local
  ownership identical to the CLI); invalid configuration fails start with a `RuntimeConfigError`
  message, like other sections.
- Refresh (B-D6): on start a background incremental refresh; start and readiness are not blocked;
  while building, search answers lexical with reason "index building"; the background work is
  owned by the feature lifecycle and stopped on app close; read-time refresh also applies per
  request. No invalidation API.
- Regenerate the committed OpenAPI document with the repository command from the OpenAPI PR.

## Acceptance

- HTTP tests: viewer is allowed, an unauthenticated request under required authentication is
  rejected like other protected reads, invalid `q`/`limit` gets the standard validation error,
  responses validate against the contract, hybrid with the fake embedder and lexical without an
  endpoint.
- Start test: the app is ready before the background refresh completes; close cancels it without
  unhandled rejections.
- Config tests: `docs.search` in local config and a secret literal are rejected by
  `loadRuntimeConfig` with the same rules as the CLI.
- `roles.test.ts` reflects the new viewer capability; no other role changes.
- The OpenAPI drift check passes with the endpoint present.

## Verification

Targeted (Windows-safe):

```bash
pnpm --filter @nevo/specflow-runtime exec vitest run src/features/docs
pnpm --filter @nevo/specflow-runtime exec vitest run src/server/roles.test.ts
pnpm --filter @nevo/specflow-runtime exec vitest run src/server/endpoint-policy-config.test.ts
pnpm --filter @nevo/specflow-runtime typecheck
pnpm --filter @nevo/specflow-runtime lint
pnpm api:openapi --check
```

Full Runtime suite on Linux/CI.

## Review focus (heightened gate)

Authorization reuse and granularity; identical ownership validation in Runtime and CLI; start not
blocked and lifecycle-owned background work; no change to the B05 contract inside this task.

## Out of scope

Contextual help UI and a `context` parameter; other corpora (Specification documents); a reindex
HTTP action.
