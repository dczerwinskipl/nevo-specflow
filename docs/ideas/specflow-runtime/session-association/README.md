---
id: ideas.specflow-runtime.session-association
type: architecture
title: Session association registry, Session list and Specification Session integration (stage 3)
status: draft
scope: specflow
areas: [ai, runtime, server, security, ui]
tags: [sessions, associations, authorization, navigation, session-list, workspace, planning]
read_when:
  - asking why the Session-to-Specification/Task association is designed the way it is
  - changing the association storage, the composed create, the Session scope or spec.start-session
  - picking up a stage 3 follow-up (execute-write with specId, Task identity, Engine Task source)
summary: >
  Decision record (a proposal, not a current rule) of stage 3 (owner decisions 2026-11-08, delivered in PR #126):
  a separate durable Session association registry in the Session SQLite, the composed create from a
  Specification, one Spec-bearing Session scope with the execute-write exception. Keeps the
  decisions, the options considered, the fit with the workflow engine and the open follow-ups (D8
  execute-write with specId, D13 Task identity, the project-mode Engine Task source); the contracts
  live in the Sessions API, storage, authorization and workspace documents.
related:
  - ideas.specflow-ui.session-association-ux
  - reference.api.sessions
  - architecture.ai.session-storage-and-lifecycle
  - architecture.runtime.authorization
  - reference.api.specification-workspace
  - reference.api.task-reads
  - ideas.specflow-engine.managed-session-integration
  - ideas.specflow-engine.ownership
  - product.specflow.ui.ai-session-ux
  - ideas.specflow-ui.full-session-screen-structure
  - product.specflow.ui.full-session
---

# Session association registry and Session list (stage 3) — decision record

**A proposal, not a current rule.** Stage 3 was accepted by the owner on 2026-11-08
([section 1](#1-owner-decisions-2026-11-08)) and delivered in PR #126. This record keeps the
decisions, the options considered and the open follow-ups. The exact contracts (association model
and invariants, storage, scopes, routes) live in their owning documents
([section 3](#3-contracts-owning-documents)) and win on any difference. The UX items of D10 are
recorded in the [Session association UX decisions](../../specflow-ui/session-association-ux/README.md).

Owner direction: Sessions stay independent of Specification, Task and Workflow. A **separate**
durable registry records "Session X belongs to Specification/Task Y"; it is written when a Session
is started from a context and backs the existing `SessionReferenceOwner` seam. An association is
context, never current execution: the Engine attempt executor stays the only authority for what a
Session executes.

## 1. Owner decisions (2026-11-08)

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Storage: sidecar association tables in `sessions.sqlite`, owned by an association module outside the core aggregates; list projection columns on `sessions`                                                                                                                                                                                                                                                                |
| D2  | At most one home Specification per Session, immutable; Tasks append-only within it (orchestrator only); no reassign/unlink                                                                                                                                                                                                                                                                                                 |
| D3  | **Granular authorization.** An associated Session's scope is `{projectId, specId, sessionId}` for every Session capability (view, manage, delete, view-provider-limits) and create-from-Specification uses `{projectId, specId}`. What a Specification-scoped user may do follows only from the granular capabilities their role carries. **Exception:** `session.execute-write` never carries `specId` until D8 is solved |
| D4  | Composed `POST /api/specs/:specId/sessions`, atomic; requires the new granular capability **`spec.start-session`** at `{specId}` plus `session.create`; added to the built-in `developer` and `admin` roles. `CreateSession` unchanged                                                                                                                                                                                     |
| D5  | No cascade on Specification/Task removal; association kept and read as `missing`; the Engine check is time-of-check only                                                                                                                                                                                                                                                                                                   |
| D6  | Archived Sessions stay associated; hidden from section, navigator and default list; listable via filter                                                                                                                                                                                                                                                                                                                    |
| D7  | No association backfill (existing Sessions are standalone); list projection columns backfilled once by the schema migration                                                                                                                                                                                                                                                                                                |
| D8  | Provider `cwd` unchanged in stage 3 (the Runtime's whole verified workspace); a Specification's own worktree comes with the managed execution handshake                                                                                                                                                                                                                                                                    |
| D9  | Contract accepts `taskIds`; no Task-context start UI until a UX contract places one                                                                                                                                                                                                                                                                                                                                        |
| D10 | **Resolved 2026-11-08** by the [Session association UX decisions](../../specflow-ui/session-association-ux/README.md) (U1-U6): standalone Sessions are removed from the UI; delete goes to the Specification's Sessions list or `/`; the Specification Sessions list is paged from `GET /api/sessions`; Session status is Session readiness only; label "associated", never "working on"                                   |
| D11 | Demo: port, association read and section from the catalogue; no demo managed Sessions                                                                                                                                                                                                                                                                                                                                      |
| D12 | Workspace section: at most 100 rows with `hasMore`; recommended Session = attention, then active, then most recent; `WorkspaceSession.title` optional with the UI untitled label                                                                                                                                                                                                                                           |
| D13 | Slug identity accepted in stage 3 (a reused id reads as the associated object); an immutable Engine identity is pinned once the Task resource introduces one                                                                                                                                                                                                                                                               |
| -   | Internal pre-production project: no release notes or compatibility notices; only the technically required schema migration                                                                                                                                                                                                                                                                                                 |

## 2. Options considered

### 2.1 Storage location (decided: A)

| Option                                                                     | For                                                                                                                                                                                                | Against                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Sidecar tables in `sessions.sqlite`**, owned by an association module | Atomic Session+association create and delete in one Worker transaction; existing owner/epoch fence, idempotency and delete map apply; `identity` returns `specId` in the same lookup; indexed list | Opaque `specId`/`taskId` strings live in the Session database ("associations live above the core" becomes "outside the core aggregates, in the same database"); the offline Engine CLI cannot read associations                 |
| B. Separate SQLite file                                                    | Clean physical layering                                                                                                                                                                            | No atomic create/delete (multi-file commits are not atomic in WAL mode); two-phase intent and orphan recovery                                                                                                                   |
| C. Engine project store (JSON)                                             | Engine owns Specification/Task identity; the CLI could see associations                                                                                                                            | Engine would own Runtime Session facts it cannot observe, contradicting [ownership and state](../../specflow-engine/ownership-and-state.md); no indexed list; cross-process lock per create; dangling rows after Session delete |
| D. Git-tracked Specification manifest                                      | Shared with collaborators                                                                                                                                                                          | Sessions are local, per-host and deletable; commits local identifiers                                                                                                                                                           |

### 2.2 Creation path (decided: A)

| Option                                                   | Assessment                                                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **A. Composed route `POST /api/specs/:specId/sessions`** | Keeps `POST /api/sessions` and `CreateSession` independent; atomic; the create idempotency key covers both                    |
| B. Optional `context` field on `CreateSession`           | Puts Specification identity into the core command, which stage 3 leaves unchanged                                             |
| C. Create, then a separate "link" command                | Crash window leaves an unintended standalone Session; needs recovery; offers a relation-mutation API the storage doc excluded |

The core coordinator receives the association as an opaque sidecar payload and writes it verbatim in
the create transaction; it never reads it back for lifecycle decisions.

### 2.3 Authorization (decided: granular, with the execute-write exception)

Rejected alternatives: view-only Specification coverage hardcoded in the scope builder (hides a policy
decision inside code instead of in role capabilities); keeping `{projectId, sessionId}` everywhere
(Specification-scoped users never see their Specification's Sessions); copying grants at association
time (grant mutation and revocation sync).

**Security reason for the execute-write exception:** until D8, every provider runs with the
Runtime's whole verified project workspace as `cwd`, not the Specification's worktree. A grant scoped
to one Specification must therefore never admit writes that can reach every Specification and the
project's own files.

**Why a separate capability (D4):** an association makes the Session reachable for every holder of a
Session capability at the Specification, so creating one is a sharing act; `spec.view` is not enough.
Capabilities stay granular (none implies another), so any future role is composed from them without
changing this design.

**List paging (D12 and the list):** a keyset on an immutable creation sequence with a bounded scan
budget, rather than offset paging or a count, keeps every request bounded while per-row
authorization skips rows; the price is that a page may be short or empty while a cursor remains,
which the UI handles explicitly ([Sessions list, Paging](../../../product/specflow/ui/specification-sessions.md#paging)). Selecting by `specId` requires `spec.view` because a page
of matching rows reveals which Sessions belong to the Specification.

## 3. Contracts (owning documents)

| Subject                                                                                       | Owning document                                                                                                           |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Composed create, association read, Session list, error codes, Session scope rule              | [Sessions API](../../../reference/api/sessions.md#session-list-association-read-and-composed-create)                      |
| Schema v3, association tables, store operations, delete map, "Authorization and associations" | [Session storage and lifecycle](../../../architecture/ai/session-storage-and-lifecycle.md#authorization-and-associations) |
| `spec.start-session`, `specScope`/`sessionScope`, execute-write exception, coverage table     | [Runtime authorization](../../../architecture/runtime/auth/authorization.md#specflow-required-scopes)                     |
| Role list and what an assignment scope covers                                                 | [Authorization configuration](../../../reference/configuration/authorization.md)                                          |
| Project Sessions section, `startSession`, `recommendedSessionId`, optional title, freshness   | [Specification Workspace API](../../../reference/api/specification-workspace.md#project-sessions-section)                 |
| Session reference scope in Task reads                                                         | [Task reads](../../../reference/api/task-reads.md#authorization-and-typed-application-outcomes)                           |
| Context from the association read                                                             | [Full Session — Context](../../../product/specflow/ui/full-session.md#context)                                            |
| Delete destination, not-found action, archive copy                                            | [Full Session — Session actions](../../../product/specflow/ui/full-session.md#session-actions)                            |
| UI starts only from a Specification, `/sessions/new` redirect, navigator Specification        | [Interaction model](../../../product/specflow/ui/interaction-model.md#starting-a-session-and-the-navigator)               |
| Specification Sessions list                                                                   | [Specification Sessions list](../../../product/specflow/ui/specification-sessions.md)                                     |
| Session status ownership                                                                      | [AI Session UX](../../../product/specflow/ui/ai-session-ux.md#session-status-ownership-accepted-2026-11-08)               |

## 4. Fit with the deterministic workflow engine

- Plan 06 F01 (continuation orchestrator) creates Sessions through an **internal application
  operation**, not HTTP and not the raw store `create`. Its actor is a Runtime-owned workflow actor
  (an audit key, not a user); authority comes from the Engine continuation decision and admission,
  not from user grants. Its idempotency key derives from the launch intent `(subject, step,
attempt + 1)`. The Engine attempt executor stays authoritative for who may resume/finish.
- Only that orchestrator calls the store's `associate-tasks`; users cannot append Tasks. It is
  refused for a Session of another Specification or a standalone one (the orchestrator then starts a
  fresh Session).
- F12 (selected Tasks, batch): one Session may cover several Tasks of one Specification;
  cross-Specification batches are not representable (D2), matching "one spec = one worktree".
- F13 (stop a Session on return) uses the Engine's `attempt -> sessionId`; the registry is not
  consulted.
- Attention: Engine require-attention items stay per subject and are composed by Specs; the Session
  list carries only Session-derived readiness. The registry stores neither attention nor current
  execution.
- Task resource (`task-resource-and-context`, branch `feat/workflow-kernel`): Tasks are `(specId,
taskId)`; Task lifecycle states (`cancelled`, `on-hold`) do not change associations.

## 5. Open follow-ups

- **D8, execute-write with `specId`:** `session.execute-write` gains the `specId` dimension only
  after the managed execution handshake runs a Specification's Session in that Specification's own
  worktree ([managed-session-integration](../../specflow-engine/managed-session-integration.md)).
  Until then a `{specId}` grant never admits write-mode execution.
- **D13, Task identity pinning:** the registry stores Engine slugs, which can be reused after a
  removal (a reused id reads as the associated object). Pin an immutable Engine identity once the
  Task resource introduces one.
- **Engine Task source for `taskIds` in project mode:** the association targets read Tasks through
  the Tasks feature's definition source, which the project Runtime does not wire
  (`dependencies.tasks.definitions` is unset outside tests and demo). In project mode a composed
  create with `taskIds` therefore answers `503 specification_source_unavailable` and an associated
  Task would read as `unavailable`. The UI sends no `taskIds` (D9), so nothing user-facing breaks
  today; a Task-context start needs that source and a UX contract.
