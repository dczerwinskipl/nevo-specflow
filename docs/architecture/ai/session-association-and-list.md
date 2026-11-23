---
id: architecture.ai.session-association-and-list
type: architecture
title: Session association and filtered list semantics
status: current
scope: specflow
areas: [ai, runtime, server, security]
tags: [sessions, associations, authorization, pagination]
read_when:
  - reviewing session association and filtered list semantics
  - changing Session association persistence, access scopes or deletion ownership
summary: >-
  Atomic Specification Session creation, persisted association schema and lifetime, store-derived authorization and signed bounded list cursors.
related:
  - reference.api.sessions
  - architecture.ai.session-storage-and-lifecycle
  - reference.protocols.session-provider-driver
  - architecture.runtime.authorization
---

# Session association and filtered list semantics

Session association, authorization and list pagination rules apply to both standalone
and Specification-scoped Sessions. See [Session OpenAPI](../../reference/api/openapi.md)
for request and response schemas.

## Session list, association read and composed create

Schemas: `SessionListQuerySchema`, `SessionListFilterSchema`, `SessionListPageSchema`,
`SessionAssociationReadSchema`, `CreateContextSessionSchema` and `CreateContextSessionResultSchema`
in `@nevo/specflow-contracts/sessions`. Sessions stay independent: the association is a separate,
Session-owned sidecar record
([association persistence](#authorization-and-associations)),
written only by the composed create. There is no route to reassign, unlink or append Tasks.

Known limit: the record stores Task ids as they were at create. A Task id is a slug, not an
immutable identity, so an id reused after its Task was removed reads as the associated Task.
Associations therefore cannot distinguish an older removed Task from a new Task using the same id.

### Composed create

`POST /api/specs/:specId/sessions` (body limit 256 KiB) starts a Session associated with the
Specification, atomically:

#### Composed Create refusal order

Admission for `POST /api/specs/:specId/sessions` (256 KiB body), in order:

1. Validate schema (`400`), authenticate, check `SESSION_DISABLED` (`503`).
2. Authorize `spec.start-session` on `specScope(projectId, specId)` and `session.create` on `{projectId, specId}`. Write mode also requires project-scoped `session.execute-write` (`403 forbidden`).
3. Only then verify Specification and every `taskId` in Engine. Unknown Specification: `404 specification_not_found`; unknown/foreign Task: `404 specification_task_not_found`; unreadable Specification/Task definitions: `503 specification_source_unavailable`. Validation is time-of-check only.
4. Atomically create Session and association under project-scoped idempotency. Fingerprint includes `{input, association}`; reuse of `requestId` across standalone/associated or different Specifications returns `409 IDEMPOTENCY_CONFLICT`. Replay verifies Engine again; deleted Specification yields 404 without deleting the stored Session.

`POST /api/sessions` / `CreateSession` still creates standalone Sessions (no UI entry). Demo instead supplies a start `path` through workspace `startSession`; it has no composed create.

### Association read

`GET /api/sessions/:sessionId/association` serves Session Context and navigation in project/demo modes.

- **Auth:** `session.view` at store-derived Session scope; unknown Session returns `404 SESSION_NOT_FOUND`. Before Engine lookup, Specification/Task facts also require `spec.view` at `specScope(projectId, specId)`; forbidden callers cannot test existence.
- **Freshness:** Engine supplies current titles, keys and archive collection; registry stores only IDs.
- **Missing:** deleted Specification/Task is `missing` (no cascade). Reused Task ID resolves to the new Task; unreadable Task source gives `unavailable`.

### Session list

`GET /api/sessions?specId=&taskId=&standalone=true&archived=exclude|include|only&limit=&cursor=`

- Filters select, they never grant. `specId` and `standalone` are exclusive and `taskId` requires
  `specId` (otherwise `400 SESSION_INPUT_INVALID` with `field`). `archived` defaults to `exclude`.

#### List authorization

- **No grants from filters:** require `session.view` in any scope, then check `sessionScope(row, 'view')` for each scanned row; skip inaccessible rows.
- **Specification:** `specId` additionally requires `spec.view` on `specScope(projectId, specId)` or returns 403.
- **Scope-limited viewer:** without `specId` or `standalone`, Specification-scoped-only `session.view` returns `400 SESSION_LIST_SCOPE_REQUIRED` (`field: 'specId'`); `standalone=true` returns an empty page.

#### Ordering and pagination

- **Order:** newest first by immutable creation sequence; keyset pagination. `limit` 1–100 (default 50), scan budget 500 index rows per request.
- **Cursor:** `nextCursor` follows the **last scanned row**, not the last returned one; pages may have fewer than `limit` accessible entries, even zero. Clients must follow it while present.
- **Signature:** HMAC token binds store generation, project and exact filters. Changed/tampered cursor: `400 SESSION_CURSOR_INVALID`; expired: `409 SESSION_CURSOR_EXPIRED`.
- **Race:** decode only returned rows; omit a Session deleted after scanning. Demo lists from its catalogue using the same route.

#### Provider labels

- `providerTitle` and `modelTitle` are resolved from the Runtime's provider catalogue at read time,
  so a caller who may not read `GET /api/session-providers` (a viewer) can still name the agent.
  `readiness` is the effective readiness of the single-Session read: when the provider (or the
  Session's provider mode) cannot run a Turn and none is active, it reads
  `authenticationRequired` if the provider needs a sign-in, otherwise `unavailable`.

## Authorization and associations

Reuse existing session.create/view/manage and flat-role coverage; deletion uses the separate
session.delete capability (developer and admin roles). Standalone create requires session.create
at trusted {projectId}; existing Sessions use the scope `sessionScope(identity, capability)` builds
from the store-derived identity: {projectId, sessionId} for a standalone Session and
{projectId, specId, sessionId} for an associated one, except `session.execute-write`, which never
carries `specId` (the provider `cwd` is the whole verified workspace). There is no creator ACL or
automatic creator grant: configured project/global roles determine sharing; creator is audit
metadata only. A sessionId-scoped grant can allow one existing Session but cannot create another.
A specId-only assignment does not cover a standalone Session; its role's Session capabilities apply
to Sessions associated with that Specification, except execute-write. Access-disabled mode follows
existing Auth policy; use its stable internal audit/idempotency key, not a client-supplied user ID.
Exact rules: [Runtime authorization](../runtime/auth/authorization.md#session-scope) and
[Sessions API](../../reference/api/sessions.md).

**Association registry.** A Session has at most one home Specification, fixed at create and never
changed, plus an append-only set of that Specification's Tasks. Absent means standalone.

```sql
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
```

- The composed create (`POST /api/specs/:specId/sessions`) verifies the Specification and Tasks
  through the Engine first (time-of-check only), then writes the Session, association and Task rows
  in one Worker transaction under the project-scoped create key, whose fingerprint covers
  `{input, association}`. A crash leaves both or neither. The registry never infers an association
  from a URL, title, path or message, and stores the Engine's canonical ids, not titles.
- The store operations `identity`/`identities` (batch, at most 500) join the association row, so a
  Session's scope comes from one indexed lookup; `association`, `list` (keyset on `created_seq`,
  bounded scan budget, signed filter-bound cursor) and `associate-tasks` complete the protocol.
  `associate-tasks` has no HTTP route: only the future in-process workflow orchestrator appends
  Tasks, and it is refused for another home Specification or a standalone Session.
- Both tables are Session-owned in `SESSION_TABLE_OWNERSHIP`: delete removes them in the delete
  transaction; archive leaves them untouched. No cascade on Specification or Task removal: the
  association stays and reads as `missing`. There is no reassign, unlink or grant inheritance.
- An association is context, never current execution: the Engine attempt executor stays the only
  authority for what a Turn executes. Origin (`user`, `workflow`) is provenance, not authority.
- `SessionReferenceOwner` (`resolve`, `resolveMany`) and its extension `SessionAssociations`
  (`identity`, `association`) are implemented by the store in project mode and by the demo
  catalogue in demo mode; the list reads through a separate `SessionListSource` with the same two
  implementations. The port must not become the required identity type for the core. A Specification's workspace binding is resolved at read
  time, not stored. Rebinding a workspace cannot silently relocate a provider-native Session.
