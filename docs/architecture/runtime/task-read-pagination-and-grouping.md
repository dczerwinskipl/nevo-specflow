---
id: architecture.runtime.task-read-pagination-and-grouping
type: architecture
title: Task reads, history leases and Runtime grouping
status: current
scope: specflow
areas: [runtime, server, security, workflow, ui]
tags: [task, history, cursor, pagination, authorization, grouping]
read_when:
  - implementing or reviewing Task detail and history paging
  - changing Task visibility, dashboard groups or attention overlays
  - changing Task commands or exact revision reads of documents
summary: >-
  Task detail and list read from Engine execution state, with scoped bounded history leases,
  authorized Session references, Runtime-owned grouping, optimistic writes and exact-version reads.
related:
  - architecture.runtime.task-read-composition
  - architecture.workflow.action-projections
  - reference.api.task-reads
  - reference.api.specification-documents
  - architecture.runtime.authorization
---

# Task read composition, pagination and grouping

Task reads and Task commands use Engine-owned resources, workflow state and history. Routes
are served from real Engine state in project mode and in-memory Engine state in explicit
demo mode ([ADR 0025](../decisions/0025-demo-runs-the-engine-in-memory.md)). A project with
no readable Engine state returns typed unavailability, **never demo fixtures**. Public
HTTP methods, parameters, response and errors are generated from TypeBox in
[OpenAPI](../../reference/api/openapi.md) (tag `Tasks`).

## Task source and authority

- Specs owns lightweight Workspace composition; Tasks owns Task detail, history paging and
  grouped list; Documents owns exact document read/write. The shared `/api/specs/` route
  prefix is identity context, not domain ownership. Task detail and document access
  **do not require a prior Workspace read** and no path has two independent route owners.
- A project Task detail or history page reads one coherent Engine `readExecution`:
  Task resource/index, pinned definition, execution/run, neutral Task facts and action
  projection under the project control lock. The `task.md` document revision comes
  separately from Documents. A missing execution projection is not an invented snapshot.
  When the pinned definition changed, workflow/history detail is unavailable, not
  reinterpreted with the new definition. The `TaskSnapshot` schema is a Runtime DTO,
  not an Engine persistence structure.
- Detail contains bounded Task identity and work/document/dependencies/history
  **section availability**; it never materializes full history, document bodies,
  Session transcripts or activating agent context. `available` with an empty list
  means an empty successful source; `unavailable` and `forbidden` are distinct.
  No GET starts work, creates a Session, changes recovery, evaluates write gates
  or records approval.
- `resource.revision` identifies the Task's manifest for later edit/removal;
  its type, preparation status, origin, dependency, document registry, effective
  context, pinned workflow position and `definitionChanged` are Engine facts.
  `resource.facts` is neutral across CLI/MCP/UI: preparation, escalation, startability,
  typed blockers, dependency waits and attention. A status line/group is Runtime
  presentation, never an Engine-stored group.
- Task history has a stable attempt transition order with a unique tie-breaker,
  independent of nullable display timestamps. A new or changed execution invalidates
  a lease unless the owner can supply a genuine immutable read. History references
  use recorded revisions; they must never silently follow the latest document body.

## History leases and continuation

- Task detail issues a bounded, unguessable random **page token**. It identifies a
  Runtime Tasks-owned **in-memory lease**, not a serialized Task, bearer permission,
  session, workflow authority or numeric offset. The lease binds Runtime instance/
  mode, project and Specification/Task identity, verified workspace binding, current
  principal and authorization-policy instance, collection type, source versions/order,
  starting continuation and expiry. Do not log raw tokens/cursors or retain entire
  collections in memory.
- Defaults are **5 minutes**, **1,000 leases** and **1,000 cursor records** per
  Runtime Tasks instance. Expiry, eviction and process restart invalidate them with
  **409 `task_snapshot_expired`**. Source/visibility drift also invalidates them
  rather than silently switching the reader to today's workspace or history.
- Every history call reauthorizes current `spec.view` at trusted `{projectId,specId}`
  and validates the server-derived policy and source binding. Possessing a token
  never grants access. A replaced policy instance invalidates old leases. The
  caller supplies only opaque `token`, optional `cursor` and optional `limit`.
- `limit` is decimal text **1..50**. First page uses the requested or default
  limit. Each cursor is tied to the same lease, expected position **and page size**.
  Reusing a cursor with another explicit limit is 409. Omitting the limit on
  continuation uses the cursor's recorded limit. Unknown/mismatched/expired
  cursor is 409; no fallback to offset zero.
- `coverage:complete` means the owner can enumerate the authorized intended
  collection, **not** that this individual page contains all records;
  `partial` means known incomplete source coverage, not ordinary pagination.
  A non-null `nextCursor` can follow even an underfilled or empty page
  after a bounded visibility scan. Clients **continue while cursor exists**,
  never stop solely because `items.length < limit`.

## Visibility and errors

- Task/document read uses `spec.view` at server-built `{projectId,specId}`.
  Session reference metadata additionally needs `session.view` at each
  **store-derived Session scope**; resolve references in one `resolveMany` batch.
  Unknown, deleted, standalone or inaccessible Session references are omitted
  before serialization and exact counts. No Task-execute or new document
  capability is introduced just because the route is under Tasks.
- Read source and bound checkout are rechecked. Missing Task/document in a verified
  source returns the typed 404; an unreadable/mismatched source or absent
  adapter returns typed 503 `specification_source_unavailable`. A busy
  project control lock adds `Retry-After: 1`, not a fabricated empty list.
  Invalid/expired tokens and cursors return 409 `task_snapshot_expired`.
- All successful detail, page and body answers use `Cache-Control:no-store`.
  Client caches are independently keyed by authenticated identity and resource;
  a token is not a UI permission or persistence mechanism.

## Task list and Runtime grouping

- The Tasks page reads **every Task from one Engine `readExecution`** and
  presents nonempty groups in Runtime configuration order. Group predicates
  match neutral facts (broken, preparation, run position/outcome, startable,
  blocked, waiting); first matching group wins, unmatched falls into `other`.
  Grouping, names, UI collapse and row ordering live outside Engine state.
- In each group, importance sorts: (1) attention/broken/Specification blocking,
  (2) on-hold or cannot-start Task that an open Task directly waits on,
  (3) in-progress, then (4) the rest; ties retain Engine Task id order.
  The Overview preview consumes **the same projected rows and comparator**,
  never a distinct order. A broken Task remains visible with available identity.
- The default grouping is Needs approval (draft), In progress (ready/active
  and between steps), Ready to start (ready/not started/startable),
  Cannot start (blocked or broken), Waiting (solvable dependency/artifact),
  On hold, Done, Cancelled and Ended. Done/Cancelled/Ended are compact;
  Cancelled/Ended collapsed by default. Group predicates may eventually be
  configured differently; current labels are not Engine invariants.
- `progress.total` excludes cancelled or ended-without-completion Tasks,
  includes broken and on-hold. `completed`, `cancelled`, `ended` and
  `onHold` are separate counts.
- Filters are mutually exclusive: `?blocking=specification` selects only
  Tasks currently named by the Specification's `tasks-stuck` attention;
  `?group=<groupId>` selects that configured group. Unknown/empty
  group or stale blocking link returns an empty list and `matched:0`,
  not a stale cached set. Filter counts include all Tasks, broken too.
- Attention is **derived on each read**, never persisted. A row carries at
  most one display attention item: its own, else a Specification-level
  `task-escalated` naming it. `tasks-stuck` is exposed as
  `blocksSpecification`, not duplicate row attention. Broken Task attention
  takes precedence, then Specification, then Task attention in id order.
  A held Task needing intervention has an item only when a dependent/open
  completion actually waits on it; neutral `facts.attention` differs from
  the row's derived display attention.
- Blocker and dependency lines are **structured facts**: the item's
  `reason` with `blocks`, `taskIds`, `brokenTaskIds` or `blocking`, and a
  row's `dependsOn`
  and `facts.dependencyWait`, all Task ids. The list and the Overview
  summary add `taskTitles` (id to title of every readable Task those facts
  and the attention items name, also one not listed), so a client words "holds up <title>" in its
  own language. The item's `message` is the English text the CLI shows,
  composed by the Engine from the same facts.

## Task commands and inputs

- Create/edit/remove/status are Engine commands admitted by
  `spec.manage` at trusted `{projectId,specId}`, before body reading.
  The actor is always the authenticated subject or trusted local Runtime
  human, never an `actor`, executor or trust level sent by the client.
  Changing Task type after creation is not offered.
- Create starts a draft, may supply its initial `task.md` and
  Specification-allowed Task type; edit and remove require the Task
  manifest `expectedRevision` to prevent stale changes.
  Edit `summary:null` removes summary, `context:null` restores the
  Engine default. Dependencies and context are full replacements where
  offered, never guessed partial patches.
- Context references use the same workspace binding as the Task,
  including `project-document` references to an active document
  of the **own checkout's** documentation tree. The Runtime checks it
  once per workspace/request, not against some other checkout. A
  missing process `artifact:true` is awaited where permitted;
  a required Task-owned output artifact cannot be its own input:
  `422 WORKFLOW_INPUT_INVALID` with `required-own-artifact`.
- A Task operation's typed `WorkflowError` lists stale manifest revision,
  unavailable dependencies and invalid context. Successful create/edit
  responds with the new Task revision. All writes recheck current
  engine state and authorization, not cached projections.

## Versioned document reads

- Documents owns exact-version reads. An omitted `revision` means latest;
  a supplied revision means **exactly** that version and never falls back
  to latest on a miss. The query is an opaque 1..1000 character token.
- An absent document is 404, a known document with an unavailable
  requested version is **409 `document_revision_unavailable`**,
  an unavailable source 503, forbidden 403. On success the returned
  revision equals the requested version.
- Task/historical document links retain their recorded revisions; UI
  query keys contain them. Do not substitute a changed current Markdown
  body for the historical evidence.
