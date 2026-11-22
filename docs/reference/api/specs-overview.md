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

# Specs Overview HTTP API

The current HTTP contract is generated from TypeBox in
[Runtime OpenAPI](openapi.md), operation `getSpecsOverview`
(`GET /api/specs/overview`; [committed JSON](openapi.generated.json)).
The route lives in `packages/specflow-runtime/src/features/specs/overview/endpoint.ts`;
the typed response is in `packages/specflow-contracts/src/specs/overview/`.

OpenAPI defines the Current/Archive discriminator, server-owned classification and section
order, read scope, returned evidence, errors and query validation. The separate operation list
(`GET /api/specs/operations`) is **not** embedded in the Overview response.

The authoritative presentation and classification requirements are in
[Specifications list](../../product/specflow/ui/specs-overview.md).
Authorization scope and per-row visibility are in
[Runtime authorization](../../architecture/runtime/auth/authorization.md).

This page preserves its stable discovery ID and does not duplicate route schemas or implementation
snapshots. When a field or status changes, update TypeBox and regenerate OpenAPI, not this page.
