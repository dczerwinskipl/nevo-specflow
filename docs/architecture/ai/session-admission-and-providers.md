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

- **Execution workspace.** A Turn of a standalone Session runs in the Runtime's verified workspace.
- A Turn of a Session associated with Specification S runs in S's workspace, resolved through the Engine at Turn start (S's registry binding, else the primary checkout; time-of-check).
- When that workspace is not the Runtime's own, a Turn runs there when the provider supports it (Claude); a write Turn's Engine claim names that workspace and stays project-wide ([Workspace execution claims](../runtime/workspace-execution-claims.md)).
- A provider bound to the Runtime's checkout (Codex, Antigravity), or an unregistered or unavailable workspace, is refused before admission with `422 CAPABILITY_UNSUPPORTED` and `details.reason` `specification-worktree-provider-unsupported` or `specification-workspace-unavailable`.
- The same provider is refused earlier, at the composed create in that Specification (`422 CAPABILITY_UNSUPPORTED`, `specification-worktree-provider-unsupported`), and the catalogue read for it (`?specId`) lists it `unavailable` with `reasonCode` `SPECIFICATION_WORKTREE_UNSUPPORTED`.
- A workspace that cannot be resolved at the create or the catalogue read refuses nothing there; the Turn start resolves it again.
- A Turn in a workspace a Close is removing, or of a Specification an unfinished Close names, is refused with `409 TURN_CONFLICT` and `details.reason` `specification-close-in-progress`.
- A Turn of a Specification's Session is registered in its workspace before the workspace is verified again (binding, checkout and Close journal), and stays registered until it ends: a workspace that changed in between refuses the start with `409 TURN_CONFLICT` (`specification-workspace-changed`), and Close refuses to remove a registered checkout ([Close](../../reference/api/specflow-specification-operations.md)).
- A write Turn's claim re-checks under the Engine lock that the Specification is still bound to the claimed workspace, and no write driver starts outside the root the claim names.
- A Session never falls back to the Runtime's folder.
- A Session's home Specification is immutable, so its scope never changes.
- See [Runtime authorization](../runtime/auth/authorization.md#session-scope).
- Missing auth -> existing 401 authentication_required; forbidden -> 403 forbidden; unknown ID -> 404 SESSION_NOT_FOUND after access handling.
- Existing Auth conventions remain authoritative; no new per-creator ACL is introduced.


### SSE access revocation

SSE additionally reauthorizes before every replay/live batch and at least every 30 seconds while
idle, via an injected Auth-owned checker. On revoked access/expired authentication close the
stream without more payload. Sessions does not read Auth cookies or implement login renewal.
The checker resolves current trusted access/policy through Auth's public boundary.

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

- Both parameters together are `400 SESSION_INPUT_INVALID`, as is any other parameter or a malformed id.
- `recheck=true` (with either parameter or none) is an explicit recheck: every enabled provider discovers its executable again from scratch and probes again instead of reusing its cache ([executable discovery](../../reference/providers/executable-discovery.md#cache)).
- `?specId` is a pure authorization check: it does not verify that the Specification exists (the catalogue is not sensitive and names no Specification; the composed create verifies it).
- A `workspace-write` provider mode is `authorized` when the caller holds `session.execute-write` at `{projectId}` (no context, `?specId`) or at the Session's own execute-write scope (`?sessionId`); it never carries `specId`.
- The UI's New Session in a Specification reads `?specId`, the Full Session composer `?sessionId`, so a Specification-scoped developer can start and steer Sessions in its Specification without any project-level grant.
- Read with `?specId` for a Specification in a worktree other than the Runtime's checkout, a provider that runs only in the Runtime's checkout is `readiness: 'unavailable'` with `reasonCode` `SPECIFICATION_WORKTREE_UNSUPPORTED` ([Execution workspace](session-admission-and-providers.md#authorization-and-transport)); the UI explains it in its own words.

Provider discovery reports readiness and reason codes, available capabilities and
the selectable models and modes. An oversized catalogue refuses
`PROVIDER_CATALOGUE_UNAVAILABLE` rather than silently omitting a choice.
The exact fields and size limits are in [OpenAPI](../../reference/api/openapi.md),
operation `getSessionProviders`. Provider selection is revalidated when a
command is admitted.


### Provider eligibility and availability

- The catalogue lists the drivers the configuration enables, then every provider it withholds: unavailable, with no model, mode or capability, and reason code `NOT_ALLOWED_BY_PROJECT` (the project does not allow it; a maintainer sets `allowed: true` in `.nevo/config.yaml`) or `NOT_ENABLED_ON_WORKSTATION` (allowed, but this workstation's local config sets `enabled: false`).
- A mock the project does not allow is never listed.
- Starting a withheld provider is refused (`PROVIDER_UNAVAILABLE`).
- A withheld provider runs no driver, so its configuration reason is its only reason: read for a Specification in its own worktree it is not marked `SPECIFICATION_WORKTREE_UNSUPPORTED`, which applies only to enabled providers.
- While the project disables Sessions the catalogue answers `SESSION_DISABLED`, whatever the local file says, and the demo Runtime serves its own catalogue regardless of either file.
- The mock identifies itself as a test; An enabled provider that cannot start carries a readiness `reasonCode`: `EXECUTABLE_NOT_FOUND` (with `checkedLocations`, and `unresolvedLauncher` for an npm launcher without its package executable), `EXECUTABLE_NOT_WORKING`, `INSTALLATION_UNAVAILABLE`, `AUTHENTICATION_REQUIRED` (with `signInCommand`), `PROTOCOL_UNSUPPORTED`, `KNOWN_INCOMPATIBILITY`, `RESTRICTION_UNSUPPORTED`, `PROCESS_SETTLEMENT_UNVERIFIED` or `PROBE_FAILED`; `executable` says which executable the Runtime resolved and how it found it ([executable discovery](../../reference/providers/executable-discovery.md)).

### Provider-specific discovery

Claude discovers native model/effort metadata and reports unavailable when its installation/auth/policy
fails the supported authentication/policy or protocol checks. Unlisted compatible versions run
Provisional; a missing catalogue entry or unknown hash is not a refusal reason. Each Session is dispatched through its own selected provider;
enabling the mock does not grant Claude availability. No real adapter is advertised from a demo list.

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
