---
id: architecture.runtime.specification-workspace-composition
type: architecture
title: Specification Workspace read composition
status: current
scope: specflow
areas: [runtime, server, security, workflow, ui]
tags: [specifications, workspace, tasks, documents, sessions, read-model]
read_when:
  - changing the Specification Workspace read composition
  - altering Workspace section availability, bounded projections or freshness
  - changing the visibility of Sessions or Tasks inside a Workspace
summary: >-
  Composition and degradation invariants for Specification Workspace: authoritative Engine
  identity, Task/Document sections, per-Session authorization, bounded activity and freshness.
related:
  - reference.api.specification-workspace
  - architecture.runtime.authorization
  - architecture.runtime.specification-documents
  - architecture.runtime.task-read-composition
  - product.specflow.ui.data-loading-and-integration
---

# Specification Workspace read composition

The Runtime owns the read boundary for `GET /api/specs/:specId/workspace`. It returns bounded
composition, not document Markdown, full Task detail or a Session transcript. The exact HTTP
shape is in [generated OpenAPI](../../reference/api/openapi.md), operation
`getSpecsBySpecIdWorkspace`. Specs composes the read; Tasks, Documents and Sessions own their data
and contribute through narrow ports. Project mode never falls back to demo fixtures.

## Identity, source and failure

- `workspaceId` is the workspace UUID in the Engine registry binding (or the primary checkout
  when no binding exists), never taken from a manifest or UI selection. It identifies the corpus
  for documentation navigation.
- `revision` is the canonical manifest's `sourceRevision`, **not** an aggregate revision of
  documents, Task progress, Sessions or activity. Refetch independently after those change.
- Project mode uses Engine-verified manifest facts. `--demo` explicitly composes demo
  repositories behind the same read route.
- Unknown valid Specifications return 404 `specification_not_found`; unavailable canonical
  checkout, manifest, registry or source returns 503 `specification_source_unavailable`.
  The latter cannot distinguish an outage from an unconfigured source. No mock data is substituted.
- Section states are `available`, `unavailable` (reason `not_implemented`, `source_unavailable`, or
  `source_busy` while another writer holds the project control lock longer than a read waits, so a
  retry soon can succeed, or `source_recovery` while the lock is held by a process nothing proves
  stopped, or is corrupt, so only an operator's recovery helps) and `forbidden`. The Task and Task
  list reads answer the same lock with 503 `specification_source_unavailable` and the code
  `CONTROL_LOCK_RECOVERY_REQUIRED`, and the Specs list marks the row `unreadable: recovery`. An available empty list means **no items**, not
  missing integration. An independent read failure degrades only its own section.
- Repository and changes are explicitly `unavailable/not_implemented` until their owner exposes
  a verified projection. Do not fabricate repository state from manifest data.

## Summary and Documents

- `specification.summary` is plain text from the first nonempty paragraph under the registered
  overview's **Goal** heading (any level; stop at the next heading of the same or higher level),
  otherwise the first paragraph of the document. Ignore frontmatter, headings, comments, HTML,
  images, code and tables; keep link text, strip formatting/list markers and collapse whitespace.
  Read at most the first **32 KiB** and return at most **320 graphemes** including ellipsis,
  cutting at a word boundary where possible. Missing, redirected, unreadable or empty overview
  returns `''`, without failing the Workspace read.
- Documents lists only registered manifest entries whose files exist. Each entry supplies the
  document type id (`kind`), relative filename, derived title and content revision. Unclassified
  and dangling entries belong to the separate document tree. Only the documents section degrades
  when its independent source fails.
- `overviewDocumentId` is the Engine overview identity among the returned documents. It is
  absent if that document is absent; clients must not expand a guessed first document.
- `contentState` is `baseline` iff current file bytes hash to the registry's original
  `baselineRevision`; otherwise `authored` (also for supplied-content creates). Line-ending
  conversions can change it. The live archetype catalogue is never consulted. Demo may omit it.

## Tasks and preparation

- Task groups and rows come from one Engine `readExecution` via the Tasks owner: nonempty groups
  in configured order with `summary` row/compact, `collapsed` and Tasks page importance order.
  Type title resolves from the catalogue with the type id as fallback; dependencies are exposed
  through `dependsOn`.
- `total` counts Tasks except cancelled and ended-without-completion (broken and on-hold Tasks
  count); `completed` counts completed runs. `cancelled`, `ended` and `onHold` remain
  separate. Attention is Engine-owned: `tasks-stuck` occurs at most once per Specification;
  a broken Task is critical; held Task blockers say what they block.
- The Overview projection lists each row group's first **two** Tasks and a `more` count,
  compact-group totals, and a `stuck` explanation of blocking Tasks only when appropriate.
  `preparationState` is `empty` without Tasks, `preparing` if any Task is draft, otherwise
  `prepared`; when the Tasks source cannot be read, it stays `empty`.
- A busy lock or unreadable Task execution degrades only the Tasks section. Full Task reads,
  documents and revision/lease protocols live in their respective feature operations.

## Sessions, capability and attention

- Session contribution consists of non-archived associated Sessions, newest-created first, at
  most **100** records; `hasMore` indicates additional rows. The full archive-aware list is
  `GET /api/sessions?specId=...`.
- Effective provider readiness maps to Workspace status:
  `busy -> active`, `requiresAttention -> attention`, `ready -> quiet`,
  `authenticationRequired -> authenticationRequired`, `unavailable -> unknown`.
  This is not an Engine Task attempt. Titles are optional and never invented; provider/model
  display titles come from the catalogue when available.
- A non-archived Session awaiting owner input contributes a high-priority `session-input`
  attention item (`answer-session`), even beyond the 100-row listing. A row promoted into
  Requires attention must not also appear redundantly in Sessions.
- `recommendedSessionId` is a server decision among visible Sessions: attention, then active,
  then latest update. UI must not guess from list order.
- `actions.startSession` is available only when Sessions are enabled, a provider usable and the
  caller has **both** `spec.start-session` and `session.create` at
  `{projectId,specId}`. First applicable unavailable reason is `sessions_disabled`,
  `forbidden` or `no_provider`. Demo may temporarily provide an alternative `path`.
  A disabled or unreadable Session store degrades only the Sessions section.

## Activity, authorization and freshness

- Activity is a bounded **partial** history, newest first, at most **50** after per-Session
  authorization. Current events are `specification_created` (valid manifest date only,
  stable id `specification-created`, sorted at UTC start of day) and `session_started`
  (associated, visible and non-archived; id `session-started.<sessionId>`, title and creation
  time, Session provenance). Same-day Session events sort before Specification creation.
  When Sessions are unavailable, the Specification creation event remains; demo may be empty.
- An event's `event` code is localizable and its text is fallback; absent code means source
  text is displayed as delivered. Event time may be an ISO instant or `YYYY-MM-DD` date.
- Workspace requires `spec.view` at trusted `{projectId,specId}`. Every Session-owned row,
  attention, recommendation and activity event separately requires `session.view` at its
  store-derived Session scope. Resolve associations in batch. A generic event containing
  Session information **must** carry Session provenance; without it such protected data
  cannot be emitted.
- `revision` does not change on Session create/rename/archive/unarchive/delete or an
  overview-text-only write. UI invalidates Workspace and corresponding independent queries on
  its own mutations and Session events. One Workspace Refresh never implicitly refreshes all
  independent Task/Document detail queries.
- A 401 enters authentication recovery; a 403 means denied access; 404
  `specification_not_found` differs from an unregistered route. Read and domain errors set
  `Cache-Control: no-store`. Localized lifecycle labels are render-time text, not cache data.
