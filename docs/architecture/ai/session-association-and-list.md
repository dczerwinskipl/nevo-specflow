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
