---
id: reference.api.operation-progress
type: reference
title: Operation progress events (SSE) HTTP reference
status: current
scope: specflow
areas: [runtime, server, ui]
read_when:
  - showing live progress of a long-running operation
  - adding a new operation kind to the progress stream
  - changing the progress event schemas or the events endpoint
summary: >
  Server-Sent Events stream of long-running operations: per-feature routes over one shared
  mechanism, event model, step vocabulary per operation kind, replay, waiting and fallback rules.
related:
  - reference.api.specflow-specification-operations
  - engineering.shared.operation-progress
  - product.specflow.specification-creation
---

# Operation progress events

The HTTP transport contract is generated in
[OpenAPI](openapi.md), operation `getSpecsCreateOperationsByOperationIdEvents`
(`GET /api/specs/create/operations/{operationId}/events`).
The stream's response description includes framing, event names and payloads, replay,
heartbeats, terminal events and limits. The route implementation is
`packages/specflow-runtime/src/features/operations/events-route.ts`, with typed event
unions in `packages/specflow-contracts/src/operations/progress.ts`.

Progress is display-only: a failure or missing stream never determines the operation outcome.
Follow [the engineering integration guide](../../engineering/shared/operation-progress.md)
for client fallback, polling and extension rules. The durable Create operation is described by
[Specification lifecycle](../../architecture/runtime/specification-lifecycle.md).

This stable ID is a discovery pointer, not a manually maintained second SSE schema.
