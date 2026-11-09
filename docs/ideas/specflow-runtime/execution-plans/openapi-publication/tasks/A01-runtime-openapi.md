---
id: ideas.specflow-runtime.execution-plans.openapi-publication.task-a01
type: engineering
title: 'A01 — Runtime OpenAPI generation and endpoint'
status: draft
scope: specflow
areas: [runtime, server, security, testing]
tags: [execution-task, temporary, implementation, openapi]
read_when:
  - implementing A01 of the OpenAPI publication plan
summary: >
  Register OpenAPI generation in the Runtime composition root, derive an OpenAPI 3.1 document from
  the existing TypeBox route schemas and serve it at GET /api/openapi.json with the decided
  visibility.
related:
  - ideas.specflow-runtime.execution-plans.openapi-publication
  - ideas.specflow-runtime.openapi-publication
  - architecture.runtime.endpoint-policy
  - architecture.runtime.authorization
---

# A01 — Runtime OpenAPI generation and endpoint

Temporary task of the [OpenAPI publication plan](../README.md). The plan owns sequencing and gates.

## Goal and ownership

Runtime produces an OpenAPI 3.1 document of its own HTTP surface from the route schemas it already
declares and serves it at `GET /api/openapi.json`.

- Kind/profile: backend / `nevo-agents:implementer`.
- Owner paths: `packages/specflow-runtime/src/server/` (composition root `app.ts` and a new
  co-located OpenAPI module with its tests), `packages/specflow-runtime/package.json`,
  `pnpm-lock.yaml`, and the route schema for the new endpoint in
  `packages/specflow-contracts/src/runtime/` if a response schema is declared there like
  `RuntimeInfoResponseSchema`.
- Prerequisites: none in this plan; owner answer to A-D1 (visibility) and A-D3 (demo routes).
- Minimal context: `architecture.runtime.endpoint-policy`, `architecture.runtime.authorization`,
  `packages/specflow-runtime/src/server/app.ts`, one representative feature route registration (for
  example `features/documents/content/endpoint.ts`).

## Scope

- Add `@fastify/swagger` (exact version, Fastify 5 compatible) and register it in
  `configureRuntimeApp` before any feature route, so every later `register` is captured. Do not
  register it per feature.
- The document is generated from existing `schema` blocks only. Non-API routes (web application
  assets, `/` fallback) and the demo seams (per A-D3) are hidden from the document.
- `GET /api/openapi.json` with its own declared schema, `Cache-Control: no-store`, the shared
  default rate limit (no exception) and the visibility from A-D1, enforced through the existing
  authorization request context, not by a new ad-hoc check.
- Expose a framework-level function that returns the generated document from a configured,
  not-listening Runtime app (for A02's writer); it must not start a listener or touch the network.
- Report routes without a `response` schema as a deterministic list (consumed by A02), without
  failing.

## Acceptance

- The document is valid OpenAPI 3.1 and contains every schema-declared `/api/**` route of the
  project-mode composition with its parameters, query, body and response schemas as declared.
- The served document equals what the generation function returns for the same composition.
- Visibility follows A-D1: an unauthenticated request under `authentication.mode=required` is
  rejected exactly as other protected reads are; trusted local mode serves it.
- No existing route changes status codes, validation, serialization or headers (TypeBox 1.x
  schemas from `typebox` are consumed as JSON Schema; any incompatibility such as `$id`/reference
  handling is solved in the OpenAPI transform, not by editing feature schemas).
- Output is deterministic: two generations of the same composition are byte-identical.

## Verification

Targeted (Windows-safe):

```bash
pnpm --filter @nevo/specflow-runtime exec vitest run src/server/<openapi test file>
pnpm --filter @nevo/specflow-runtime exec vitest run src/server/endpoint-policy-config.test.ts
pnpm --filter @nevo/specflow-runtime typecheck
pnpm --filter @nevo/specflow-runtime lint
```

HTTP tests cover: served shape, visibility in both authentication modes, rate-limit inheritance,
hidden routes absent, determinism. Full Runtime suite runs on Linux/CI.

## Review focus

Composition-root placement and order; visibility and authorization reuse; no behavior drift of
existing routes; that the generation function is side-effect free; third-party notices still
generated for the new bundled dependency (packaged smoke on CI).

## Out of scope

Writing the committed file, CI wiring and docs (A02); interactive viewer (A-D2); adding schemas to
routes that lack them.
