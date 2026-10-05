---
id: reference.api.specs-overview
type: reference
title: Specs Overview HTTP API
status: current
read_when:
  - connecting the Specs Overview UI to Runtime
  - verifying the backend sample catalogue and authentication boundary
summary: >
  Provisional typed Specs Overview read endpoint with deterministic backend sample data,
  real session authentication and per-item spec.view filtering.
related:
  - architecture.runtime.authorization
  - product.specflow.ui.application-architecture
---

# Specs Overview HTTP API

`GET /api/specs/overview?collection=active|archive` reads a collection. Omitted `collection`
defaults to `active`; unsupported values and additional query fields return `400`.

The response schema and inferred types are owned by `@nevo/specflow-contracts/specs-overview`.
The envelope contains `revision`, `collection`, `sample` and `items`. Each item supplies its
identity, title, progress, steering signals and current execution summary, with optional key,
tags and PR references. Frontend presentation does not reconstruct domain state.

## Provisional data

Runtime currently returns a fixed catalogue with `sample: true` and stable
`backend-sample-active-1` / `backend-sample-archive-1` revisions. This data is shipped with the
product so dogfooding can exercise real HTTP, login, refresh and collection switching.
The provisional endpoint adds a non-blocking 200 ms response delay to expose loading/refresh states.
It is not repository discovery, persistent Specs, live workflow execution or a mutation API.
Sample entries deliberately omit external PR URLs rather than linking fictional pull requests.

The UI MUST label this response as sample data. Detail navigation, creation and archive/delete
remain unavailable until their product capabilities are implemented.

## Access

Required authentication without a valid browser session returns `401` with
`{"error":"authentication_required"}`. Logout revokes access through the same session store
used by the authentication endpoints. Successful and authentication-denied responses set
`Cache-Control: no-store`.

Each item is filtered through `spec.view` using the server-owned scope
`{ projectId: "specflow-preview", specId: item.id }`. No project/scope input is trusted from
the client. Global viewer/developer/admin assignments apply normally; a viewer assigned only
to a specific preview Spec sees only that item. A user with no matching grant receives an
empty visible collection, not unauthorized item metadata.

Trusted local mode retains the existing access-control semantics: a configured local user
requires matching assignments; no local user means access control is disabled. This endpoint
does not weaken or modify project authentication/authorization policy.

To allow a test user to see the sample catalogue, use a project-owned assignment for
`projectId: specflow-preview` (or an existing global assignment). Password credentials remain
workstation-local according to the existing configuration contract.
