---
id: ideas.specflow-runtime.session-association
type: architecture
title: Session association registry, Session list and Specification Session integration (stage 3)
status: current
scope: specflow
areas: [ai, runtime, server, security, ui]
tags: [sessions, associations, authorization, navigation, session-list, workspace, planning]
read_when:
  - planning or implementing the durable Session-to-Specification/Task association
  - adding a Session list/catalogue API or the project-mode workspace Sessions section
  - changing the Session authorization scope or the spec.start-session capability
  - making the Session Context or the navigator keep the Specification after a reload
summary: >
  Accepted stage 3 design (owner decisions 2026-11-08, delivered in PR #126). Sessions stay
  independent; a separate durable association registry in the Session SQLite records which
  Specification (and Tasks) a Session belongs to, is written atomically when a Session is started
  from a Specification, backs the SessionReferenceOwner seam, and gives every Session capability
  except execute-write one Spec-bearing scope, so granular role capabilities at {specId} apply to
  that Specification's Sessions. Also defines spec.start-session, the bounded Session list, the
  project-mode workspace Sessions section, the association read and the UI integration tasks.
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
  - ideas.specflow-ui.screens.full-session
---

# Session association registry and Session list (stage 3)

**Status:** accepted by the owner on 2026-11-08 ([section 1](#1-owner-decisions-2026-11-08)) and
implemented in PR #126 (branch `feat/session-ui-integration`). This document is the design and
decision record; while PR #126 lands, the exact contracts move into their owning homes
([section 15](#15-documentation-homes)) and this document links to them instead of restating them.

**Readiness:** ready for implementation. The UI task T10 implements only behaviour that existing UX
contracts already place; the UX items in D10 stay with the UX designer and keep today's behaviour
until decided.

Owner direction: Sessions stay independent of Specification, Task and Workflow (the principle
restated in commit `8502503b`). A **separate** durable registry records "Session X belongs to
Specification/Task Y". It is written when a Session is started from a context and backs the existing
`SessionReferenceOwner` seam.

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
| D10 | To the UX designer: standalone Session list, post-delete/archive destination, Sessions List paging, Session status when readiness and the Engine attempt disagree; label "associated", never "working on". Until decided: `/sessions/new` after delete, no global list                                                                                                                                                     |
| D11 | Demo: port, association read and section from the catalogue; no demo managed Sessions                                                                                                                                                                                                                                                                                                                                      |
| D12 | Workspace section: at most 100 rows with `hasMore`; recommended Session = attention, then active, then most recent; `WorkspaceSession.title` optional with the UI untitled label                                                                                                                                                                                                                                           |
| D13 | Slug identity accepted in stage 3 (a reused id reads as the associated object); an immutable Engine identity is pinned once the Task resource introduces one                                                                                                                                                                                                                                                               |
| -   | Internal pre-production project: no release notes or compatibility notices; only the technically required schema migration                                                                                                                                                                                                                                                                                                 |

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

## 6. Authorization model (D3, D4)

### 6.1 Scope rule

| Capability                                                                         | Standalone Session       | Associated Session                     |
| ---------------------------------------------------------------------------------- | ------------------------ | -------------------------------------- |
| `session.view`, `session.manage`, `session.delete`, `session.view-provider-limits` | `{projectId, sessionId}` | `{projectId, specId, sessionId}`       |
| `session.create` (standalone, `POST /api/sessions`)                                | `{projectId}`            | not applicable                         |
| `session.create` (from a Specification)                                            | not applicable           | `{projectId, specId}`                  |
| `spec.start-session` (from a Specification)                                        | not applicable           | `{specId}`                             |
| `session.execute-write` (create in write mode)                                     | `{projectId}`            | `{projectId}`                          |
| `session.execute-write` (Turn start/respond in write mode)                         | `{projectId, sessionId}` | `{projectId, sessionId}` (no `specId`) |

**Security reason for the execute-write exception:** until D8, every provider runs with the
Runtime's whole verified project workspace as `cwd`, not the Specification's worktree. A grant scoped
to one Specification must therefore never admit writes that can reach every Specification and the
project's own files. `execute-write` gains the `specId` dimension only when the managed execution
handshake confines a Specification's Session to that Specification's worktree.

Directional coverage (unchanged resolver) then gives:

| Grant scope        | Standalone Session | Associated Session of S | Create from S | Write execution                    |
| ------------------ | ------------------ | ----------------------- | ------------- | ---------------------------------- |
| `{}`               | yes                | yes                     | yes           | yes                                |
| `{projectId: P}`   | yes                | yes                     | yes           | yes                                |
| `{specId: S}`      | no                 | yes                     | yes           | no                                 |
| `{sessionId: sid}` | yes                | yes                     | no            | yes, that Session only (unchanged) |

"yes" means: the capabilities the assigned role carries apply there; nothing beyond them.

### 6.2 New capability and built-in roles

- `spec.start-session` is added to `SpecCapabilities` (`@nevo/specflow-contracts/specs`). It grants
  only "associate a new Session with this Specification"; it implies no Session capability, and no
  Session capability implies it.
- Built-in roles (`specFlowRoleCapabilities`):

| Role        | Capabilities relevant here                                                                                                            | Effect at `{specId: S}`                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `viewer`    | `spec.view`, `session.view`                                                                                                           | sees S and S's associated Sessions; cannot start, steer, archive, rename or delete                                          |
| `developer` | viewer + `spec.start-session` (new), `session.create`, `session.manage`, `session.delete`, `session.execute-write`, existing `spec.*` | starts read-only Sessions in S; views, manages and deletes all Sessions associated with S (any creator); no write execution |
| `admin`     | developer + `session.view-provider-limits`, settings and project-git capabilities                                                     | as developer, plus provider limits of S's Sessions; no write execution at `{specId}`                                        |

At `{projectId}` or global scope the roles behave as today, plus `spec.start-session` for developer
and admin. There is no creator ACL: creator stays audit metadata.

- Configuration and capability discovery expose `spec.start-session` like every other capability;
  the UI's `capabilities` projection for a Specification gains `startSession`.

### 6.3 Enforcement points

- One builder, `sessionScope(identity, capability)`, fed only by store-derived identity (`identity` /
  `identities` join the association row). Route parameters, bodies, list filters and the UI are never
  a scope source; a list filter selects, it never grants.
- Composed create: `spec.view` is not enough; it requires `spec.start-session` at `{specId}` and
  `session.create` at `{projectId, specId}`, plus `session.execute-write` at `{projectId}` for
  `workspace-write`.
- List: `session.view` in any scope, then per-row `session.view` at `sessionScope(row, 'view')` and
  per-row redaction of the association (6.4).
- SSE reauthorization and telemetry provider-limits use the same builder.

### 6.4 Redaction

- A list row's `association` names `specId`/`taskIds` only when the caller has `spec.view` at
  `{specId}`; otherwise it is `{ kind: 'restricted' }`.
- The association read checks `spec.view` at `{specId}` **before** any Engine existence lookup, so
  `forbidden` never reveals whether the Specification or a Task still exists.

## 7. Contracts

Exact schemas live in `@nevo/specflow-contracts` and the reference docs once T1/T12 land; these are
the accepted shapes. All objects are closed; optional fields are omitted rather than null.

### 7.1 Storage (schema version 3)

`sessions.ordinal` is the per-Session conversation entry counter, rewritten on every save, and
`archivedAt`, readiness, title and timestamps live only inside the JSON `data` snapshot. A list must
not decode a full snapshot per row, so v3 adds indexed projection columns, maintained by `saveSession`
in the same statement as `data`.

```sql
-- core list projection (no Specification identity here)
ALTER TABLE sessions ADD COLUMN created_seq INTEGER;  -- monotonic creation order, never rewritten
ALTER TABLE sessions ADD COLUMN archived_at TEXT;     -- mirrors SessionInfo.archivedAt
ALTER TABLE sessions ADD COLUMN readiness TEXT;       -- mirrors SessionInfo.readiness
ALTER TABLE sessions ADD COLUMN updated_at TEXT;      -- mirrors SessionInfo.updatedAt
CREATE UNIQUE INDEX sessions_created ON sessions(project, created_seq);
CREATE INDEX sessions_archived ON sessions(project, archived_at, created_seq);

-- association sidecar
CREATE TABLE session_associations(
  session TEXT PRIMARY KEY REFERENCES sessions(id),
  spec TEXT NOT NULL,             -- home Specification, immutable
  created_seq INTEGER NOT NULL,   -- copy of sessions.created_seq for the spec-ordered index
  origin TEXT NOT NULL CHECK(origin IN ('user','workflow')),
  actor TEXT NOT NULL,            -- audit only, never an ACL
  created INTEGER NOT NULL);
CREATE INDEX session_associations_spec ON session_associations(spec, created_seq);
CREATE TABLE session_association_tasks(
  session TEXT NOT NULL REFERENCES session_associations(session),
  task TEXT NOT NULL,
  origin TEXT NOT NULL CHECK(origin IN ('user','workflow')),
  added INTEGER NOT NULL,
  PRIMARY KEY(session, task));
CREATE INDEX session_association_tasks_task ON session_association_tasks(task, session);
```

Migration 2 -> 3 runs in one transaction: add the columns, create tables and indexes, backfill the
four columns by decoding each existing snapshot once (`created_seq` in `createdAt` order, ties by
rowid). Association tables start empty (P7). `initializeSessionSchema` accepts 0-3 afterwards. Both
association tables are Session-owned in `SESSION_TABLE_OWNERSHIP`. Title stays in `data`: a list page
decodes only the rows it returns.

### 7.2 Store operations

```ts
| { op: 'create'; actor: string; input: CreateSession; association?: AssociationWrite }  // opaque to the core
| { op: 'identity'; sessionId: string }        // { projectId, sessionId, specId? }
| { op: 'identities'; sessionIds: string[] }   // batch, <= 500, one indexed query
| { op: 'association'; sessionId: string }     // { specId, taskIds, origin, createdAt } | null
| { op: 'associate-tasks'; sessionId: string; specId: string; taskIds: string[]; origin: 'workflow' }
| { op: 'list'; filter: SessionListFilter; after?: number; limit: number; scanBudget: number }

type AssociationWrite = { specId: string; taskIds: string[]; origin: 'user' | 'workflow' };
```

- The create idempotency record (`request(actor, 'create', projectId, requestId, …)`) stays the single
  key for both create routes; its fingerprint hashes `{ input, association }`, so the same
  `requestId` sent standalone and from a Specification, or to two Specifications, is
  `IDEMPOTENCY_CONFLICT`.
- `associate-tasks` has no HTTP route; only the in-process workflow orchestrator calls it (section 10).
  It is refused when `specId` differs from the home (I1) or the Session is standalone.

### 7.3 Application port and scope builder

```ts
/** Owned by the association module; implemented by the store (project) or the catalogue (demo). */
export interface SessionAssociations extends SessionReferenceOwner {
  // resolve(sessionId) -> { sessionId, specId, projectId, workspaceId } | null  (existing seam)
  resolveMany(sessionIds: readonly string[]): Promise<ReadonlyMap<string, SessionIdentity>>;
  association(sessionId: string): Promise<SessionAssociation | null>;
  list(filter: SessionListFilter, page: Page): Promise<SessionListPage>;
}

/** The single scope builder; see the scope rule in section 6.1. */
export function sessionScope(identity: SessionIdentity, capability: SessionCapability) {
  if (capability === 'execute-write') {
    // Never Specification-scoped before D8: the provider cwd is the whole project workspace.
    return { projectId: identity.projectId, sessionId: identity.sessionId };
  }
  return identity.specId
    ? { projectId: identity.projectId, specId: identity.specId, sessionId: identity.sessionId }
    : { projectId: identity.projectId, sessionId: identity.sessionId };
}
```

- `resolveMany` replaces the sequential per-id `resolve` loop in `read-authorized-workspace.ts` and the
  per-link calls in `tasks/reads/visibility.ts`: one `identities` call plus one Engine
  workspace-binding read for the distinct `specId`s. The workspace contribution returns the
  store-derived identity with each row.
- `workspaceId` is the home Specification's current workspace binding, resolved at read time, not
  stored.

### 7.4 HTTP routes

| Route                                      | Owner              | Authorization                                                                                                                          |
| ------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/specs/:specId/sessions`         | Association module | `spec.start-session` at `{specId}`; `session.create` at `{projectId, specId}`; `session.execute-write` at `{projectId}` for write mode |
| `GET /api/sessions`                        | Sessions (list)    | `session.view` in any scope, then per row at `sessionScope(row, 'view')`; association redaction                                        |
| `GET /api/sessions/:sessionId/association` | Association module | `session.view` at `sessionScope`; Specification/Task facts need `spec.view` at `{specId}`                                              |
| existing `/api/sessions/:sessionId/**`     | Sessions           | unchanged capabilities, scope from `sessionScope(identity, capability)`                                                                |
| `POST /api/sessions`                       | Sessions           | unchanged: standalone create at `{projectId}`                                                                                          |

```ts
// POST /api/specs/:specId/sessions
type CreateContextSession = CreateSession & { taskIds?: string[] }; // <= 32, unique, members of specId
type CreateContextSessionResult = CreateSessionResult & { association: SessionAssociationRef };
// errors: 404 specification_not_found | 404 specification_task_not_found (unknown or foreign Task)
//         409 IDEMPOTENCY_CONFLICT (same requestId, different input or association) | existing create errors

// GET /api/sessions?specId=&taskId=&standalone=true&archived=exclude|include|only&limit=&cursor=
type SessionListFilter = {
  specId?: string; // mutually exclusive with standalone
  taskId?: string; // requires specId
  standalone?: true;
  archived: 'exclude' | 'include' | 'only'; // default exclude
};
type SessionListItem = {
  sessionId: string;
  title?: string;
  providerId: string;
  modelId?: string;
  readiness: Readiness; // as SessionInfo
  activeTurn?: { turnId: string; state: TurnState };
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  association: ListAssociation;
};
type ListAssociation =
  | { kind: 'standalone' }
  | { kind: 'specification'; specId: string; taskIds: string[] } // only with spec.view at {specId}
  | { kind: 'restricted' }; // associated, caller lacks spec.view
type SessionAssociationRef = { specId: string; taskIds: string[] };
type SessionListPage = { items: SessionListItem[]; nextCursor?: string };
```

List paging:

- Order: `created_seq` descending (keyset on the indexed column). `limit` 1..100, default 50.
- Each request scans at most 500 index rows, skipping rows the caller may not view, and stops when
  `limit` rows are filled or the budget is spent. `nextCursor` points after the last **scanned** row,
  so a page may hold fewer than `limit` items (even zero) while `nextCursor` is present.
- A caller whose `session.view` comes only from Specification-scoped grants must pass `specId`;
  without it the request is `400 SESSION_LIST_SCOPE_REQUIRED`. `standalone=true` is then empty
  (`200`, no items).
- Cursor: signed `{version, storeGeneration, projectId, filter hash, lastCreatedSeq}`, like history
  tokens; a changed filter invalidates it.

```ts
// GET /api/sessions/:sessionId/association
type SessionAssociationRead = {
  sessionId: string;
  association:
    | { kind: 'standalone' }
    | {
        kind: 'specification';
        specification: AssociatedFact<{
          specId: string;
          key?: string;
          title: string;
          collection: 'current' | 'archived';
        }>;
        tasks: AssociatedFact<{ taskId: string; key?: string; title: string }>[]; // [] when forbidden
      };
};
type AssociatedFact<T> =
  | { state: 'available'; value: T }
  | { state: 'missing'; id: string } // association exists, referenced object is gone
  | { state: 'forbidden' } // no spec.view: no id, no title, no Task list
  | { state: 'unavailable' }; // Engine source unreadable
```

The read maps one to one onto the UI `ContextFact` states (`ready`, `missing`, `unreadable`) and
`SessionScope` (`standalone`, `specification`, `task`).

### 7.5 Workspace section and actions (project mode)

- `contributions.sessions(specId)` comes from `list({specId, archived: 'exclude'})`, at most 100 rows,
  each with its store-derived identity, then `hasMore: true` when more exist (D12).
  `WorkspaceSession.status` from Session readiness only: `busy` -> `active`, `requiresAttention` ->
  `attention`, `ready` -> `quiet`, `unavailable` -> `unknown`; `taskIds` from the association.
- `WorkspaceSession.title` becomes optional; the server never invents a title.
- `recommendedSessionId`: first non-archived associated Session by attention, then active, then most
  recent `updatedAt`.
- `actions.startSession`: available when the Sessions feature is enabled, a provider is usable and the
  caller has `spec.start-session` at `{specId}` and `session.create` at `{projectId, specId}`; otherwise
  `reason` (`sessions_disabled`, `no_provider`, `forbidden`).
- Freshness: the workspace `revision` is the Engine `sourceRevision` and does not change when Sessions
  change. Clients must not treat an unchanged `revision` as an unchanged Sessions section; the UI
  invalidates the workspace query on Session create/archive/unarchive/delete and on the Session
  events it already receives.

## 8. Lifecycle

| Event                                    | Association behaviour                                                                                                                                                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start from Specification (or Task)       | Session + association + Tasks in one transaction; `origin: user`; idempotent by the project-scoped create key over `{input, association}`                                                                                   |
| Start standalone (`/sessions/new`)       | No association; stays standalone forever (I1)                                                                                                                                                                               |
| Workflow start (future F01 `fresh`)      | Internal application operation, `origin: workflow` (section 10)                                                                                                                                                             |
| Workflow reuse (future F01 `reuse`, F12) | `associate-tasks` appends the Task if new; refused for a Session of another Specification or a standalone one (the orchestrator then starts a fresh Session)                                                                |
| Archive / unarchive                      | Association untouched. Archived Sessions are excluded from the workspace section, navigator and default list; `archived=include` or `archived=only` lists them                                                              |
| Delete (hard)                            | Association and Task rows deleted in the same transaction (Session-owned in the delete map). No tombstone. Spec/Task reads then resolve `null` and hide the reference; Engine attempt records keep the `sessionId` as audit |
| Specification archived / closed          | Association kept; the association read reports `collection: 'archived'`; scope unchanged                                                                                                                                    |
| Specification or Task removed            | No cascade. The association read reports `missing`; the Session remains readable and listed under that `specId`. A later object reusing the same id is read as the associated one (D13)                                     |
| Reassign / unlink                        | Not supported. Start a new Session from the other context                                                                                                                                                                   |
| Workspace rebinding of the Specification | Nothing stored changes; `resolve` returns the current `workspaceId`                                                                                                                                                         |

## 9. Demo mode

The demo has no managed Sessions (N6). Its catalogue keeps implementing the port
(`createDemoSessionReferences` plus `overlayReferences`) and gains `resolveMany`, `association` and
`list`, so the association read and the workspace section behave identically for seeded demo
Sessions. The demo create route (`/api/demo/specs/:specId/sessions`) records the association in its
in-memory state as today. No demo implementation of `POST /api/specs/:specId/sessions`.

## 10. Fit with the deterministic workflow engine

- Plan 06 F01 (continuation orchestrator) creates Sessions through an **internal application
  operation**, not HTTP and not the raw store `create`. Its actor is a Runtime-owned workflow actor
  (an audit key, not a user); authority comes from the Engine continuation decision and admission,
  not from user grants. Its idempotency key derives from the launch intent `(subject, step,
attempt + 1)`. The Engine attempt executor stays authoritative for who may resume/finish.
- Only that orchestrator calls `associate-tasks`; users cannot append Tasks in stage 3.
- F12 (selected Tasks, batch): one Session may cover several Tasks of one Specification;
  cross-Specification batches are not representable (D2), matching "one spec = one worktree".
- F13 (stop a Session on return) uses the Engine's `attempt -> sessionId`; the registry is not
  consulted.
- Attention: Engine require-attention items stay per subject and are composed by Specs; the Session
  list carries only Session-derived readiness. The registry stores neither attention nor current
  execution (I4).
- Task resource (`task-resource-and-context`, branch `feat/workflow-kernel`): Tasks are `(specId,
taskId)`; Task lifecycle states (`cancelled`, `on-hold`) do not change associations.

## 11. UI impact

- **Session Context**: the association read replaces `realRouteSessionContext` (loading -> `loading`,
  standalone -> `standalone`, Specification without Tasks -> `specification`, with Tasks -> `task`,
  `forbidden` -> the section says it cannot be viewed, errors -> `unknown / unreadable`).
- **Wording**: the Specification the Session is associated with, never "working on" (N2).
- **Start handoff**: `StartedSession.specification` is removed; the composed create response seeds
  the association query, so first paint and reload agree.
- **Project-mode Specification New Session** (`/specs/$specId/sessions/new`): managed start source
  with the Specification pinned, posting to the composed route; gated by `actions.startSession`. The
  demo path is unchanged.
- **Navigator**: on `/sessions/:sessionId` the active Specification is the association's home `specId`
  when `available`; standalone or `forbidden` shows no Specification section. No "last opened
  Specification" cache.
- **Sessions List** and post-delete/archive destinations: unchanged until the D10 UX items are decided.

## 12. Implementation tasks (PR #126)

All tasks land in PR #126 on `feat/session-ui-integration`. Each task is planned, implemented and
independently reviewed by separate agents. On Windows run the targeted test files named in each
task; the full suites (`pnpm check`) run on Linux CI. Order: T1 -> T2 -> T3 -> T4 -> (T5, T6, T7) ->
T8 -> T9 -> T10 -> T11 -> T12.

### T1 Contracts

- **Goal:** all wire shapes and the new capability exist in `@nevo/specflow-contracts`.
- **Files:** `packages/specflow-contracts/src/sessions/` (new `associations.ts`, list types in
  `management.ts` or a new `list.ts`, exports in `index.ts`), `src/specs/capabilities.ts`
  (`StartSession: 'start-session'`), `src/specs/workspace/index.ts` (`WorkspaceSession.title`
  optional, optional `hasMore` on the Session collection), capability projection types.
- **Contract:** section 7.4 types, `CreateContextSession(Result)`, `SessionListFilter`, `ListAssociation`,
  `SessionAssociationRead`, `AssociatedFact`, error code `SESSION_LIST_SCOPE_REQUIRED`.
- **Tests:** schema tests next to the existing `*.test.ts` (closed objects, `taskIds` <= 32 and
  unique, filter exclusivity, `restricted` carries no id).
- **Verification:** `pnpm --filter @nevo/specflow-contracts test`, `typecheck`.

### T2 Roles and capability

- **Goal:** `spec.start-session` is enforceable and granted by the built-in roles.
- **Files:** `packages/specflow-runtime/src/server/app.ts` (`specFlowRoleCapabilities`: developer and
  admin), capability discovery/projection, `docs/reference/configuration/authorization.md` (role list).
- **Contract:** section 6.2; viewer unchanged.
- **Tests:** role composition test (developer/admin contain it, viewer does not); capability discovery
  reports `startSession` per Specification.
- **Verification:** targeted auth tests (`features/auth/authorization/*.test.ts`).

### T3 Store schema v3 and operations

- **Goal:** durable association and list projection with atomic create/delete.
- **Files:** `features/sessions/persistence/schema.ts`, `worker.ts` (`create`, `saveSession`,
  `identity`, new ops), `protocol.ts`, `session-management.ts` (`SESSION_TABLE_OWNERSHIP`),
  `reads.ts`.
- **Contract:** sections 7.1 and 7.2; create fingerprint over `{input, association}`.
- **Tests:** v2 -> v3 migration with backfill on a fixture database; refusal of version 4; delete-map
  classification test passes with the new tables; create with association is atomic (fault injected
  between the inserts leaves neither row); idempotency conflict across standalone/Specification and
  across two Specifications; `associate-tasks` refused for another home or a standalone Session;
  keyset `list` order, filters, scan budget and cursor; `identities` batch.
- **Verification:** `session-management.test.ts`, `store.test.ts` and the new store tests.

### T4 Scope builder and authorization switch

- **Goal:** every Session check uses `sessionScope(identity, capability)` (section 6.1).
- **Files:** `features/sessions/http/authorization.ts`, `routes.ts` (`authorizeExecution` keeps
  execute-write without `specId`), `management.ts`, `telemetry.ts`, `stream.ts` (SSE reauthorization),
  `specs/workspace/read-authorized-workspace.ts`, `tasks/reads/visibility.ts` (both via `resolveMany`).
- **Tests:** a matrix of grant scopes `{}`, `{projectId}`, `{specId}`, `{sessionId}`, none, for
  `viewer`, `developer` and `admin`, against view/manage/delete/provider-limits routes, SSE, workspace
  and Task reference visibility. Must include: `viewer@{specId}` views S's Sessions and cannot
  manage, delete or create; `developer@{specId}` manages and deletes S's Sessions of any creator,
  cannot touch a standalone Session or one of T, and cannot start or continue a `workspace-write`
  Turn; one test asserts the routes and both projections take their scope from `sessionScope`; a read
  with N references performs one `identities` call and one Engine binding read.
- **Verification:** targeted http and projection tests.

### T5 Association module: composed create

- **Goal:** start a Session from a Specification atomically.
- **Files:** new `features/session-associations/` (feature, route, Engine verification), wiring in
  `server/app.ts` for project mode.
- **Contract:** `POST /api/specs/:specId/sessions` (7.4), authorization 6.3.
- **Tests:** success with and without `taskIds`; unknown Specification and foreign Task 404;
  missing `spec.start-session` 403; write mode without project-scoped execute-write 403; replay returns
  the same Session; conflict 409.
- **Verification:** targeted route tests with the mock provider.

### T6 Association read and SessionReferenceOwner

- **Goal:** the real port for project mode and the read for Context and navigator.
- **Files:** `features/session-associations/` (port implementation, read route),
  `features/sessions/reference-owner.ts` (port extension), `server/app.ts`
  (`dependencies.sessions.references` set in project mode).
- **Contract:** `GET /api/sessions/:sessionId/association`, `SessionAssociations` (7.3).
- **Tests:** standalone, available, archived Specification, `missing` Specification and Task,
  `forbidden` checked before existence (no lookup when forbidden), `unavailable` Engine source.
- **Verification:** targeted route tests.

### T7 Session list

- **Goal:** `GET /api/sessions` (7.4).
- **Files:** `features/sessions/http/routes.ts` (or `list.ts`), cursor signing next to history tokens.
- **Tests:** per-row authorization and redaction; `SESSION_LIST_SCOPE_REQUIRED`; short pages with
  `nextCursor`; archived filters; tampered or foreign-filter cursor rejected.
- **Verification:** targeted route tests.

### T8 Project-mode workspace section and actions

- **Goal:** real `sessions` section, `recommendedSessionId`, `startSession` action.
- **Files:** `features/session-associations/` (contribution), `server/app.ts` (contribution wiring),
  `specs/workspace/engine-repository.ts` (action from the contribution instead of `not_implemented`).
- **Tests:** status mapping, 100-row cap with `hasMore`, recommendation order, archived excluded,
  action reasons.
- **Verification:** workspace endpoint tests.

### T9 Demo port

- **Goal:** demo behaves like project mode for seeded Sessions.
- **Files:** `features/sessions/demo/references.ts`, `demo/operations.ts`, `demo/index.ts`.
- **Tests:** demo association read and section for seeded and allocated demo Sessions.
- **Verification:** demo tests.

### T10 UI integration (implementer-ui)

- **Goal:** Context, start handoff, project-mode Specification New Session and navigator use the
  association (section 11).
- **Files:** `features/sessions/managed/routes.tsx`, `managed/context/sessionContextTypes.ts`
  (source note), `start/handoff/startedSession.ts`, a new association query hook,
  `features/specs/creation/new-session/NewSessionScreen.tsx` (+ managed start source with the
  Specification), `app/navigation/*` (Specification from the association), workspace query
  invalidation on Session commands, `mapWorkspaceResponse.ts` (optional title).
- **Tests:** unit tests for the association -> `SessionContextViewModel` mapping (all states), reload
  keeps the Specification, navigator shows S's sections on a Session of S and none on a standalone one;
  stories updated for the new Context states.
- **Verification:** targeted UI tests, `pnpm test:storybook` for touched stories, check by eye in the
  real Runtime (project mode).

### T11 Cross-boundary scenario

- **Goal:** one HTTP scenario across the boundary.
- **Files:** `packages/specflow-runtime/test/sessions/` (next to `session-lifecycle.http.test.ts`).
- **Scenario:** start from Specification -> list -> workspace section -> association read -> archive
  (hidden) -> delete (association gone, Task reference hidden), plus a `{specId}`-scoped developer
  pass.

### T12 Documentation homes

- **Goal:** move the exact contracts into their owning documents (section 15) and close the stage 3
  follow-up in the delivery record; `pnpm docs:check --write`.

## 13. Acceptance scenarios

1. Start from Specification S, reload the Session: Context shows S; the navigator shows S's sections.
2. Standalone Session: Context shows standalone; it is absent from every Specification's section.
3. `viewer@{specId: S}` sees S's Sessions on Session routes, the list (with `specId=S`), workspace and
   Task reads; cannot start, manage or delete; list without `specId` answers 400.
4. `developer@{specId: S}` starts a read-only Session in S, manages and deletes any Session of S,
   cannot see standalone Sessions or Sessions of T, and cannot run `workspace-write`.
5. A `{projectId}` viewer sees all Sessions; an associated row without `spec.view` shows
   `restricted`, and the association read reports `forbidden` without revealing existence.
6. Same `requestId` with a different `specId`, or standalone versus from S, is 409
   `IDEMPOTENCY_CONFLICT`; a crash during create leaves both rows or neither.
7. Archive hides the Session from section and navigator; `archived=include` lists it. Delete removes
   the association rows; Task references to it disappear; Engine audit keeps the id.
8. A removed Task reads as `missing`; the Session stays readable.

## 14. Remaining open items (not blocking PR #126)

- D10 UX items (UX designer).
- D8 execution workspace, which would let `execute-write` take the `specId` dimension.
- D13 immutable identity pinning with the Task resource.

## 15. Documentation homes

- [Sessions API](../../../reference/api/sessions.md): list, association read, scope rule.
- [Session storage and lifecycle](../../../architecture/ai/session-storage-and-lifecycle.md): sidecar
  tables, schema v3, delete map; its "Authorization and associations" section becomes "a specId-only
  assignment does not cover a standalone Session; its role's Session capabilities apply to Sessions
  associated with that Specification, except execute-write".
- [Runtime authorization](../../../architecture/runtime/auth/authorization.md) and its configuration
  reference: `spec.start-session`, role lists, the associated-Session scope dimension and the
  execute-write exception.
- [Specification Workspace API](../../../reference/api/specification-workspace.md): project Sessions
  section, `startSession`, `recommendedSessionId`, optional title, revision freshness.
- [Task reads](../../../reference/api/task-reads.md): Session reference scope.
- [Full Session UI spec](../../specflow-ui/screens/full-session-ui-spec.md) and
  [Full Session structure](../../specflow-ui/full-session-screen-structure.md): Context source.
- [Delivery record](../session-ui-integration/plan.md): stage 3 follow-up closed with a link here.
