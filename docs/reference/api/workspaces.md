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

The Runtime lists the registered workspaces of its project: Project Home (the primary checkout)
and every registered linked worktree
([ADR 0022](../../architecture/decisions/0022-workspace-scoped-documentation-reader.md)).
One list serves the documentation reader's workspace picker and Create Specification. The contract
is `WorkspaceList` in `packages/specflow-contracts/src/workspaces/`; the feature is
`packages/specflow-runtime/src/features/workspaces/`. In the [OpenAPI document](openapi.md) the
operation is in the `Workspaces` group.

## GET /api/workspaces

```http
GET /api/workspaces
```

No parameters. `200` with:

```json
{
  "projectFolderId": "<workspaceId of the primary checkout>",
  "workspaces": [
    {
      "workspaceId": "<uuid>",
      "kind": "primary",
      "name": "acme-app",
      "path": "/work/acme-app",
      "available": true,
      "isRuntimeWorkspace": true,
      "specifications": [{ "specId": "admission", "title": "Deterministic admission" }],
      "dirty": false
    }
  ]
}
```

| Field                | Value                                                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projectFolderId`    | the `workspaceId` of the primary checkout (the project folder): the fallback of a client whose remembered workspace is no longer registered                                                        |
| `workspaces`         | every registered workspace, in registry order                                                                                                                                                      |
| `workspaceId`        | the registry UUID; the key of the workspace in every other route (Create options, Specification workspace, documentation)                                                                          |
| `kind`               | `primary` or `linked`                                                                                                                                                                              |
| `name`               | the checkout's folder name (for the primary one, the repository folder)                                                                                                                            |
| `path`               | the absolute registered folder; a client shortens it for display                                                                                                                                   |
| `available`          | the checkout passed the Engine's read verification (and, with Git enabled, Git lists it as a live worktree)                                                                                        |
| `unavailableReason`  | present exactly when `available` is `false`, one of `checkout-unavailable`, `checkout-mismatch`, `git-unavailable`, `git-membership-mismatch`                                                      |
| `isRuntimeWorkspace` | the checkout the Runtime itself runs in                                                                                                                                                            |
| `specifications`     | the Specifications bound to this workspace whose manifest is readable (none while it is unavailable), limited to those the caller may view                                                         |
| `dirty`              | uncommitted changes (`git status`, untracked files included); present only when Git is enabled and the checkout is available and on a branch, absent with Git disabled and for a detached checkout |

The reasons:

| Reason                    | Meaning                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `checkout-unavailable`    | the registered folder failed verification on disk, or `git status` failed in it           |
| `checkout-mismatch`       | the folder no longer is the registered checkout (moved, replaced by a link or redirected) |
| `git-unavailable`         | Git is enabled but cannot be reached                                                      |
| `git-membership-mismatch` | Git is enabled and does not list the checkout as a live worktree (removed or prunable)    |

The list is a read-only snapshot; it reserves nothing and is read again on every request. The
reasons are a closed set: the Engine's own description of a failure (which can name paths) is
never part of the response. The answer is `Cache-Control: no-store`, with the shared default rate
limit of the [endpoint policy](../../architecture/runtime/endpoint-policy.md).

Create Specification keeps only Create facts in its own options, keyed by `workspaceId`
([Create options](specflow-specification-operations.md#create)).

## Authorization

The capability is `workspace.view` (resource `workspace`, action `view`), checked at the Runtime's
project scope `{ projectId }`: a global or project assignment admits the list, an assignment
bounded to a Specification or a Session does not. The built-in `viewer`, `developer` and `admin`
roles carry it ([authorization configuration](../configuration/authorization.md#current-roles)).

Each bound Specification is then checked with `spec.view` at `{ projectId, specId }`; a
Specification the caller may not view is left out of `specifications` without a trace. The
workspace itself stays listed.

The access check runs before the registry is read, so a denied caller learns nothing about the
workspaces:

| Status | Body                                     | When                                                                  |
| ------ | ---------------------------------------- | --------------------------------------------------------------------- |
| `401`  | `{ "error": "authentication_required" }` | required authentication and no authenticated session                  |
| `503`  | `WORKSPACES_UNAVAILABLE`                 | the Runtime has no project (no Engine and no demo data)               |
| `403`  | `{ "error": "forbidden" }`               | the principal holds `workspace.view` at no scope covering the project |

## Errors

| Status | Body / code              | Meaning                                                                                                            |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `503`  | `WORKSPACES_UNAVAILABLE` | no project to list (see above), or the workspace registry or the project's Specification source cannot be read now |

The `503` body is `{ "error": "WORKSPACES_UNAVAILABLE", "code": "WORKSPACES_UNAVAILABLE" }`. An
unreadable registry or Specification source is logged on the server with the error code only and answered again
on the next request. One unavailable or mismatched linked checkout never fails the list, even with bound Specifications: it
is listed with its reason.

## Demo Runtime

`nevo-specflow start --demo` serves the same route over the demo workspace registry (the one
`GET /api/demo/specs/create-options` reads, see
[Specification creation demo](specification-creation-demo.md)): the primary `acme-app` checkout is
the Runtime's own, linked worktrees are `available` unless their Create state is `unavailable`, and
`dirty` follows a `dirty` Create state on a branch. Every seeded Specification is bound to one
demo workspace, and its Specification workspace read reports the same `workspaceId`; a created
Specification is bound to the workspace it was created in. Authorization is the same, at the demo
project's scope. The options scenarios of the demo seam (`demoScenario`, see "Demo scenario seam") reshape
only `GET /api/demo/specs/create-options`, never this list; `many-workspaces`, for example, adds workspaces to
Create options only, so a client joining the two sees them as a failed read.
