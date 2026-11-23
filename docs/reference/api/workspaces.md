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

`GET /api/workspaces` lists registered workspaces visible to a caller with
`workspace.view` at project scope. A workspace may be the primary checkout or a linked
worktree; availability, dirty state and visible Specification associations are reported
separately. An unavailable workspace can remain in the list so the client can explain
why it cannot be selected.

The full response and refusal schemas are in [OpenAPI](openapi.md), operation
`getWorkspaces`. The identity and authorization rules are described in
[Runtime authorization](../../architecture/runtime/auth/authorization.md), and
Git/Create/Close behavior in
[Specification lifecycle](../../architecture/runtime/specification-lifecycle.md).

In demo mode this route reads the in-memory workspace registry. Demo workspace records
do not imply that corresponding physical Git worktrees exist.
