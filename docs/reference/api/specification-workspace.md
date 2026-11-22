---
id: reference.api.specification-workspace
type: reference
title: Specification Workspace HTTP API
status: current
read_when:
  - implementing or consuming the Specification Workspace API
  - validating Workspace authentication and feature availability
summary: >
  Typed Specification Workspace composition with explicit
  Runtime data source, authorization and independent detail loading.
related:
  - reference.api.task-reads
  - reference.api.specs-overview
  - architecture.runtime.authorization
  - product.specflow.ui.data-loading-and-integration
---

# Specification Workspace HTTP API

The exact HTTP contract is generated in [Runtime OpenAPI](openapi.md), operation
`getSpecsBySpecIdWorkspace` (`GET /api/specs/{specId}/workspace`).
TypeBox schemas live in `packages/specflow-contracts/src/specs/workspace/index.ts`.

The authoritative composition, per-section degradation, partial history, Session filtering,
Task and Document source boundaries, and cache freshness are now documented in
[Specification Workspace read composition](../../architecture/runtime/specification-workspace-composition.md).
The UI's independent query lifetimes are described in
[UI data loading](../../product/specflow/ui/data-loading-and-integration.md).

This page preserves its stable discovery ID and must not copy route fields or error tables.
