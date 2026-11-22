---
id: reference.api.specs-operations-list
type: reference
title: Specifications operation list HTTP API
status: current
scope: specflow
areas: [runtime, server, ui]
read_when:
  - showing the background operations above the Specifications list
  - adding a new operation kind or a new feature-owned operation list
  - changing the operation list schema, retention or status derivation
summary: >
  GET /api/specs/operations lists Specification Create operations from the Engine journals and the
  live progress registry: schema, status table, retention, authorization, ETag, query, error codes and
  the demo mirror.
related:
  - reference.api.specification-documents
  - reference.api.operation-progress
  - reference.api.specflow-specification-operations
  - reference.api.specs-overview
  - engineering.shared.operation-progress
  - adr.0014-feature-owned-operation-lists
---

# Specification operation list API

The exact public response, query schema, ETag behavior and authorization are generated in
[Runtime OpenAPI](openapi.md), operation `getSpecsOperations`
(`GET /api/specs/operations`). The shared TypeBox contract is
`packages/specflow-contracts/src/operations/list.ts`; registration lives in
`packages/specflow-runtime/src/features/specs/create/operation-list.ts` and
`packages/specflow-runtime/src/features/operations/list-route.ts`.

This endpoint is a **display aid**, not a source of operation truth. See the
[Operation progress engineering guide](../../engineering/shared/operation-progress.md)
for polling, fallback and presentation, and
[Specification lifecycle](../../architecture/runtime/specification-lifecycle.md)
for journal recovery, retention and idempotency invariants.

The demo Runtime still exposes a temporary counterpart under `/api/demo/**`;
see the [demo API convergence proposal](../../ideas/demo-api-convergence.md).
This page keeps its stable ID while no longer duplicating the wire contract.
