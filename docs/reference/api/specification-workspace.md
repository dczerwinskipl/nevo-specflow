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

# Specification Workspace API

`GET /api/specs/{specId}/workspace` returns the bounded workspace view of one
Specification. Its sections can include a summary, Documents, Tasks, Session references,
activity and available actions. Section availability is independent: an empty result,
a forbidden result and an unavailable source are different states.

The request, DTO and errors are defined in [OpenAPI](openapi.md), operation
`getSpecsBySpecIdWorkspace`. Detailed Task and Document reads have their own endpoints
and do not require first fetching this composite view.

For identity, source selection, partial failures, authorization and freshness, see
[Specification Workspace composition](../../architecture/runtime/specification-workspace-composition.md).
For individual resources use [Task API](task-reads.md),
[Documents API](specification-documents.md) or [Sessions API](sessions.md).
For UI loading behavior, see
[UI data loading](../../product/specflow/ui/data-loading-and-integration.md).
