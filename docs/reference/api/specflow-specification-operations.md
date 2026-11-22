---
id: reference.api.specflow-specification-operations
type: reference
title: Specification Create and Close HTTP reference
status: current
scope: specflow
areas: [runtime, server, security]
read_when:
  - integrating the production Create Specification screen
  - changing HTTP Create, Close and Workspace Close schemas
summary: >
  Implemented E2 endpoint routes, public payloads, response codes and authorization
  boundaries.
related:
  - reference.api.specification-documents
  - architecture.runtime.specflow-lifecycle
  - product.specflow.specification-creation
  - reference.configuration.specflow-git-worktrees
  - reference.api.operation-progress
---

# Specification Create and Close HTTP reference

Exact schemas are in `packages/specflow-contracts/src/specs/`; transport mapping lives in
`packages/specflow-runtime/src/features/specs/`. This document describes current E2, not
future Workflow or provider Session APIs.

## Create

The authoritative transport contract is generated as:
`GET /api/specs/create-options` (`getSpecsCreateOptions`),
`GET /api/specs/archetypes` (`getSpecsArchetypes`),
`POST /api/specs` (`postSpecs`), and
`GET /api/specs/create/operations/{operationId}`
(`getSpecsCreateOperationsByOperationId`) in [OpenAPI](openapi.md).

**Source:** TypeBox in `packages/specflow-contracts/src/specs/create.ts` and
`create-options.ts`, routes in `packages/specflow-runtime/src/features/specs/create/endpoint.ts`.
Request/response shapes, refusal statuses, `Prefer: respond-async`, ETag and operation lookup
are documented on those operations in generated OpenAPI, not hand-copied here.

**Domain behavior:** [Create options and admission](../../architecture/runtime/specification-create-options.md)
explains the role of `baseRef`, workspace joining, information exposure, Git-off, invalid
policy and idempotency. [Specification lifecycle](../../architecture/runtime/specification-lifecycle.md)
owns durable effects/recovery. The [Create product contract](../../product/specflow/specification-creation.md)
owns UI flow. [Progress SSE](operation-progress.md) is optional, not authoritative.

## Close

The authoritative HTTP contracts and refusal responses for Specification, Worktree and
Workspace Close are generated in [OpenAPI](openapi.md) from
`packages/specflow-contracts/src/specs/close.ts` and the feature routes in
`packages/specflow-runtime/src/features/specs/close/endpoint.ts`.

**Operations:** Spec Close `/api/specs/{specId}/close` with `/preview` and `/occupancy`;
Worktree Close `/api/specs/{specId}/worktree/close` with `/preview`; Workspace Close
`/api/workspaces/{workspaceId}/close` with `/preview`; operation inspection and
`reconcile-scratch` are documented separately in the generated schema.

**Behavior:** [Close admission and refusals](../../architecture/runtime/specification-close-admission.md)
explains the three intents, Git-off archive-only mode, Session occupancy, pending documents,
branch discovery, externally merged branches and safe local-config disposal.
[Specification lifecycle](../../architecture/runtime/specification-lifecycle.md)
owns journals, integration proof, CAS rebind and recovery. There is no demo-specific public
Close schema.
