---
id: reference.api.specs-overview
type: reference
title: Specs Overview HTTP API
status: current
read_when:
  - connecting the Specs Overview UI to Runtime
  - verifying Specs collection authorization and response contracts
summary: >
  Typed Current/Archive Specs Overview read endpoint with feature-owned classification,
  real session authentication, and per-item spec.view filtering.
related:
  - architecture.runtime.authorization
  - reference.api.specs-operations-list
  - product.specflow.ui.application-architecture
  - product.specflow.ui.specs-overview
---

# Specifications Overview HTTP API

`GET /api/specs/overview` returns the authorized Current or Archive projection,
including server-derived grouping, attention state and item visibility. The caller sees
only Specifications allowed by `spec.view`.

The Overview response does not contain the separate operation list. Use
[`GET /api/specs/operations`](specs-operations-list.md) for background Create operations.

The query, discriminator, response fields and errors are specified in
[OpenAPI](openapi.md), operation `getSpecsOverview`.
For grouping and presentation behavior, see
[Specifications Overview](../../product/specflow/ui/specs-overview.md);
for access rules, see
[Runtime authorization](../../architecture/runtime/auth/authorization.md).
