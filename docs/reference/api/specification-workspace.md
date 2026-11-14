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
canonical manifest) is read from the Engine-verified manifest, `preparationState` from its Tasks
(below). The `documents` section is `available` and lists the registered documents of the manifest whose file exists
(`kind` is the document type id, `filename` the relative path, `revision` the content revision, `title`
the derived title); unclassified and dangling entries are not part of it, the document tree
(`reference.api.specification-documents`) shows them. When the documents of a readable
Specification cannot be read, only that section degrades to `unavailable` with reason
`source_unavailable`. The `sessions` section and the `startSession` action come from the Session
association registry ([Project Sessions section](#project-sessions-section)). The `tasks` and
`activity` sections and `specification.summary` are described below. The repository and change
sections are `unavailable` with reason `not_implemented` and `executeTasks` is unavailable, because
the Engine owns no verified projection of them yet. A bound specification whose canonical source cannot be read (unavailable workspace,
missing or invalid manifest, registry or Git failure) and a Runtime without any source return
`503 { "error": "specification_source_unavailable" }`; both cases share this body, so the UI cannot tell
an outage from a missing adapter. Demonstration data is never substituted. The explicit `nevo-specflow start --demo`
selects Runtime-owned demonstration repositories over the same endpoints.
Demo Overview and Workspace derive from one consistent sample catalogue.

This increment does **not** implement Specification mutations other than the Task commands
([Task reads](task-reads.md#task-commands)),
multi-project routing, or multi-worktree execution.
Availability and action states describe only what actually exists.

### Project summary, Tasks and activity

- `specification.summary` is the first non-empty paragraph of the registered overview document as
  plain text: front matter, headings (so the first H1), HTML tags and comments, images, fenced and
  indented code and tables are dropped, links keep their text, emphasis, inline-code, list and quote
  markers are removed, whitespace is collapsed, and text longer than 320 graphemes is cut at a word
  boundary where possible and ends with `…` (at most 320 graphemes including the ellipsis). It is read as a bounded prefix (32 KB) of the overview within the same canonical read
  as the manifest (no second registry resolve). It is `''` when no overview is registered, the file
  is missing, redirected or unreadable, or holds no prose; the response never fails because of it.
  The workspace `revision` stays the manifest `sourceRevision`: an overview-only change does **not**
  change it (clients refetch after their own document writes). Clients render `summary` as plain
  text as delivered (never parsed as Markdown again); its only bound is the 320 graphemes above.
- `sections.documents.data.overviewDocumentId` names the overview among `items` by the Engine's
  overview identity (document id `overview`, the one the summary is read from), whatever its
  position in the manifest. It is present only when the overview is listed (registered and its file
  exists), in project and demo mode alike. Clients expand the summary into this document only; when
  it is absent they offer no expand action and never substitute another document (for example the
  first item).
- `sections.tasks` is one Engine read (`readExecution`) of the Specification's Task resources
  (`tasks/index.yaml`, `tasks/<id>/task.yaml`), runs and action projections, presented in the
  Runtime's dashboard grouping ([Task reads](task-reads.md#dashboard-grouping)), the same one the
  Tasks page uses: non-empty groups in configured order, each with `summary` (`row` or `compact`)
  and `collapsed`. Each row carries `type` (`{id, title}`, the title from the catalogue, the id
  when the type is not defined), `dependsOn` (Task ids) and `attention: true` when an attention item
  names the Task (its own, or the Specification's). `completed` and `total` are the Engine's
  `TaskProgress`: `total` counts the Tasks that are neither cancelled nor ended by an abandon (a
  broken Task included; on hold counts), `completed` those whose run completed; `cancelled` and
  `onHold` count those apart (absent in the demo Runtime). `attention` is the Engine's attention
  projection ([Attention items](task-reads.md#attention-items)): `reason` is the item's message,
  `code` its reason, with `actor`, `action`, `taskIds` and, for `tasks-stuck`, `blocking`; at most
  one Specification-level `tasks-stuck` item, never one per draft. `overview` is the Overview's
  summary: `rows` (each `row` group with its `count`, up to two `tasks` and `more`; a Task already
  named by an attention item carries no `title`), `compact` (each `compact` group's `count`, for
  example Done and Cancelled) and `stuck` (only while the Specification's wait cannot progress: each
  blocking Task with its `title` and `cause`, Now's explanation). An execution the Engine cannot
  read (also a busy project lock) makes only this section `unavailable` / `source_unavailable`.
- `specification.preparationState` is the Engine's `TaskPreparation` of the same read: `empty`
  without Tasks, `preparing` while a Task is a draft, else `prepared`. When the Tasks cannot be
  read it stays `empty`.
- `sections.activity` is `available` and a **partial** history with exactly two event kinds, newest
  first, at most 50 items counted **after** the per-Session authorization (hidden Sessions never
  shorten the visible history):
  - "Specification created": `event: "specification_created"`, `id: "specification-created"`, `kind: "info"`, `occurredAt` the
    manifest `created` date (`YYYY-MM-DD`), emitted only when that value is a valid calendar date;
    it sorts as the start of that day (UTC), so same-day Session events sort above it;
  - "Session started": one per row of the `sessions` section (associated, non-archived, so bounded by
    its 100-row cap), `event: "session_started"`, `id: "session-started.<sessionId>"`,
    `kind: "session"`, `occurredAt` the
    Session's `createdAt` (ISO date-time), `title` the Session title (`''` when untitled) and
    `targetId = relatedSessionId = sessionId`, so `session.view` filters each event per Session.

  `ActivityItem.event` (optional, a closed union in `@nevo/specflow-contracts`) names a known
  Runtime event; clients localize by it, and `title` / `description` carry English fallback text.
  An item without `event` is a source-written event shown as delivered. `occurredAt` is an ISO
  date-time or a `YYYY-MM-DD` date. With Sessions disabled or the
  Session store unreadable only the Specification event remains and the section stays `available`
  (the `sessions` section reports the outage). The demo Runtime's activity stays `available` and
  empty.

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
The project reader (`createEngineWorkspaceRepository`) supplies the identity, the summary and the
manifest `created` date; the Tasks feature contributes the temporary manifest `tasks` section, the
Documents feature the `documents` section, and the Session association module the `sessions`
section, the store-derived identities and creation facts of its rows, the recommendation and
`startSession`. `WorkspaceContributions.activity` is composed last, from the `created` date and the
Session rows the other reads already returned (no foreign read). Repository and changes
contributions are a later increment.

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
