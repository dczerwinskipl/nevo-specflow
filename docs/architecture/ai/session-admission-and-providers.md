---
id: architecture.ai.session-admission-and-providers
type: architecture
title: Session authorization, providers and demo boundaries
status: current
scope: specflow
areas: [ai, runtime, server, security]
tags: [sessions, security, authorization, provider, workspace, demo]
read_when:
  - reviewing session authorization, providers and demo boundaries
summary: >-
  Managed Session access scopes, provider capabilities, workspace execution admission, revoked streaming access and demo read-only semantics.
related:
  - reference.api.sessions
  - architecture.ai.session-storage-and-lifecycle
  - reference.protocols.session-provider-driver
  - architecture.runtime.authorization
---

# Session authorization, providers and demo boundaries

Provider admission, authorization scopes, and demo Session boundaries are described here.
Exact HTTP operations are available in [Session OpenAPI](../../reference/api/openapi.md).

## Enable Sessions

The project enables the feature and allows providers in `.nevo/config.yaml`:

```yaml
sessions:
  enabled: true
  providers:
    mock:
      allowed: true
```

- Both flags default to false.
- An allowed provider is enabled on every workstation unless that workstation's `.nevo/local/config.yaml` sets `sessions.providers.<provider>.enabled: false`; the local file also holds a real provider's optional absolute `executable`.
- Local config cannot enable the feature, allow a provider or enable or configure one the project does not allow; such values, a project `executable`, project-level `providers.<provider>.enabled` and unknown keys are refused at load ([project versus local](../runtime/configuration.md#session-providers-project-and-workstation)).
- The [Specification Sessions UI](../../product/specflow/ui/specification-sessions.md) owns navigation and start-screen behavior.
- The explicitly labelled mock performs no external effects.
- The Claude, Codex and Antigravity adapters (project `sessions.providers.<provider>.allowed`, local `enabled` and `executable`) use this same API; their supported platforms, logins, modes and limits are in the [provider reference](../../reference/providers/README.md).
- Importing external Nevo history remains outside this API.
- Writable execution uses Engine-owned admission and settlement; it does not imply OS isolation.
- Disabling only the provider keeps stored reads available.
- Disabling the feature acquires no database owner.

## Authorization and transport

Authentication/authorization, origin protection and shared rate limits use existing Runtime
boundaries. Cache-Control: no-store applies. Never include raw provider IDs, process handles,
private interaction IDs, local absolute paths or provider payloads in ordinary DTOs.

Standalone create: session.create at server-derived {projectId}. The provider catalogue is
authorized by the start it is read for ([Provider catalogue](session-admission-and-providers.md#provider-catalogue)).
Existing resource reads: session.view at the Session's store-derived scope (below).
Start/cancel/reconcile/respond and rename/archive/unarchive: session.manage at that same scope.
Delete: session.delete at that same scope. Check access before protected source
reads; a small identity lookup may precede target authorization. No actor/scope/specId from a
request is an authority.

**Session scope.** One builder, `sessionScope(identity, capability)`
(`features/sessions/scope.ts`), fed only by the store-derived identity (the Session row joined with
its association), serves every Session route, SSE reauthorization, telemetry, the list and the
Specification/Task projections of Session references:

| Capability                                                                         | Standalone Session       | Session associated with Specification S |
| ---------------------------------------------------------------------------------- | ------------------------ | --------------------------------------- |
| `session.view`, `session.manage`, `session.delete`, `session.view-provider-limits` | `{projectId, sessionId}` | `{projectId, specId: S, sessionId}`     |
| `session.execute-write` (Turn start/respond in write mode)                         | `{projectId, sessionId}` | `{projectId, sessionId}` (no `specId`)  |
| `session.execute-write` (create in write mode)                                     | `{projectId}`            | `{projectId}`                           |

`session.execute-write` never carries `specId`: a write Turn holds the project-wide execution claim
and a native agent is not contained to its `cwd`, so a Specification-scoped grant must not admit
writes.

### Execution workspace and provider admission

- **Home:** a standalone Session uses the Runtime's verified workspace. A Specification Session uses its immutable home Specification's binding, or the primary checkout, resolved through Engine at Turn start. Never fall back to the Runtime folder.
- **Provider:** Claude supports another registered workspace; Codex and Antigravity are bound to Runtime's checkout. An unsupported provider or unavailable workspace refuses Turn start with `422 CAPABILITY_UNSUPPORTED` and `details.reason` of `specification-worktree-provider-unsupported` or `specification-workspace-unavailable`.
- **Earlier checks:** composed create refuses an incompatible provider (`422 CAPABILITY_UNSUPPORTED`); `?specId` catalogue returns `unavailable` / `SPECIFICATION_WORKTREE_UNSUPPORTED`. An unresolved workspace at create/catalogue is **not** itself a refusal; Turn start verifies again.
- **Close:** removing a workspace or an unfinished Close refuses a Turn with `409 TURN_CONFLICT` / `specification-close-in-progress`.
- **Concurrency:** register the Turn before rechecking binding, checkout and Close journal; retain registration until Turn end. A changed workspace refuses start with `409 TURN_CONFLICT` / `specification-workspace-changed`; Close cannot remove a registered checkout ([Close](../../reference/api/specflow-specification-operations.md)).
- **Writes:** the project-wide Engine claim names the workspace. Under Engine lock, recheck Specification binding; never start the write driver outside the claimed root ([execution claims](../runtime/workspace-execution-claims.md)).
- **Access:** missing authentication: `401 authentication_required`; forbidden: `403 forbidden`; unknown Session after access checks: `404 SESSION_NOT_FOUND`. Existing [Auth rules](../runtime/auth/authorization.md#session-scope) apply; no creator ACL.

### SSE access revocation

SSE refreshes current Auth policy before replay/live batches and at intervals no longer than one second while idle. Expired/revoked access closes the stream without another payload. Sessions uses Auth's checker, not cookies or a separate renewal mechanism. See [Event stream](session-history-and-events.md#event-stream).

## Provider catalogue

`GET /api/session-providers` is a starter's read. Its closed query names the start it is read for
(`ProviderCatalogueQuerySchema`), which decides its authorization; no request value is a scope
source beyond selecting which check runs:

| Query          | Read for                                     | Requires                                                                                                                                         |
| -------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| none           | a standalone Session of the project          | `session.create` at `{projectId}`                                                                                                                |
| `?specId=S`    | a Session started in Specification S         | the composed create's checks: `spec.start-session` at `specScope(projectId, S)` and `session.create` at `{projectId, specId: S}`                 |
| `?sessionId=X` | the composer of Session X (model/mode/retry) | `session.manage` at X's store-derived `sessionScope`: any-scope precheck first (403 for an unknown Session too), then the identity (404 unknown) |

The read re-runs a provider's bounded discovery when its last check is older than its short cache,
so it can take up to `PROVIDER_DISCOVERY_BUDGET_MS` (30 s) on a cold machine, even right after a
startup probe; clients give it that budget plus a margin, not the default read deadline.

### Catalogue request validation

- **Query:** unknown/malformed parameters or `?specId` combined with `?sessionId` return `400 SESSION_INPUT_INVALID`.
- **Recheck:** `recheck=true` reruns executable discovery and probes for every enabled provider, bypassing cache ([discovery](../../reference/providers/executable-discovery.md#cache)).
- **Scope:** `?specId` checks authorization but not Specification existence. `workspace-write` requires `session.execute-write` at project scope (none/`?specId`) or that Session's write scope (`?sessionId`), never a `specId` grant.
- **UI:** New Session uses `?specId`; existing Session composer uses `?sessionId`. The latter's authorization comes from Session scope.
- **Worktree:** `?specId` marks checkout-bound providers `unavailable` / `SPECIFICATION_WORKTREE_UNSUPPORTED` in another worktree; the UI explains the restriction.

Discovery returns readiness, reasons, capabilities, models and modes. An oversized catalogue returns `PROVIDER_CATALOGUE_UNAVAILABLE`, not a partial choice list. Revalidate the selected provider at command admission. Fields: [OpenAPI, `getSessionProviders`](../../reference/api/openapi.md).

### Provider eligibility and availability

- **Disabled by config:** list withheld drivers without models, modes or capabilities. Reason: `NOT_ALLOWED_BY_PROJECT` (set `allowed: true` in project config) or `NOT_ENABLED_ON_WORKSTATION` (local `enabled: false`). A disallowed mock is not listed.
- **Admission:** starting a withheld provider returns `PROVIDER_UNAVAILABLE`. Its configuration refusal takes precedence over worktree compatibility, which applies only to enabled providers.
- **Feature off:** return `SESSION_DISABLED` regardless of local config; demo has its own catalogue. Mock identifies itself as a test.
- **Readiness:** enabled but unusable providers expose `reasonCode`: `EXECUTABLE_NOT_FOUND` (with `checkedLocations` and optional `unresolvedLauncher`), `EXECUTABLE_NOT_WORKING`, `INSTALLATION_UNAVAILABLE`, `AUTHENTICATION_REQUIRED` (with `signInCommand`), `PROTOCOL_UNSUPPORTED`, `KNOWN_INCOMPATIBILITY`, `RESTRICTION_UNSUPPORTED`, `PROCESS_SETTLEMENT_UNVERIFIED` or `PROBE_FAILED`. Report resolved `executable` and its discovery method ([reference](../../reference/providers/executable-discovery.md)).

### Provider-specific discovery

Claude discovers native models/effort and reports failures of installation, authentication, policy or protocol checks. Compatible unlisted versions run provisionally; an unknown catalogue entry/hash alone is not a refusal. Each Session uses its selected provider. Enabling mock does not enable Claude, and demo never advertises a real adapter.

## Demo Runtime (read-only managed Sessions)

The demo Runtime (`--demo`) has no Session coordinator, but the Full Session screen stays on the
canonical `/sessions/:sessionId` route and reads the same routes. Demo Session IDs (seeded catalogue
Sessions and Sessions allocated by `POST /api/demo/specs/:specId/sessions`) are UUIDs like managed
ones. `features/sessions/demo/managed-reads.ts` serves the read side, authorized exactly like the
managed reads: `session.view` in any scope first (so an unknown Session and a refused one both
answer 403 to a caller without it), then the identity from the demo association registry, then
`session.view` at the Session's scope (unknown: 404):

- `GET /api/sessions/:sessionId`: a snapshot with the list row's `readiness` (so the header matches
  the Sessions navigator), `mode: 'read-only'`, no
  `activeTurn`, no entries, `history.hasOlder: false`, `eventSeq: 0` and `capabilities` granting
  `view` only (`manage`, `start`, `cancel`, `delete`, `executeWrite` false). Title, provider and
  model, with their `providerTitle` and `modelTitle`, are the Session list row's.
- `GET /api/session-providers`: the demo catalogue's providers, authorized by its start context
  exactly as in project mode ([Provider catalogue](session-admission-and-providers.md#provider-catalogue)), the Session's identity
  from the demo association registry; every provider capability false and
  `modes: ['read-only']`. The
  screen does not need it to name the executor: the snapshot's titles do, as in project mode.
- `GET .../history`: still requires a cursor (`400 SESSION_CURSOR_INVALID` without one); any cursor
  answers an empty page. `GET .../turns/:turnId/work`, `.../work/:workId/actions` and
  `.../content/:contentId`: `404 SESSION_RESOURCE_NOT_FOUND` (a demo Session has no Turn).
- `GET .../telemetry`: every reading `unavailable` with reason `NOT_OBSERVED`, nothing refreshable.
- `GET .../events`: an SSE stream that only sends `: connected` and heartbeats; only `after=0` (or
  no cursor) is valid. It counts against the managed stream caps (32 open, 8 per principal, then
  `429` with `Retry-After: 5`).
- `GET .../association` and `GET /api/sessions` are the demo catalogue's (sections above).

Every mutation (`POST /api/sessions`, Turn start/cancel/reconcile/respond, rename, archive,
unarchive, delete, telemetry refresh) stays `SESSION_DISABLED`. Without Manage the screen shows the
view-only bar in the Composer's place and no error state ([Full Session — Session actions](../../product/specflow/ui/full-session.md#session-actions)).

## Error contract

Domain error body: {error:'session_error', code, message, details?}. message is safe text <=2 KiB.
details is code-specific and bounded; never provider-private diagnostics. Existing Auth/rate-limit
envelopes remain their own contracts. UI branches on code, not message text. The composed create
answers its Engine verification failures with the Specification read envelope
(`{error: 'specification_not_found' | 'specification_task_not_found' | 'specification_source_unavailable'}`).

| Status | Codes and permitted details                                                                                                                                                                                             |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | SESSION_INPUT_INVALID (field?), SESSION_CURSOR_INVALID, SESSION_LIST_SCOPE_REQUIRED (field), INTERACTION_RESPONSE_INVALID                                                                                               |
| 404    | SESSION_NOT_FOUND, SESSION_RESOURCE_NOT_FOUND                                                                                                                                                                           |
| 409    | TURN_CONFLICT (turnId), SESSION_ARCHIVED, SESSION_DELETE_BLOCKED (turnId), IDEMPOTENCY_CONFLICT, INTERACTION_EXPIRED, SESSION_CURSOR_EXPIRED, CONTENT_REVISION_UNAVAILABLE, SESSION_RECOVERY_REQUIRED (turnId?, reason) |
| 413    | SESSION_PAYLOAD_TOO_LARGE                                                                                                                                                                                               |
| 422    | CAPABILITY_UNSUPPORTED (capability), MODEL_UNSUPPORTED                                                                                                                                                                  |
| 503    | SESSION_DISABLED, SESSION_STORE_BUSY, SESSION_STORE_UNAVAILABLE, PROVIDER_UNAVAILABLE, PROVIDER_AUTH_REQUIRED, PROVIDER_CATALOGUE_UNAVAILABLE                                                                           |

The body is the shared `SessionError` contract (`SessionErrorSchema`). The
[OpenAPI document](../../reference/api/openapi.md#schemas-and-security) lists, per operation, the statuses and codes
that operation can answer.

Missing/replaced/corrupt store never returns an invented ready/empty snapshot. Store ownership
failure prevents feature startup and is reported in startup diagnostics using the same code.
Cursor expiry calls for a bounded new snapshot/page path, not a retry loop of the same token.
Operational driver failures after accepted Turn start appear as canonical terminal/unknown state,
not retroactive failure of the already acknowledged command.
