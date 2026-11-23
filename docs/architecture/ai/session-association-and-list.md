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
summary: >-
  Atomic Specification Session creation, association projections, per-row authorization and signed bounded list cursors.
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
([storage](session-storage-and-lifecycle.md#authorization-and-associations)),
written only by the composed create. There is no route to reassign, unlink or append Tasks.

Known limit: the record stores Task ids as they were at create. A Task id is a slug, not an
immutable identity, so an id reused after its Task was removed reads as the associated Task.
Associations therefore cannot distinguish an older removed Task from a new Task using the same id.

### Composed create

`POST /api/specs/:specId/sessions` (body limit 256 KiB) starts a Session associated with the
Specification, atomically:

#### Composed Create refusal order

- Refusal precedence: schema validation (400), authentication, `503 SESSION_DISABLED`, then `spec.start-session` at
  `specScope(projectId, specId)`, `session.create` at `{projectId, specId}` and, for
  `mode: 'workspace-write'`, `session.execute-write` at `{projectId}` (403 `forbidden`); only then
  the Engine verification, so a refused caller never learns whether the Specification exists.
- The Engine verifies the Specification and every `taskId` before the write (time-of-check only):
  `404 {error: 'specification_not_found'}`, `404 {error: 'specification_task_not_found'}` (unknown
  Task or one of another Specification), `503 {error: 'specification_source_unavailable'}` when the
  Specification or Task source is unreadable. When the configured Task definition source cannot be read, the request answers 503;
  an unknown Task or one bound to a different Specification answers 404. A matching Task
  resolved from the Engine definition source is accepted.
- The Session and its association rows are written in one store transaction under the
  project-scoped create idempotency key; its fingerprint covers `{input, association}`. The same
  `requestId` sent standalone and from a Specification, or to two Specifications, is
  `409 IDEMPOTENCY_CONFLICT`. A replay re-runs the Engine verification, so a replay after the
  Specification was removed answers 404 while the stored Session stays.
- `POST /api/sessions` and `CreateSession` are unchanged and create a standalone Session; the UI
  has no entry to it. The demo Runtime has no composed create: its workspace `startSession` action
  carries the demo start `path` instead.

### Association read

`GET /api/sessions/:sessionId/association` (project and demo mode) serves the Session Context and
the navigator:

`session.view` at the Session's scope admits the read (unknown ID: 404 SESSION_NOT_FOUND).
Specification and Task facts additionally need `spec.view` at `specScope(projectId, specId)`,
checked before any Engine lookup, so `forbidden` never reveals existence. Titles, keys and the
archive collection are read from the Engine at request time; the registry stores only ids. A
removed Specification or Task reads as `missing` (no cascade); a later object reusing the same id
reads as the associated one. If the Engine Task source is unavailable, associated Tasks read as `unavailable`.

### Session list

`GET /api/sessions?specId=&taskId=&standalone=true&archived=exclude|include|only&limit=&cursor=`

- Filters select, they never grant. `specId` and `standalone` are exclusive and `taskId` requires
  `specId` (otherwise `400 SESSION_INPUT_INVALID` with `field`). `archived` defaults to `exclude`.

#### List authorization

- Authorization: `session.view` in any scope, then each scanned row at
  `sessionScope(row, 'view')`; rows the caller may not view are skipped. With `specId` the request
  also requires `spec.view` at `specScope(projectId, specId)` (403 otherwise): selecting by a
  Specification reveals which Sessions belong to it. Without `specId` or `standalone`, a caller
  whose `session.view` comes only from Specification-scoped grants gets
  `400 SESSION_LIST_SCOPE_REQUIRED` (`field: 'specId'`); `standalone=true` answers such a caller an
  empty page.

#### Ordering and pagination

- Order: newest created first, keyset-paged on the immutable creation sequence. `limit` 1..100,
  default 50. One request scans at most 500 index rows and stops when `limit` rows are filled or
  the budget is spent; `nextCursor` points after the last **scanned** row, so a page may hold
  fewer than `limit` items, even none, while `nextCursor` is present. Clients follow it explicitly.
- `nextCursor` is HMAC-signed and bound to the store generation, the project and the exact filter;
  a tampered cursor or one of another filter is `400 SESSION_CURSOR_INVALID`, an expired one
  `409 SESSION_CURSOR_EXPIRED`.
- A page decodes only the rows it returns; a Session deleted between scan and decode is omitted.
  The demo Runtime serves the same route from its catalogue.

#### Provider labels

- `providerTitle` and `modelTitle` are resolved from the Runtime's provider catalogue at read time,
  so a caller who may not read `GET /api/session-providers` (a viewer) can still name the agent.
  `readiness` is the effective readiness of the single-Session read: when the provider (or the
  Session's provider mode) cannot run a Turn and none is active, it reads
  `authenticationRequired` if the provider needs a sign-in, otherwise `unavailable`.
