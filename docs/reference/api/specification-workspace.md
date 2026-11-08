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

The Runtime owns the authoritative read boundary. Production UI invokes a typed
`SpecificationApi` over its application-scoped `HttpClient`. There is no browser
fixture switch or silent mock fallback.

## Endpoints

| Method | Path                           | Response                                    |
| ------ | ------------------------------ | ------------------------------------------- |
| GET    | `/api/specs/:specId/workspace` | `SpecificationWorkspaceResponse`            |
| GET    | `/api/runtime/info`            | `RuntimeInfoResponse` containing `dataMode` |

The schemas and generated types live in `@nevo/specflow-contracts/specs/workspace`
and `@nevo/specflow-contracts/runtime`. The initial Workspace response is a
bounded, coherent read projection. Markdown bodies and full Task details have
their own read operations. The DTO is independent of React and `@nevo/ui`.

Workspace section states are `available`, `unavailable` (with
`not_implemented` or `source_unavailable` reason) and `forbidden`.
An `available` empty list means the authoritative read succeeded and was
empty; it must not stand in for a missing integration. Backend-supplied Task
groups and document manifest ordering are authoritative.

## Data source

Normal `nevo-specflow start` uses project mode. The workspace identity (id, title, revision of the
canonical manifest, `preparationState`) is read from the Engine-verified manifest. The `documents`
section is `available` and lists the registered documents of the manifest whose file exists
(`kind` is the document type id, `filename` the relative path, `revision` the content revision, `title`
the derived title); unclassified and dangling entries are not part of it, the document tree
(`reference.api.specification-documents`) shows them. When the documents of a readable
Specification cannot be read, only that section degrades to `unavailable` with reason
`source_unavailable`. The `sessions` section and the `startSession` action come from the Session
association registry ([Project Sessions section](#project-sessions-section)). The Task, activity,
repository and change sections are `unavailable` with reason `not_implemented` and `executeTasks` is
unavailable, because the Engine owns no verified projection of them yet. A bound specification whose canonical source cannot be read (unavailable workspace,
missing or invalid manifest, registry or Git failure) and a Runtime without any source return
`503 { "error": "specification_source_unavailable" }`; both cases share this body, so the UI cannot tell
an outage from a missing adapter. Demonstration data is never substituted. The explicit `nevo-specflow start --demo`
selects Runtime-owned demonstration repositories over the same endpoints.
Demo Overview and Workspace derive from one consistent sample catalogue.

This increment does **not** implement the project Task section, mutations,
multi-project routing, or multi-worktree execution.
Availability and action states describe only what actually exists.

### Project Sessions section

- `sections.sessions` lists the Sessions associated with the Specification
  ([Sessions API](sessions.md#session-list-association-read-and-composed-create)), non-archived,
  newest created first, at most 100 rows, with `hasMore: true` when more exist. The full, paged and
  archive-aware list is `GET /api/sessions?specId=`.
- `WorkspaceSession.status` is the effective Session readiness only (the provider projection of
  the single-Session read and the Session list), never an Engine attempt fact: `busy` -> `active`,
  `requiresAttention` -> `attention`, `ready` -> `quiet`, `authenticationRequired` ->
  `authenticationRequired`, `unavailable` -> `unknown`. `taskIds` come from the association.
  `title` is optional; the server never invents one (the UI shows its untitled label).
- Each row also carries `providerId`, `modelId?`, `updatedAt` and the catalogue titles
  `providerTitle?` / `modelTitle?` (absent when not listed), as in the Session list, so Continue
  session names the agent and its age without a provider catalogue read.
- `recommendedSessionId`: the first visible associated Session by attention, then active, then the
  most recent `updatedAt`.
- `actions.startSession` is available when the Sessions feature is enabled, a provider is usable and
  the caller has `spec.start-session` at `{projectId, specId}` and `session.create` at
  `{projectId, specId}`. Otherwise it carries one `reason`, first match wins: `sessions_disabled`,
  `forbidden`, `no_provider`. The demo Runtime's action also carries `path`
  (`/api/demo/specs/:specId/sessions`), the start route there; in project mode the start route is
  `POST /api/specs/:specId/sessions`.
- With Sessions disabled the section is `unavailable` (`source_unavailable`) together with the
  `sessions_disabled` reason: clients read that as "Sessions are turned off", not as a failed read.
  An unreadable Session store also degrades only this section.
- Freshness: the workspace `revision` is the Engine `sourceRevision` and does not change when
  Sessions change. Clients must not treat an unchanged `revision` as an unchanged Sessions section;
  the UI invalidates the workspace query on its own Session create, rename, archive, unarchive and
  delete and on the Session events it receives.

## Authorization and errors

All Specification reads require `spec.view` at `specScope(projectId, specId)` =
`{projectId, specId}`. All Session-owned data, including summaries, attention, activity and generic
events with a Session provenance ID, are filtered according to `session.view` at the concrete
store-derived Session scope (`sessionScope`, `{projectId, specId, sessionId}` for an associated
Session; [Runtime authorization](../../architecture/runtime/auth/authorization.md#session-scope)).
Session references are resolved in one batch (`resolveMany`), never from a URL or title. The backend issues a `recommendedSessionId`; the UI must
not guess the preferred Session from array order. When the Session section is
unavailable, Session references in other sections still undergo authorization. HTTP `401` and `403` follow
existing Runtime authorization conventions; unknown valid Specification
identities return `404 { "error": "specification_not_found" }`. Missing
Task/document resources use their own stable 404 codes. Invalid parameters
return 400. Both successful read responses and domain error responses use
`Cache-Control: no-store`.

Frontend code distinguishes a missing Specification from an unregistered
Fastify endpoint by the stable error body, not by HTTP status alone. TanStack
Query handles cancellation, caching and targeted lazy-detail reads.

## Domain projection and UI freshness

The internal Specification source supplies its own identity and lightweight facts. The application
composer joins public Task, Document and Session contributions and applies visibility. Specs owns
no Task detail, history, resources or document-body repository methods or routes. The HTTP endpoint
only maps the application result; root composition selects project or explicit demo dependencies.
The project reader (`createEngineWorkspaceRepository`) supplies the identity; the Session association
module contributes the `sessions` section, the store-derived identities of its rows, the recommendation
and `startSession`. Contributions for the other sections are a later increment.

Task lifecycle is a semantic code. The UI does not persist translated status labels in
its Query cache; translation happens during rendering. Full Task uses the current
Task-detail response as authority for its title. When work is available, its deterministic
flow snapshot owns the main status; legacy lifecycle is a fallback only without that source. Workspace Refresh
invalidates only the exact Workspace snapshot; Task, document and lazy-page queries
own their freshness and Retry lifecycles. `GET /api/specs/:specId/workspace` never contains
full document Markdown.

A backend reader must attach Session provenance to any generic activity event
carrying Session-owned information so authorization can filter it. A generic
activity item without a Session provenance cannot carry protected Session content.

## Task and document reads

[Task and document read API](task-reads.md) owns the independent detail, bounded paging,
opaque leases and exact document revision contracts. Runtime Tasks and Documents retain the
existing URL paths. `specs/workspace` re-exports the owner schemas for compatibility; it does
not own their source definitions or application operations.
