---
id: ideas.demo-api-convergence
type: architecture
title: Unify demo and project Runtime HTTP contracts proposal
status: draft
scope: specflow
areas: [runtime, server, ui, testing]
tags: [demo, api, contracts, adapters, in-memory]
read_when:
  - deciding whether demo needs a separate API surface
  - replacing demo creation, document writes or Session allocation with shared routes
summary: Proposed single HTTP and TypeBox contract for demo and project Runtime, with mode-specific in-memory ports, realistic capability reporting and isolated test scenarios.
related:
  - adr.0025-demo-runs-the-engine-in-memory
  - reference.api.specflow-specification-operations
  - reference.api.specification-documents
  - reference.api.sessions
  - reference.api.specification-creation-demo
  - ideas.documentation-maintainability
---

# Demo Runtime: one API, two backends

**Proposal, not an implemented contract.** Keep `--demo` as an isolated, seeded, in-memory application, but stop exposing a second product API solely because its data is simulated.

## Why this exists

[ADR 0025](../architecture/decisions/0025-demo-runs-the-engine-in-memory.md) already makes demo Workflow, Tasks and Task document routes use real Engine operations via in-memory ports. Create, Specification document writes and creation-time Session allocation are still served by independent `/api/demo/**` routes and demo-specific UI adapters. This is transport and schema duplication, not a needed product distinction.

The demo currently has genuine differences (no Git checkout or provider execution, no restart durability, custom scenarios), but none of them inherently requires alternative HTTP path names. Express unavailable capabilities explicitly rather than teaching the UI a different protocol.

## Current route differences

| Capability                 | Project mode                                           | Demo mode                                                       | Gap                                                           |
| -------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------- |
| Workflow / Tasks           | Shared Engine and resource routes                      | Same Engine workflow over in-memory store                       | Largely converged under ADR 0025                              |
| Document reads             | `/api/specs/:specId/document-tree` and content/raw     | Same paths with demo read source                                | Converged                                                     |
| Document writes            | `/api/specs/:specId/documents...`, folders, operations | Equivalent operations under `/api/demo/specs/:specId/...`       | Different route registration and persistence/commit semantics |
| Create options             | `GET /api/specs/create-options`                        | `GET /api/demo/specs/create-options`                            | Mostly shared schemas; separate endpoints                     |
| Archetypes                 | `GET /api/specs/archetypes`                            | Superset `GET /api/demo/specification-creation`                 | Separate response containing provider/location fixtures       |
| Create                     | `POST /api/specs`                                      | `POST /api/demo/specifications`                                 | Separate command implementation, id handling and inspection   |
| Create inspection/progress | `/api/specs/create/operations/:id`                     | `/api/demo/specifications/operations/:id`                       | Separate resource paths and outcomes                          |
| Sessions                   | Managed Sessions API and composed create               | `POST /api/demo/specs/:specId/sessions` plus placeholder detail | Different semantics, not just different records               |

Evidence: `packages/specflow-runtime/src/features/specs/create/endpoint.ts`, `features/specs/demo/endpoints.ts`, `features/documents/write/routes.ts`, `features/documents/demo/endpoints.ts`, `features/sessions/demo/endpoints.ts`, `packages/specflow-contracts/src/demo/index.ts` and `packages/specflow-ui/src/features/specs/creation/api/api.project.ts` / `api.demo.ts`.

Project mode supports document writes on the common `/api/specs/**` routes. Demo document mutations use the separate `/api/demo/**` routes listed in the [demo API reference](../reference/api/specification-creation-demo.md).

## Proposed target contract

1. **One HTTP surface:** expose `/api/specs/*`, `/api/workspaces`, `/api/specs/:specId/documents/*` and the existing Sessions endpoints in both modes. Keep one published TypeBox contract and one UI feature client per operation; source adapters differ behind Runtime composition. No `DemoCreateSpecRequest` or `DemoSaveInput` alias where the schemas should be identical.
2. **Mode-specific ports:** compose in-memory store, catalogue, workspace/registry and deterministic operations behind existing ports; choose at Runtime startup. Never put a `demo` conditional in Engine domain invariants. Demo data is writable within one Runtime instance and resets on restart.
3. **Honest capability reporting:** lack of real Git, commits, worktree creation or provider execution is reported as unavailable/unsupported through the normal capability model. A simulated worktree must not look like a successfully created physical Git checkout. UI receives capability facts, not a license to bypass authorization or invent success.
4. **Canonical identity and outcomes:** use the real Spec/Session ID constraints (UUID where required), operation IDs, response codes, idempotency fingerprints, 201/202 Create semantics and inspection/SSE shapes. Do not expose demo-only resource IDs on shared routes. Do not report durable Git commits when none happened; use the existing Git-off contract or introduce an explicit, mode-neutral capability where necessary.
5. **Scenarios stay test-only:** move `x-demo-scenario` / `demoScenario` fault injection to a test-fixture seam that cannot be reached by project mode and does not affect public production schemas. Tests still need deterministic pending/error/recovery scenarios. Scenario selection must not bypass the authorization or idempotency checks being tested.
6. **Sessions are the hard case:** a creation-time placeholder is not equivalent to a managed Session that can start a real Turn. Model a provider-free/mock Session with the shared Session store/routes where its semantics fit, and explicitly report `unavailable` features. Do not silently return a placeholder as if a real Session was started or fabricate a Turn. If the product needs a demo-only setup preview, make it a read-only composition concern rather than a second Session resource API.

No promise is made that every real operation is supported by demo. An unsupported operation should fail through the **same route**, with a typed refusal and a discoverable capability reason, rather than silently succeed or disappear behind a different URL.

## Migration batches

| Batch | Change                                                                                                                                                                                    | Proof required                                                                                                          |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A     | Confirm parity map for all public demo and project routes; correct stale reference statements                                                                                             | Route + TypeBox matrix, no claims contradicted by source                                                                |
| B     | Route shared document reads and writes through one feature-owned registration with injected sources                                                                                       | Same HTTP status, request/response and auth tests for both modes; isolated storage                                      |
| C     | Unify catalogue, Create options, Create command, operation inspection and progress                                                                                                        | Canonical identity, concurrency/idempotency, 201/202 and error/recovery scenarios; no accidental Git operations in demo |
| D     | Replace placeholder allocation with the shared Session resource model, or clearly scoped unsupported capability                                                                           | Real/mock Session semantics; correct access scopes and no fake native execution                                         |
| E     | Remove `/api/demo/**` product routes, duplicate demo contracts and mode-specific UI API adapters; retire the standalone [demo reference](../reference/api/specification-creation-demo.md) | No production client uses an old path; schema parity and documentation index/check pass                                 |

Remove the dedicated demo API reference only when the last public demo-specific endpoint is gone. Before then, mark it as a **transitional current contract** that clearly states the actual behavior; do not delete the only documented behavior in advance.

## Acceptance

- One OpenAPI route per capability (not one per runtime mode), with matching request/response schemas and capability-based refusals.
- UI can use the same operation client against project and demo mode without switching URL or TypeScript DTO types. No `runtimeMode` branches for the converged product operations.
- Demo does not call Git, spawn a provider, modify a real workspace, persist across Runtime restart or claim those effects happened.
- Reuse the same security/authorization layer. Run contract tests in both modes, including forbidden accesses, unknown IDs, partial failures, replay and changed-input conflicts.
- Keep seeded showcase behavior, mock provider UX and deterministic negative scenarios for Storybook/e2e. Ensure an unsuccessful demo action cannot mutate unrelated seed data.
- After implementation, the only normative API docs are the standard Specification/Document/Session references. Demo-specific **data and limitations**, if still helpful, belong in a short mode guide, not a duplicate API reference.

This design extends the boundary already adopted for Workflow in ADR 0025; it does not rewrite that decision or silently change production capabilities.
