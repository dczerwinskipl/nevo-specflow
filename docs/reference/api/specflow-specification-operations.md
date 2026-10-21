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
  Implemented E2 endpoint routes, public payloads, response codes and authorization
  boundaries.
related:
  - architecture.runtime.specflow-lifecycle
  - product.specflow.specification-creation
  - reference.configuration.specflow-git-worktrees
---

# Specification Create and Close HTTP reference

Exact schemas are in `packages/specflow-contracts/src/specs/`; transport mapping lives in
`packages/specflow-runtime/src/features/specs/`. This document describes current E2, not
future Workflow or provider Session APIs.

## Create

| HTTP | Route                                       | Result                                              |
| ---- | ------------------------------------------- | --------------------------------------------------- |
| GET  | `/api/specs/create-options`                 | 200, authorized read-only options                   |
| POST | `/api/specs`                                | **201**, `CreatedSpec`                              |
| GET  | `/api/specs/create/operations/:operationId` | 200 sanitized observation or 404 `CREATE_NOT_FOUND` |

All three require project-wide Spec `Create` capability before reading protected data.
401/403 use existing Auth schemas. With no Engine composition, all return
503 `{"error":"ENGINE_UNAVAILABLE","code":"ENGINE_UNAVAILABLE"}`.
Typed Create errors otherwise expose matching uppercase `error`/`code`; examples include
`CREATE_CONFLICT`/409, `BRANCH_ALREADY_EXISTS`/409, `BASE_REF_NOT_FOUND`/422
and `CREATE_RECOVERY_REQUIRED`/503.

POST request: `{title,goal?,operationId?,target?}`, title HTTP length 1–200.
`target` omitted means primary, `{kind:"existing",workspaceId}` means one registered checkout,
and `{kind:"new-worktree",baseRef?,branch?,integrationTargetWorkspaceId?}` means a new managed
worktree. Omitted/explicit overrides have distinct durable fingerprints.

Successful result:
`{operationId,specId,kind:"specification-create",status:"completed",slug,workspaceId,relativeManifestPath}`.
No absolute checkout paths are exposed.

Create options include `primaryWorkspaceId`, `workspaces[]` (`workspaceId,kind,managed,specCount,
state,selectable,integrationSelectable,branch?,reason?,integrationDestination?`),
`newWorktree`, `defaultBaseRef`, `branchPattern`, `integrationTargetBranch?`, `baseRefs[]`.
Local `baseRefs[].ref` values are `refs/heads/...`; project default may instead be
`HEAD`, a SHA or a tag. An existing dirty workspace may be selectable for Create but is
not an integration-selectable destination. All options are a snapshot, not a reservation.

Operation lookup returns `{operationId,kind:"specification-create",status:"in-progress"|"recovery-required"}`
or completed `CreatedSpec`. It is read-only and never proves process liveness or initiates
recovery. After timeout, reuse the **same** operation ID.

## Close

| HTTP | Route                                                        | Meaning                                   |
| ---- | ------------------------------------------------------------ | ----------------------------------------- |
| GET  | `/api/specs/:specId/close/preview`                           | Plan Specification Close                  |
| POST | `/api/specs/:specId/close`                                   | Archive/optional integrate                |
| GET  | `/api/specs/:specId/worktree/close/preview`                  | Exclusive Worktree Close preview          |
| POST | `/api/specs/:specId/worktree/close`                          | Exclusive Worktree Close                  |
| GET  | `/api/specs/:specId/close/operations/:operationId`           | Inspect Spec Close                        |
| GET  | `/api/workspaces/:workspaceId/close/preview`                 | Preview **every** canonical occupant      |
| POST | `/api/workspaces/:workspaceId/close`                         | Whole-branch integration and group rebind |
| GET  | `/api/workspaces/:workspaceId/close/operations/:operationId` | Inspect Workspace Close                   |

Mutating Close requests include UUID `operationId`; Specification Close optionally sends
`integrateToTargetBranch:false` for archive-only. Completed results use 200; unsettled use 202.
Spec-scoped Close requires the appropriate Spec capability and whole-branch integration also
needs project-wide Git `Integrate`. Workspace Close requires project-wide Git
`CloseWorkspace` **and** `Integrate` before revealing occupants/journals.
Shared spec-scoped integration refuses with 409 `CLOSE_SHARED_WORKTREE`.
Error status and exact DTO variants are defined in the schema and Runtime endpoint.

No operation silently completes tasks, invents Session state or retries uncertain Git effects.
