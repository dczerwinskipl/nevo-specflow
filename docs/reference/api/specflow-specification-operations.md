---
id: reference.api.specflow-specification-operations
type: reference
title: Specification Create and Close HTTP reference
status: current
scope: specflow
areas: [runtime, server, security]
read_when:
  - integrating the production Create Specification screen
  - changing HTTP Create, Close and Workspace Close schemas
summary: >
  Create and Close operations for Specifications, linked worktrees and workspaces,
  including previews, admission and durable operation inspection.
related:
  - reference.api.specification-documents
  - architecture.runtime.specflow-lifecycle
  - product.specflow.specification-creation
  - reference.configuration.specflow-git-worktrees
  - reference.api.operation-progress
---

# Specification Create and Close API

The HTTP requests, response schemas, error codes and admission headers are defined in
[OpenAPI](openapi.md), tags `Specifications`, `Workspaces` and `Operations`.

## Create

| Operation                                        | Purpose                                                    |
| ------------------------------------------------ | ---------------------------------------------------------- |
| `GET /api/specs/archetypes`                      | Read available Specification archetypes                    |
| `GET /api/specs/create-options`                  | Inspect workspace, branch and Git creation options         |
| `POST /api/specs`                                | Create a Specification or accept an asynchronous operation |
| `GET /api/specs/create/operations/{operationId}` | Inspect the Create outcome                                 |

Create options are advisory; the Engine validates the selected target and permissions again
when creating. See [Create options and admission](../../architecture/runtime/specification-create-options.md),
[Specification lifecycle](../../architecture/runtime/specification-lifecycle.md) and
[Create UI](../../product/specflow/specification-creation.md).
Live progress is available through [SSE](operation-progress.md).

**Create with an agent.** `POST /api/specs` may carry `firstStep` (`run: 'agent'`, `provider`,
optional `model` and `effort`): once the Specification exists the Runtime starts the archetype's
first workflow step with that agent, as the caller (it also needs project-wide `spec.manage`). The
first step comes from `GET /api/specs/archetypes` (`archetypes[].firstStep`: `id`, `title`, `agent`);
a step only the owner can do is refused with 400 `CREATE_OPERATION_INVALID`. The operation stays
`in-progress` (step `starting-agent`) until the start is settled; the completed result then carries
`firstStep` (`started` with `sessionId` and `attemptId`, or `not-started` with `code` and `agent`).
The intent is stored with the operation and resumed after a Runtime restart; a retry must carry the
same intent (409 `CREATE_CONFLICT`). The agents to choose from are read before Create with
`GET /api/session-providers` without a context (authorized as a standalone Session start, not as
Manage of the new Specification). See [ADR 0026, D22](../../architecture/decisions/0026-agent-step-execution.md#d22--create-can-start-the-first-step-with-an-agent-supersedes-dogfood-d5).

## Close

Specification, worktree and workspace closure have distinct effects and authorization.

| Operation family                      | Scope                                                          |
| ------------------------------------- | -------------------------------------------------------------- |
| `/api/specs/{specId}/close`           | Archive one Specification, optionally integrate its branch     |
| `/api/specs/{specId}/worktree/close`  | Close the linked worktree                                      |
| `/api/workspaces/{workspaceId}/close` | Close a complete workspace, including its bound Specifications |

Each family has a `/preview` read and an operation-inspection route.
Specification Close also exposes `/occupancy`; recovery actions are available under
the documented operation paths.

See [Close admission and refusals](../../architecture/runtime/specification-close-admission.md)
for blockers and required confirmation, and
[Specification lifecycle](../../architecture/runtime/specification-lifecycle.md)
for Git effects, journal recovery and rebind guarantees.
