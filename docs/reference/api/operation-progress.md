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

Create operations provide two complementary reads:

- `GET /api/specs/create/operations/{operationId}` provides the operation outcome and
  recovery state.
- `GET /api/specs/create/operations/{operationId}/events` streams progress as Server-Sent
  Events (SSE), including replay and terminal notifications.

Use the inspection response to establish success or failure. SSE is optional and clients
must still be able to inspect the operation when streaming is interrupted.

For event names, payloads, headers, limits and refusals, see
[OpenAPI](openapi.md), operation `getSpecsCreateOperationsByOperationIdEvents`.
For reconnect and polling behavior, see
[Operation progress integration](../../engineering/shared/operation-progress.md).
For durable operation recovery, see
[Specification lifecycle](../../architecture/runtime/specification-lifecycle.md).
