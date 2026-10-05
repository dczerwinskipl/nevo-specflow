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
The envelope contains `revision`, `collection`, `sample`, ordered `groups`, and `items`. Each item
supplies backend-owned `groupId`, `overviewSummary`, optional bounded `concurrentWork`, identity,
title, progress, optional `completedAt` / `archivedAt`, tags and PR references. Rich `signals` and
`currentExecutions` remain inspection evidence; canonical rows consume a feature-owned bounded
presentation model. Frontend presentation MUST NOT reconstruct grouping or domain state.

## Provisional data

Runtime currently returns a fixed catalogue with `sample: true` and stable
`backend-sample-active-1` / `backend-sample-archive-1` revisions. This data is shipped with the
product so dogfooding can exercise real HTTP, login, refresh and collection switching.
The provisional endpoint adds a non-blocking 200 ms response delay to expose loading/refresh states.
It is not repository discovery, persistent Specs, live workflow execution or a mutation API.
Sample entries deliberately omit external PR URLs rather than linking fictional pull requests.

The UI MUST label this response as sample data. Detail navigation, creation and archive/delete
remain unavailable until their product capabilities are implemented.

## Overview configuration

The default backend-derived Overview presentation groups are, in order:

1. **Requires attention** (`requires-attention`): any actionable human-attention condition belonging
   to the Specification, a Task, Session, review, decision request, or blocker.
2. **Active** (`active`): authoritative current execution or Session activity without higher-priority
   human attention. This is not necessarily the Specification lifecycle status.
3. **Ready** (`ready`): approved/ready for work, with no execution and no human attention.
4. **Draft** (`draft`): still in preparation, before Ready.

Precedence is `requires-attention > active > ready > draft`. Each Specification has exactly one
backend-owned `groupId`; attention wins even when work is concurrent. Internal `working`, `quiet`,
`issue`, and similar signals are not top-level groups.

The backend supplies enabled standard IDs and their order through the collection's `groups` list.
Project-owned `.nevo/config.yaml` may configure `specs.overview.groups` with `id` and numeric
`order`; omitted configuration uses orders 10/20/30/40. A configured list enables only listed IDs.
The frontend renders the supplied order and maps stable IDs to its normal i18n keys. English labels
and generic rule expressions MUST NOT be put in YAML. Semantics remain backend-owned.

The current mock returns predefined classifications and aggregate facts. This does not implement a
production grouping engine. Replacing the sample with real projections must preserve this contract.

Example committed project configuration:

```yaml
specs:
  overview:
    groups:
      - { id: requires-attention, order: 10 }
      - { id: active, order: 20 }
      - { id: ready, order: 30 }
      - { id: draft, order: 40 }
```

This is project policy, not a workstation-local override. Unknown IDs, duplicate IDs, labels, and
rule-expression fields are rejected. Archive remains a flat historical collection, independent of
enabled Active groups. Completion timestamps win archive timestamps; missing lifecycle timestamps
render neutral Archived without inventing a date from updatedAt.

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

This collection deliberately uses per-item `spec.view` filtering: lack of a grant produces an empty
200 collection, not a fabricated collection-level 403. UI transport handling distinguishes normalized
401 (refresh authentication context and enter the existing login flow), 403 (standalone Access denied),
and network/server failures (unavailable/retry). Larger route authorization architecture is deferred
in [Authorization follow-ups](../../ideas/authorization/README.md).
