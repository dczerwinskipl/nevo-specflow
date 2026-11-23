---
id: reference.api.specification-creation-demo
type: reference
title: Specification creation demo integration contract
status: current
scope: specflow
areas:
  - ui
  - runtime
tags:
  - demo
  - specification
  - session
read_when:
  - integrating or testing demo-mode Specification creation, documents or Session allocation
summary: >
  Demo-mode HTTP endpoints for in-memory Specification creation, document writes,
  workspace options, operation inspection and Session allocation.
related:
  - reference.api.specification-workspace
  - product.specflow.ui.data-loading-and-integration
  - product.specflow.specification-creation
---

# Specification creation demo API

Demo mode provides an isolated, in-memory Specification catalogue and writable document
store. It requires the Runtime's explicit `dataMode: demo`. Data survives page refreshes
but is reset when the Runtime restarts. No Git checkout, commit, provider process or
billable Turn is executed. A simulated worktree or commit result is not evidence of
a physical Git operation.

Production mode uses the [Specification Create and Close API](specflow-specification-operations.md)
and the [Documents API](specification-documents.md). The demo-only routes listed below
are registered only in demo mode.

## Demo transport

| Method | Route                                                      | Purpose                                                                   |
| ------ | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| GET    | `/api/demo/specification-creation`                         | Archetypes, document templates, provider fixtures and preparation context |
| GET    | `/api/demo/specs/create-options`                           | Available workspace and branch targets                                    |
| POST   | `/api/demo/specifications`                                 | Create a Specification                                                    |
| GET    | `/api/demo/specifications/operations`                      | List Create operations                                                    |
| GET    | `/api/demo/specifications/operations/{operationId}`        | Inspect a Create operation                                                |
| GET    | `/api/demo/specifications/operations/{operationId}/events` | Stream Create progress (SSE)                                              |
| POST   | `/api/demo/specs/{specId}/sessions`                        | Allocate an idle Session placeholder                                      |
| GET    | `/api/demo/specs/{specId}/sessions/{sessionId}`            | Read the allocated Session details                                        |
| POST   | `/api/demo/specs/{specId}/documents`                       | Add a batch of documents and folders                                      |
| POST   | `/api/demo/specs/{specId}/folders`                         | Create a folder                                                           |
| POST   | `/api/demo/specs/{specId}/document-operations`             | Rename, move, classify or delete                                          |
| PUT    | `/api/demo/specs/{specId}/documents/{documentId}`          | Save text with a revision precondition                                    |

Document tree, content and raw reads use the common
`GET /api/specs/{specId}/document-tree` and
`GET /api/specs/{specId}/documents/{documentId}` routes.
The common [Workspace](workspaces.md), [Tasks](task-reads.md) and
[Workflow](specification-workflow.md) reads also operate on demo-owned state.

## Authorization and ownership

All routes follow Runtime authentication, origin checks and rate limiting;
responses are `Cache-Control: no-store`. Create options and Specification creation
require `spec.create`. The operation list requires `spec.view` admission and filters
individual rows by visibility. Session allocation requires `spec.view` and
`session.create` for the target Specification; Session reads require the matching
Session capability. Document mutations require `spec.manage`.

Documents and Sessions belong to one Specification. A resource from another
Specification is not returned through the supplied `specId`.

## Workspace targets and Create

The create catalogue includes archetype versions, templates and the default archetype.
Provider and model entries are demonstration fixtures with unknown account/quota data;
they do not establish native provider availability.

`POST /api/demo/specifications` accepts a client-generated UUID `operationId`,
title, catalogue revision, archetype and version, optional document selections,
added documents and folders, and an optional workspace `target`.

Target choices are:

- Omitted `target`: current primary workspace.
- `{kind: 'existing', workspaceId}`: a selectable registered workspace.
- `{kind: 'new-worktree', baseRef?, branch?, integrationTargetWorkspaceId?}`:
  a simulated linked workspace subject to Create options and branch policy.

The Create response identifies the Specification, selected workspace and registered
document ids. A completed Create answers `201`; an asynchronous request using
`Prefer: respond-async` can answer `202` with an operation id and inspection URL.
Replaying identical input with the same `operationId` returns the existing outcome;
changed input returns a conflict. The operation list supports status and limit filters,
plus ETag/`304`.

The linked-workspace `integrationDestination`, when present, is a pinned target
workspace and branch. Without an explicit target, the workspace follows the project
integration target. The stored target is not inferred from `baseRef`.

Creation and Session allocation are separate. A failed Session allocation must not
delete or recreate a successfully created Specification.

## Documents and Sessions

Document creation, Save and folder/document operations reuse the
[document request contracts](specification-documents.md), including
`operationId`, expected revision and path validation. Mutations are atomic within
the in-memory store. A stale document revision refuses the write.
Demo commit outcomes represent simulated commits only.

A Session allocation uses a fresh `requestId`, provider/model selection, optional
effort/mode and the Specification's confirmed workspace. It returns an immutable
Session configuration and location snapshot. The Session is readable through the
managed Session projections but contains no invented prompts, responses or Turns.
Allocating or opening it never launches a native provider.

All create and document writes are replay-safe for the same caller, scope, id and
input. Different input under an existing idempotency key is a conflict.
After an uncertain transport failure, inspect the operation or replay the same
request body and operation id rather than generate new values.

## Limits and errors

- Specification creation and document batches accept up to 16 MiB of request body.
  Document saves accept up to 2 MiB. Individual document limits are stricter.
- Invalid or stale catalogues, protected branches, unavailable workspaces, document
  conflicts and unauthorized access return typed refusals. Clients must use
  the returned code, not parse error text.
- Workspace records, simulated provider availability and in-memory Git facts are
  demonstration data. They are not a substitute for production admission checks.

## Demo scenario seam

Fault injection is disabled in ordinary demo mode. Isolated scenario/test setups
can explicitly enable it and pass `demoScenario` or `x-demo-scenario` to the
supported Create operations. An unknown enabled scenario is rejected as
`DEMO_INVALID_SCENARIO`; ordinary demo mode ignores those inputs.
The product UI does not expose a scenario selector.

For user-visible creation behavior, see
[Specification creation](../../product/specflow/specification-creation.md).
