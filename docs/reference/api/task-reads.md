---
id: reference.api.task-reads
type: reference
title: Task and document read API
status: current
scope: specflow
areas: [server, runtime, workflow, security]
tags: [tasks, documents, pagination, compatibility, commands]
read_when:
  - implementing the Task read ownership refactor
  - migrating Task schemas out of Specification Workspace
  - implementing scoped Task page tokens and continuation
  - creating, editing, removing or deciding the status of a Task over HTTP
summary: >
  Compatible Task and Document HTTP ownership, application outcomes, page lease
  semantics, the Engine-backed project-mode reads and the owner's Task commands (create, edit,
  remove, status) with their refusal statuses.
related:
  - architecture.runtime.task-read-composition
  - reference.api.specification-workspace
  - reference.api.authorization
---

# Task and document read API

## Status and compatibility

Runtime Tasks and Documents own these implemented application/HTTP boundaries. Source ports and
explicit demo adapters are available; in project mode the Engine is the source of the Task
definition, execution and history reads ([Project mode](#project-mode-engine-reads)) and of the
[Task commands](#task-commands). Schemas live under `packages/specflow-contracts/src/tasks/` and `documents/`, with compatibility
re-exports from `specs/workspace`. This API is independent of the fixture-only revised workspace UI.

The compatibility migration retains these paths and JSON shapes:

| HTTP operation                                   | New Runtime owner                                    | Application operation                      |
| ------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------ |
| `GET /api/specs/:specId/workspace`               | Specs                                                | Read lightweight Specification composition |
| `GET /api/specs/:specId/tasks/:taskId`           | Tasks                                                | Read Task detail                           |
| `GET /api/specs/:specId/tasks/:taskId/history`   | Tasks, consuming Engine history                      | Read authorized history page               |
| `GET /api/specs/:specId/tasks/:taskId/resources` | Tasks, composing resource relations/content metadata | Read authorized resource page              |
| `GET /api/specs/:specId/documents/:documentId`   | Documents                                            | Read document content                      |

Each path is registered exactly once. Workspace loading is not a prerequisite to Task detail or
document access. The route prefix supplies identity/context, not domain ownership.

## Shared contract ownership

Source locations/public exports:

- `specflow-contracts/tasks`: Task detail, task-relative targets, resources and history HTTP types.
- `specflow-contracts/documents`: document identity, content response and read params/errors.
- `specflow-contracts/specs/workspace`: lightweight Specification projection and imports/re-exports
  only where needed for existing consumers.

Move schema definitions; do not create divergent copies. Retain old export names/import paths as
compatibility re-exports during the internal migration. The current `TaskSnapshot` shape is a
Runtime transport projection, not an Engine application type or an authoritative stored snapshot.
Its embedded flow descriptors do not become Engine schemas by moving files.

Do not invent a new Task JSON version just to rename `SpecificationTaskResponse`. A future wire
change requires a separate explicit migration of producers, clients and example/contract tests.
This reference owns Task/document endpoint descriptions; the Workspace reference links here.

## Detail success and availability

The existing detail JSON remains:

```ts
type Detail = {
  task: ExistingTaskSummary;
  purpose?: string;
  acceptanceCriteria: string[];
  workflow?: string;
  /** The Task resource (`TaskResourceFacts`); project mode only. */
  resource?: TaskResourceFacts;
  snapshot?: ExistingTaskSnapshot;
};
```

A step of the flow descriptors names who may work on it as `executors` (`['agent']`, `['human']`
or both; empty for a wait step, which an event completes), and a history entry names who worked on
the attempt as `actor` (`{ class, actorId? }`, the actor id for a person; `null` without an actor).
The singular `executor` of earlier versions is gone.

`Existing*` denotes the existing code schema, not a new duplicate TypeScript definition. A missing
snapshot continues to mean no execution projection. An available section with an empty array is
a confirmed empty source; `unavailable`/`forbidden` is not an empty source.

Detail composition must not read full history, full document bodies or transcripts. It can obtain
bounded recommendation metadata, exact visible count when supported, and owner-issued page
handles. If any prerequisite for a truthful resources page/count is absent, resources remains
unavailable. Definition identity and Task metadata may remain usable if execution is unavailable.

No GET in this contract starts work, compiles activating agent context, verifies a gate, records
sign-off, creates a session or changes recovery state.

## Page wire format

Retain `token`, optional opaque `cursor`, and `limit` in query. `limit` is a decimal string 1–50;
omission uses the bounded default advertised by detail. Unknown query fields or invalid syntax
return 400 through schema validation. Existing identifier constraints remain unchanged.

Success retains:

```ts
{ token: string; items: ExistingItem[]; nextCursor: string | null;
  coverage: 'complete' | 'partial' }
```

`coverage: complete` means that the owner can enumerate the intended authorized collection;
it does not mean that the current page contains its entirety. `partial` describes known incomplete
historical/source coverage, not normal pagination. A non-null continuation can follow an underfilled
or empty page when a bounded visibility scan has not reached the end. Clients continue by cursor,
not by assuming `items.length < limit` means completion.

## Token and cursor semantics

The Runtime Tasks application layer owns opaque page leases. A page token is an unguessable random
identifier for a short-lived, bounded in-memory record, not a serialized Task or a bearer grant.
Lease records bind:

- runtime instance/data mode and resolved project identity;
- `specId`, `taskId`, verified workspace/binding identity when applicable;
- authenticated subject and server-derived visibility/policy context;
- collection kind (`history` or `resources`);
- the owner source read handles/versions required by this collection;
- source order and starting continuation;
- an expiry deadline.

Do not log raw tokens/cursors. Store only bounded metadata/source handles, not complete collections.
Defaults are five minutes and 1,000 lease records plus 1,000 cursor records per Runtime Tasks instance.
Trusted composition may configure TTL/capacity; expired/evicted leases and restart invalidate tokens with 409. Capacity limits fail honestly rather than allowing unbounded process memory. Numeric defaults
are operational tuning; tests use injected clock/limits/randomness.

Policy context is derived from the authenticated subject and immutable authorization instance on every
request. A replaced policy instance invalidates leases; current target checks still apply. It cannot be supplied by
the client. Token possession does not bypass current `spec.view` or target-specific reference
checks. If the implementation cannot verify that the old visibility basis still matches current
policy, invalidate the lease rather than reuse it. No lease is persisted as workflow authority.

Continuation is also opaque and bound to the same lease. A bounded server cursor record contains
the owner's continuation and expected read basis. Replaying a retained cursor reads the same
source interval, subject to fresh authorization. Unknown/mismatched/expired cursors return 409;
the implementation never interprets the cursor as a client-controlled integer offset.

Cursor handles are bound to the requested page size as well as the lease/source position. Reusing
a cursor with another explicit limit returns 409 rather than producing an overlapping partition.
Omitting limit on continuation uses that cursor's recorded limit, not a newly chosen default.
The first request records its chosen/default limit. Cursor retention is bounded by the same lease
deadline/capacity; an evicted continuation fails explicitly and never falls back to offset zero.

History uses the source's stable total order (completed transition order with a unique tie-breaker),
not a sort by nullable display timestamps. New history/execution that invalidates the owner's read
basis causes 409 unless the owner supplies a genuine retained immutable read. Do not silently move
the cursor into today's history or delete duplicates after an inconsistent fetch.

### Recommendation continuation

The resources source exposes one stable authorized order. Detail selects the first at most three
records for the existing `recommended` field and records the continuation immediately after those
actual records. The first resources page starts at that continuation. There is no handler
`slice(3)`, no reread of all resources, and no global rule that resources always begin at offset 3.

`visibleTotal` is the exact authorized collection count at that read basis. `page: null` means no
remainder and `visibleTotal === recommended.length`. Any remainder requires a page lease. Preview
can show two of the three recommendations; revealing the third is UI-local and does not change
the collection/page contract. Permission-filtered records cannot affect recommendations or count.

## Authorization and typed application outcomes

HTTP authentication and the existing capability vocabulary are retained. Task/document scope uses
`spec.view` at `specScope(projectId, specId)` = `{ projectId, specId }`; Session references
additionally need `session.view` at the store-derived Session scope (`sessionScope`:
`{ projectId, specId, sessionId }` for a Session associated with the Specification, see
[Runtime authorization](../../architecture/runtime/auth/authorization.md#session-scope)). All links of
one read resolve through one `resolveMany` batch; an unknown, standalone or deleted Session resolves
to nothing and its reference is hidden. Do not introduce `task.execute` or a Document capability just because modules move.
Independent document permissions, if required later, are a separate policy change.

Application functions return typed outcomes, never Fastify replies:

| Application outcome                                                            | HTTP result during compatibility migration                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Authentication missing/expired                                                 | Existing 401 response                                                                 |
| Caller lacks the required capability                                           | Existing 403 response                                                                 |
| Task/document absent in a verified, readable source                            | Existing 404 with `specification_task_not_found` / `specification_document_not_found` |
| Reader missing, source unavailable, unsafe/mismatched read basis               | Existing 503 with `specification_source_unavailable`                                  |
| Page lease/cursor invalid, expired, wrong scope, or owner read no longer valid | `409 { "error": "task_snapshot_expired" }`                                            |
| Page of a kind the Runtime has no source for (no detail issued a lease for it) | `409 { "error": "task_snapshot_expired" }`                                            |
| Valid permitted read                                                           | Existing 200 DTO                                                                      |

Authorize the enclosing resource before looking up page tokens or foreign target details. Readers
return enough typed identity evidence to reject cross-task/spec/binding substitution. Missing
bound checkout is source unavailable, not a reason to read another checkout. Denied reference
metadata is omitted before response serialization and before any exact count/ranking.

All detail/page/body responses remain `Cache-Control: no-store`. UI caches remain scoped to
authenticated identity and their resource-specific keys; server tokens are not UI permissions.

## Project mode: Engine reads

With an Engine (`nevo-specflow start`), a Task detail or history page is ONE Engine read,
`readExecution`: the inspection of the Specification's execution (the Task resources
`tasks/index.yaml` and `tasks/<id>/task.yaml`, and the run records), the action projection of the
Task and its neutral facts, all from one snapshot read under the project control lock, with the
definitions loaded for that request. Every section of the answer comes from that read, so none
reflects another moment; only `task.md`'s revision is read separately (the Documents owner's own
version).

- `resource` is the Task resource: `revision` (the manifest revision an edit or removal names),
  `type`, `status`, `statusChange`, `dependsOn`, `origin`, `documents`, `context` (`null`: the
  default context), `readiness`, the run `position`, `facts` and `definitionChanged`.
- `resource.facts` are the Engine's neutral `TaskFacts` (no group, label or order):
  `preparation` (the status), `escalated` (on hold by its own escalation), the run `position`
  (a terminal one with its `outcome`), `startable` (the start-blocker rule of the action projection
  finds none), `startBlockers` (the projection's typed blockers), `dependencyWait` (`waitingFor`,
  and `unsatisfiable`: the dependencies that can never complete), `definitionChanged` and
  `attention`, the attention item of the Task when a person has to act
  ([Attention](#attention-items)). `task.status` is a status line derived from the facts (`draft`,
  `in-progress`, `ready`, `waiting`, `blocked` labelled "Cannot start", `completed`, `abandoned`,
  `on-hold`, `cancelled`).
- `snapshot.sections.work` projects the run with the definition it is pinned to (before the first
  start: the task type's workflow, and `definition.revision` is the definition version). An active
  position names the attempt's `actor`. When the pinned definition changed, `work` and `history`
  are unavailable; nothing is reinterpreted. Its `blockers` stay empty: what may be done now is
  the workflow action projection.
- `history` pages the run's attempts, newest first; a page whose execution changed since the
  detail answers `409 task_snapshot_expired`.
- `document` is `task.md` with its revision; `humanRequirements`, `resources` and `recovery` are
  `unavailable` / `not_implemented` (no Engine projection of them).

An unknown Specification or Task is `404 specification_task_not_found`; an execution the Engine
cannot read (an unavailable checkout, unreadable records) is `503 specification_source_unavailable`,
with `Retry-After: 1` when the project control lock was busy (a retry soon can succeed). The demo
Runtime keeps its own sources; a Runtime without either still answers 503.

## Tasks page

`GET /api/specs/:specId/tasks` (`spec.view` at `specScope(projectId, specId)`, `no-store`) is the
Specification's Task inventory from one Engine read (`readExecution`, every Task):

- `groups`: the non-empty groups of the Runtime's dashboard grouping, in configured order, each
  with `id`, `name`, `summary` (`row` or `compact`: how the Overview summarizes it), `collapsed`
  (the Tasks page collapses it by default) and its rows. A row is `id`, `title`, `type`
  (`{id, title}`), `dependsOn`, `status` (the status line), `facts` (the neutral facts above) and
  `blocksSpecification: {cause}` when the Specification's current `tasks-stuck` names it. A broken
  Task has a row of what is readable of it: `id`, `title` (when its manifest is readable),
  `status` (`broken`), `broken: {reason}` and `blocksSpecification`; it is also an attention item.
- `progress`: `completed`, `total` (every Task except cancelled ones and those ended without
  completing; broken and on hold ones count), `cancelled` (also those an abandon cancelled),
  `ended` (abandoned by its own workflow, not cancelled) and `onHold`.
- `attention`: every attention item of the read, broken Tasks first, then the Specification, then
  Tasks in id order.
- `?blocking=specification` (the only search value; anything else is `400`) keeps only the Tasks
  the current `tasks-stuck` item names, in their normal groups, and adds `filter: {blocking,
matched, total}` (`total`: every row, broken ones too). The Tasks are resolved from the read, never from ids in the URL, so a stale
  link never shows stale Tasks: when nothing blocks any more, `groups` is empty and `matched` 0.

An unknown Specification is `404 specification_not_found`; an execution the Engine cannot read is
`503 specification_source_unavailable` (`Retry-After: 1` when the lock was busy). The demo Runtime
has no Tasks page (503).

### Dashboard grouping

The grouping is declarative presentation data of the Runtime
(`features/tasks/presentation/default-grouping.ts`), validated at load against its schema; no
group, label or order lives in the Engine. Each group has a predicate over facts derived from the
neutral facts: `broken`, `preparation`, `position`, `outcome`, `startable`, `startBlocked` (a
start blocker other than the status and an expected wait; a broken Task too) and `waiting` (it
waits only for dependencies that can all still complete or for an awaited process artifact). Every
listed fact of a predicate must match, and a group with a list of predicates matches when one of
them does; the first matching group wins and a Task matching none falls into `other`. Attention is
not a grouping fact.
The default, in order: Needs approval (`draft`), In progress (`ready`, run active or between
steps), Ready to start (`ready`, not started, `startable`), Cannot start (`ready`, not started,
`startBlocked`; or broken), Waiting (`ready`, not started, `waiting`), On hold, Done (completed; compact),
Cancelled (compact, collapsed), Ended (abandoned by its own workflow; compact, collapsed). A
per-project or per-user grouping can replace it later as a value of the same schema.

### Attention items

An attention item (`WorkflowAttentionItem`) is derived on every read and never stored: `subject`,
`step` and `stepTitle` (absent when no step resolves), `reason` (a stable code), `actor` (`owner`;
`agent` is reserved), `action` (the primary action: `start-step`, `return-to-step`,
`configure-archetype`, `review-tasks`, `restore-task`, `confirm-definition`, `edit-context`,
`edit-dependencies`, `open-project-settings`, `cancel-task`, `satisfy-gate`), `secondaryAction`
(an alternative, for example `cancel-task`), a display-only English `message`, and for `task-escalated`,
`tasks-stuck` and `dependency-unsatisfiable` the Tasks it names (`taskIds`; `tasks-stuck` also
`blocking: [{taskId, cause}]` with `cause` `draft`, `on-hold`, `broken` or
`dependency-unsatisfiable`). The rules are the
[workflow kernel's](../../architecture/workflow/workflow-kernel.md#continuation-and-attention).

## Task commands

The owner creates, edits, removes and decides the status of a Task through the Engine's Task use
cases, with `spec.manage` at `specScope(projectId, specId)`, checked before the body is read. The
actor is always the caller, recorded as `{ class: 'human', details: { actorId, trust } }`: the
authenticated subject with `trust: 'authenticated'`, the trusted local identity (no local user) as
`runtime:trusted-local` with `trust: 'local'` (the same `ownerActorOf` as the workflow action
routes). A body that names an actor, an executor or a type change fails validation (`400`). Every
answer is `Cache-Control: no-store`.

| Operation                                                    | Body / query                                                                                               | Success                  |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------ |
| `POST /api/specs/:specId/tasks`                              | `taskId`, `title`, `type`, optional `summary`, `dependsOn`, `context`, `document`                          | `201 TaskChangeResult`   |
| `PATCH /api/specs/:specId/tasks/:taskId`                     | `expectedRevision`, optional `title`, `summary` (`null` removes), `dependsOn`, `context` (`null`: default) | `200 TaskChangeResult`   |
| `DELETE /api/specs/:specId/tasks/:taskId?expectedRevision=…` | the revision the removal was planned against                                                               | `200 { taskId }`         |
| `PUT /api/specs/:specId/tasks/:taskId/status`                | `status` (`ready`, `on-hold`, `cancelled`), optional `reason`                                              | `200 { taskId, status }` |

`TaskChangeResult` is `{ taskId, revision }`, the manifest revision for the next edit or removal. A
refusal is the shared `WorkflowError` body with the statuses of the
[workflow refusals](specification-workflow.md#refusals): for example `409
WORKFLOW_TASK_REVISION_CONFLICT` for a stale `expectedRevision`, and `422
WORKFLOW_TASK_CONTEXT_UNRESOLVED` with `details.unresolved` naming each context entry that does not
resolve. A reference entry with `artifact: true` is a process artifact: accepted while missing
(awaited). The context lists the Task's **inputs**; what the Task produces is a gate (an exit gate on
the producing step, an entry gate on the consuming step), so a required `task-document` artifact is
refused with `422 WORKFLOW_INPUT_INVALID` and `details.invalidContext [{index, key, reason:
required-own-artifact}]` (an optional one is allowed). A `project-document` context reference resolves against the project documentation the
Runtime serves (`/api/docs/`), read once per request. The documents of a Task are the
[Task document routes](specification-documents.md#task-documents); a Task document save is a
document operation of its Specification, so its status is read at
`GET /api/specs/:specId/document-operations/:operationId`.

## Versioned document read

Documents owns the current response `{ id, title, content, revision }`. Retain the existing
unversioned read for callers explicitly requesting latest. Add optional `revision` query for an
exact body, with the same 1–1000 character opaque string bounds as page token syntax. An omitted
revision means latest; a supplied revision means exactly that revision, never fallback to latest.

For a supplied revision: authorized document absent -> existing 404; known document but requested
version unavailable -> 409 `{ "error": "document_revision_unavailable" }`; reader unavailable ->
existing 503; denied -> existing 403. A successful response's revision equals the requested value.
The new error/schema is Documents-owned and additive. No comparison of a latest body after it has
already been exposed can substitute for an exact-version application operation.

Task/current and historical document targets carry the recorded revision. Update the Document UI
client/query key to send and cache by that revision. Historical bodies cannot silently follow a
changed Markdown file. Image/archive/report readers are not invented by this migration.

## Production admission evidence

Before enabling each project reader, demonstrate its real owner guarantees: correct project/spec/
workspace binding; safe non-mutating read; pinned definition/attempt identity; stable page order and
continuation; current authorization; supported exact counts; versioned body access where advertised.

Demo can implement the same application ports with explicit in-memory source versions and test
collections. Its successful requests prove transport composition only. They do not certify Engine
atomic reads, an external-agent managed Session, production policy-bound paging or filesystem
recovery. No project reader means unavailable without demo fallback.
