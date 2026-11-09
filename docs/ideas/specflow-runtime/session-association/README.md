---
id: ideas.specflow-runtime.session-association
type: architecture
title: Session association registry, Session list and Specification Session integration (stage 3)
status: current
scope: specflow
areas: [ai, runtime, server, security, ui]
tags: [sessions, associations, authorization, navigation, session-list, workspace, planning]
read_when:
  - asking why the Session-to-Specification/Task association is designed the way it is
  - changing the association storage, the composed create, the Session scope or spec.start-session
  - picking up a stage 3 follow-up (execute-write with specId, Task identity, Engine Task source)
summary: >
  Decision record of stage 3 (owner decisions 2026-11-08, delivered in PR #126). Sessions stay
  independent; a separate durable association registry in the Session SQLite records which
  Specification (and Tasks) a Session belongs to, is written atomically by the composed create,
  backs the SessionReferenceOwner seam, and gives every Session capability except execute-write one
  Spec-bearing scope, so granular role capabilities at {specId} apply to that Specification's
  Sessions. Keeps the decisions, options, rationale and open follow-ups; the contracts live in the
  Sessions API, storage, authorization and workspace documents.
related:
  - ideas.specflow-runtime.session-ui-integration.plan
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

# Session association registry and Session list (stage 3)

**Status:** accepted by the owner on 2026-11-08 ([section 1](#1-owner-decisions-2026-11-08)) and
delivered in PR #126 (branch `feat/session-ui-integration`, T1-T12,
[delivery record](../session-ui-integration/plan.md#stage-3-session-associations-delivered-in-pr-126)).
This is the decision record. The exact contracts live in their owning documents
([section 6](#6-contracts-owning-documents)); this file does not restate them. The D10 UX items are
decided in the [Session association UX](../../specflow-ui/session-association-ux/README.md).

Owner direction: Sessions stay independent of Specification, Task and Workflow (the principle
restated in commit `8502503b`). A **separate** durable registry records "Session X belongs to
Specification/Task Y". It is written when a Session is started from a context and backs the existing
`SessionReferenceOwner` seam.

## 1. Owner decisions (2026-11-08)

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Storage: sidecar association tables in `sessions.sqlite`, owned by an association module outside the core aggregates; list projection columns on `sessions`                                                                                                                                                                                                                                                                                                                                               |
| D2  | At most one home Specification per Session, immutable; Tasks append-only within it (orchestrator only); no reassign/unlink                                                                                                                                                                                                                                                                                                                                                                                |
| D3  | **Granular authorization.** An associated Session's scope is `{projectId, specId, sessionId}` for every Session capability (view, manage, delete, view-provider-limits) and create-from-Specification uses `{projectId, specId}`. What a Specification-scoped user may do follows only from the granular capabilities their role carries. **Exception:** `session.execute-write` never carries `specId` until D8 is solved                                                                                |
| D4  | Composed `POST /api/specs/:specId/sessions`, atomic; requires the new granular capability **`spec.start-session`** at `{specId}` plus `session.create`; added to the built-in `developer` and `admin` roles. `CreateSession` unchanged                                                                                                                                                                                                                                                                    |
| D5  | No cascade on Specification/Task removal; association kept and read as `missing`; the Engine check is time-of-check only                                                                                                                                                                                                                                                                                                                                                                                  |
| D6  | Archived Sessions stay associated; hidden from section, navigator and default list; listable via filter                                                                                                                                                                                                                                                                                                                                                                                                   |
| D7  | No association backfill (existing Sessions are standalone); list projection columns backfilled once by the schema migration                                                                                                                                                                                                                                                                                                                                                                               |
| D8  | Provider `cwd` unchanged in stage 3 (the Runtime's whole verified workspace); a Specification's own worktree comes with the managed execution handshake                                                                                                                                                                                                                                                                                                                                                   |
| D9  | Contract accepts `taskIds`; no Task-context start UI until a UX contract places one                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D10 | **Resolved 2026-11-08** by the [Session association UX contract](../../specflow-ui/session-association-ux/README.md): standalone Sessions are removed from the UI (no UI entry to `/sessions/new`, which redirects to `/`; existing standalone Sessions by direct link only; the API stays); delete goes to the Specification's Sessions list or `/`; the Specification Sessions list is paged from `GET /api/sessions`; Session status is Session readiness only; label "associated", never "working on" |
| D11 | Demo: port, association read and section from the catalogue; no demo managed Sessions                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D12 | Workspace section: at most 100 rows with `hasMore`; recommended Session = attention, then active, then most recent; `WorkspaceSession.title` optional with the UI untitled label                                                                                                                                                                                                                                                                                                                          |
| D13 | Slug identity accepted in stage 3 (a reused id reads as the associated object); an immutable Engine identity is pinned once the Task resource introduces one                                                                                                                                                                                                                                                                                                                                              |
| -   | Internal pre-production project: no release notes or compatibility notices; only the technically required schema migration                                                                                                                                                                                                                                                                                                                                                                                |

## 2. Problem (observed facts before PR #126)

| #   | Fact                                                                                                                                                                                                                                                                                                                                                                | Evidence                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | No durable Session-to-Specification association exists in project mode. `SessionReferenceOwner.resolve` is implemented only by the demo catalogue; the project Runtime passes `dependencies.sessions?.references`, which nothing sets, so every Session reference in Specification and Task reads resolves to `null` and is hidden.                                 | `features/sessions/reference-owner.ts`, `sessions/demo/references.ts`, `server/app.ts` (`sessionReferences`)                                                                     |
| P2  | There is no Session list. The store protocol has no list operation; the HTTP surface has only per-Session routes.                                                                                                                                                                                                                                                   | `sessions/persistence/protocol.ts`, `sessions/http/routes.ts`                                                                                                                    |
| P3  | The project-mode workspace `sessions` section and the `startSession` action are `not_implemented`; the Specification New Session route is demo-only and a project Runtime shows "unavailable".                                                                                                                                                                      | `specs/workspace/read-workspace.ts`, `specs/workspace/engine-repository.ts`, `specs/creation/new-session/NewSessionScreen.tsx`                                                   |
| P4  | Authorization scopes disagree. Session routes require `session.*` at store-derived `{projectId, sessionId}`; Specification and Task reads filter Session references with `session.view` at `{specId, sessionId}`. Under directional coverage a `{projectId}` grant covers the first but not the second, and a `{specId}` grant covers the second but not the first. | `sessions/http/authorization.ts`, `specs/workspace/read-authorized-workspace.ts`, `tasks/reads/visibility.ts`                                                                    |
| P5  | The Session Context loses the Specification after a reload. The pinned Specification is kept only in an in-memory, per-page-load map; otherwise the route falls back to scope `unknown / not-provided`. The view model is documented as "NOT a backend contract".                                                                                                   | `sessions/start/handoff/startedSession.ts`, `managed/context/sessionContextTypes.ts`, `managed/routes.tsx`                                                                       |
| P6  | The navigator knows a Specification only from its own route. On `/sessions/:sessionId` it drops Overview, Sessions, Tasks and Documents; its Session list comes from the workspace `sessions` section of the route's Specification. The UX audit rejected a "last opened Specification" cache as the fix.                                                           | `app/navigation/useSessionDisclosure.ts`, `sessions/navigation/summary.ts`, `specs/read-model/mapWorkspaceResponse.ts`; App Shell decision record (`shell-geometry.md`, PR #124) |
| P7  | Existing project-mode Sessions were all created from `/sessions/new`, which carries no Specification. They are genuinely standalone, so no association needs to be recovered.                                                                                                                                                                                       | `ManagedSessionStart.tsx` ("no Specification"), `CreateSessionSchema` has no context field                                                                                       |
| P8  | Roles are fixed flat capability sets in the Runtime composition root (`viewer`, `developer`, `admin`); `developer` holds `session.create`, `session.manage`, `session.delete` and `session.execute-write`.                                                                                                                                                          | `server/app.ts` (`specFlowRoleCapabilities`), `features/auth/authorization/roles.ts`                                                                                             |

The delivery record lists this as stage 3 ([plan](../session-ui-integration/plan.md#open-follow-ups)).

## 3. Goals and non-goals

**Goals**

- G1. A durable association registry, separate from the Session core records: one optional home
  Specification per Session plus the Tasks of that Specification the Session belongs to.
- G2. Atomic creation of a Session together with its association when started from a Specification
  (or Task) context.
- G3. One authorization scope builder for a Session, used by Session routes and by Specification/Task
  projections alike (fixes P4), with granular capabilities deciding what each role may do.
- G4. A bounded, authorized Session list API, filterable by Specification, Task, standalone and
  archive state.
- G5. The project-mode workspace `sessions` section, `recommendedSessionId` and `startSession` action
  backed by real data.
- G6. A Session association read for the Session Context and the navigator, so both survive reloads
  and deep links without a client cache.
- G7. Fit the future workflow engine: workflow-launched Sessions (plan 06 F01/F12) register through the
  same application operation, without the registry becoming workflow authority.

**Non-goals (stage 3)**

- N1. No change to the Session core aggregate, Turn lifecycle or `CreateSessionSchema` semantics.
- N2. No current execution scope. "Working on TASK-03" stays an Engine-owned fact (active attempt and
  its executor); the registry records contextual association only
  ([AI Session UX](../../../product/specflow/ui/ai-session-ux.md#session-association-vs-current-execution)).
- N3. No change to where a Session executes (D8). Running a Specification's Session inside that
  Specification's worktree belongs to the managed execution handshake
  ([managed-session-integration](../../specflow-engine/managed-session-integration.md)).
- N4. No reassign, unlink or multi-Specification Sessions (D2). No cascade from Specification/Task
  removal to Sessions.
- N5. No new UX surfaces beyond those already accepted (D10).
- N6. No demo-mode managed Sessions (still unplaced by a UX contract).
- N7. No configurable custom roles: the role catalogue stays Runtime-defined. Capabilities are kept
  granular (no capability implies another), so any future role, built-in or configured, is composed
  from them without changing this design.

## 4. Concepts and invariants

- **Association**: `{ sessionId, specId, taskIds[], origin, createdAt, createdBy }`. Absent means the
  Session is **standalone**, a valid Session in its own right.
- **Home Specification**: at most one per Session, fixed at Session creation, never changed (I1).
- **Task associations**: a set of `taskId` within the home Specification; append-only (I2). A Task
  association without a home Specification is impossible (I3, schema: Task rows reference the
  association row).
- **Origin**: `user` (started from a context in the UI/API) or `workflow` (future: started or reused by
  the continuation orchestrator). Origin is provenance, not authority.
- **Not execution**: an association never proves what the current Turn executes (I4). Engine attempt
  executor identity stays the only authority for that (plan 06, `WORKFLOW_EXECUTOR_NOT_ALLOWED`).
- **Verified at write**: `specId` exists and `taskIds` belong to it, checked through the Engine before
  the write (I5). The check is time-of-check only: a Specification or Task removed right after it is
  handled by the `missing` read state (D5), not by a cross-store transaction. Atomicity covers
  Session plus association rows only. The registry never infers an association from a URL, title,
  file path or message.
- **Identity pinned**: the registry stores the Engine's canonical Specification and Task ids. Today
  these are slugs that can be reused after a removal (D13).
- **Scope follows association**: a Session's scope is derived from the store, including its home
  `specId`; because I1 makes the home immutable, a Session's scope never changes (I6).
- **Association is a sharing act**: it makes the Session reachable for every holder of a Session
  capability at the Specification, so creating one needs the explicit `spec.start-session`
  capability (D4).

I1-I3 and I6 are enforced by schema and operations (no operation updates `spec`); I5 by the composed
create operation; I4 by keeping execution facts out of the registry types.

## 5. Options considered

### 5.1 Storage location (decided: A)

| Option                                                                     | For                                                                                                                                                                                                | Against                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Sidecar tables in `sessions.sqlite`**, owned by an association module | Atomic Session+association create and delete in one Worker transaction; existing owner/epoch fence, idempotency and delete map apply; `identity` returns `specId` in the same lookup; indexed list | Opaque `specId`/`taskId` strings live in the Session database ("associations live above the core" becomes "outside the core aggregates, in the same database"); the offline Engine CLI cannot read associations                 |
| B. Separate SQLite file                                                    | Clean physical layering                                                                                                                                                                            | No atomic create/delete (multi-file commits are not atomic in WAL mode); two-phase intent and orphan recovery                                                                                                                   |
| C. Engine project store (JSON)                                             | Engine owns Specification/Task identity; the CLI could see associations                                                                                                                            | Engine would own Runtime Session facts it cannot observe, contradicting [ownership and state](../../specflow-engine/ownership-and-state.md); no indexed list; cross-process lock per create; dangling rows after Session delete |
| D. Git-tracked Specification manifest                                      | Shared with collaborators                                                                                                                                                                          | Sessions are local, per-host and deletable; commits local identifiers                                                                                                                                                           |

### 5.2 Creation path (decided: A)

| Option                                                   | Assessment                                                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **A. Composed route `POST /api/specs/:specId/sessions`** | Keeps `POST /api/sessions` and `CreateSession` independent; atomic; the create idempotency key covers both                    |
| B. Optional `context` field on `CreateSession`           | Puts Specification identity into the core command; contradicts N1                                                             |
| C. Create, then a separate "link" command                | Crash window leaves an unintended standalone Session; needs recovery; offers a relation-mutation API the storage doc excluded |

The core coordinator receives the association as an opaque sidecar payload and writes it verbatim in
the create transaction; it never reads it back for lifecycle decisions.

### 5.3 Authorization (decided: granular, with the execute-write exception)

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
which the UI handles explicitly (UX §3). Selecting by `specId` requires `spec.view` because a page
of matching rows reveals which Sessions belong to the Specification.

## 6. Contracts (owning documents)

| Subject                                                                                       | Owning document                                                                                                           |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Composed create, association read, Session list, error codes, Session scope rule              | [Sessions API](../../../reference/api/sessions.md#session-list-association-read-and-composed-create)                      |
| Schema v3, association tables, store operations, delete map, "Authorization and associations" | [Session storage and lifecycle](../../../architecture/ai/session-storage-and-lifecycle.md#authorization-and-associations) |
| `spec.start-session`, `specScope`/`sessionScope`, execute-write exception, coverage table     | [Runtime authorization](../../../architecture/runtime/auth/authorization.md#specflow-required-scopes)                     |
| Role list and what an assignment scope covers                                                 | [Authorization configuration](../../../reference/configuration/authorization.md)                                          |
| Project Sessions section, `startSession`, `recommendedSessionId`, optional title, freshness   | [Specification Workspace API](../../../reference/api/specification-workspace.md#project-sessions-section)                 |
| Session reference scope in Task reads                                                         | [Task reads](../../../reference/api/task-reads.md#authorization-and-typed-application-outcomes)                           |
| Context from the association read, delete destination, not-found action, archive copy         | [Full Session — Session actions](../../../product/specflow/ui/full-session.md#session-actions)                            |
| UI starts only from a Specification, `/sessions/new` redirect, navigator Specification        | [Interaction model](../../../product/specflow/ui/interaction-model.md#starting-a-session-and-the-navigator)               |
| Specification Sessions list                                                                   | [Specification Sessions list UI spec](../../specflow-ui/screens/specification-sessions-list-ui-spec.md)                   |
| Session status ownership                                                                      | [AI Session UX](../../../product/specflow/ui/ai-session-ux.md#session-status-ownership-accepted-2026-11-08)               |

## 7. Fit with the deterministic workflow engine

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
  execution (I4).
- Task resource (`task-resource-and-context`, branch `feat/workflow-kernel`): Tasks are `(specId,
taskId)`; Task lifecycle states (`cancelled`, `on-hold`) do not change associations.

## 8. Open follow-ups

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
