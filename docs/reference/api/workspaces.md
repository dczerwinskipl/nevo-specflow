---
id: reference.api.workspaces
type: reference
title: Workspaces HTTP API
status: current
scope: specflow
areas: [runtime, server, security]
tags: [workspace, worktree, authorization]
read_when:
  - calling or changing GET /api/workspaces
  - listing the registered workspaces of a project in a client (documentation reader, Create Specification)
  - changing the workspace.view capability or the workspace list of the demo Runtime
summary: >
  GET /api/workspaces lists the project's registered workspaces (primary checkout and linked
  worktrees): id, kind, name, absolute folder, availability with a closed reason, whether it is the
  Runtime's own checkout, the bound Specifications the caller may view and, with Git enabled,
  uncommitted changes. Admitted by workspace.view at the project scope.
related:
  - adr.0022-workspace-scoped-documentation-reader
  - architecture.runtime.authorization
  - reference.configuration.authorization
  - reference.api.specflow-specification-operations
  - reference.api.specification-workspace
  - product.specflow.ui.documentation-reader
  - reference.api.openapi
---

# Workspaces HTTP API

The exact wire contract for `GET /api/workspaces` is the generated
[Runtime OpenAPI](openapi.md), operation `getWorkspaces`
([committed schema](openapi.generated.json)). The TypeBox source is
`packages/specflow-contracts/src/workspaces/list.ts`; the route source is
`packages/specflow-runtime/src/features/workspaces/list/endpoint.ts`.

The generated operation describes the availability reasons, `dirty` presence,
`workspace.view` admission, per-Specification visibility, `401`/`403`/`503` responses,
and the demo's in-memory data source.

Workspace identity, access-scope invariants and filtering are owned by
[Runtime authorization](../../architecture/runtime/auth/authorization.md). The
product's workspace picker and fallback behavior belong to
[the documentation-reader UX contract](../../product/specflow/ui/documentation-reader.md).
The Git Create/Close lifecycle belongs to
[Specification lifecycle](../../architecture/runtime/specification-lifecycle.md).

This page preserves a stable discovery ID. It must not duplicate an endpoint or field catalogue.

## Demo Runtime

The demo Runtime exposes the same GET route, backed by its in-memory workspace registry. Its seeded and simulated worktree data does not represent physical Git execution. See [demo and project API convergence](../../ideas/demo-api-convergence.md) for the planned removal of remaining demo-only routes and [Workspace list source](../../architecture/runtime/authorization.md) for scope enforcement.
