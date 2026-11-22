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

`GET /api/specs/operations` lists visible Specification Create operations. The
`status` filter selects operation states and `limit` bounds the result. Authorization
applies to each row before counts and result filtering.

Responses include a weak ETag; `If-None-Match` can return `304` when the visible
list is unchanged. Listing an operation never starts or retries it.

For the query, response, conditional requests and refusal codes, use
[OpenAPI](openapi.md), operation `getSpecsOperations`. For an individual Create outcome,
use `GET /api/specs/create/operations/{operationId}`.

The list is a UI projection; the operation inspection and
[Specification lifecycle](../../architecture/runtime/specification-lifecycle.md)
define durable state. See [operation progress](operation-progress.md) for streaming and
polling guidance.
