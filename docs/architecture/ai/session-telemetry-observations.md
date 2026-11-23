---
id: architecture.ai.session-telemetry-observations
type: architecture
title: Session telemetry observation, accounting and refresh
status: current
scope: specflow
areas: [ai, runtime, security, server]
tags: [sessions, telemetry, provider, cost, limits, freshness, refresh]
read_when:
  - implementing or reviewing native Session telemetry producers
  - changing telemetry accounting, limits, permissions or refresh
  - debugging stale counters and Session telemetry SSE invalidations
summary: >-
  Telemetry is measured and persisted by Session owners, with provenance, partial coverage,
  safe account fencing, authorized read-time projection and refresh that never executes a Turn.
related:
  - architecture.ai.session-storage-and-lifecycle
  - reference.api.session-telemetry
  - reference.api.sessions
  - reference.protocols.session-provider-driver
  - architecture.runtime.authorization
---

# Session telemetry accounting and refresh

The Runtime serves one bounded Session telemetry snapshot plus explicit refresh, defined in
[generated OpenAPI](../../reference/api/openapi.md), under `Session Telemetry`.

## Observation semantics

A telemetry GET projects stored Session/Turn observations without starting providers, scanning transcripts or replaying Work. It always returns usage, cost, limits and context groups; Session totals and active/latest Turn have separate timestamps.

- **Missing data:** omit unknown numbers; never invent 0, null or NaN.
- **Coverage:** `available`/`partial`/`unavailable` is independent of `fresh`/`stale`/`unknown`. Unavailable has no `value`; available/partial requires one.
- **Failure:** preserve previous observations/timestamps and mark `REFRESH_FAILED`; public reason codes contain no native diagnostics.

### Token coverage and overlap

- Update usage and coverage transactionally in the Session SQLite owner. Each group records `observedTurns/totalTurns` and a completion flag; missing native counters mean partial coverage.
- Cache-read/write may overlap input and reasoning may overlap output. If overlap is `unknown`, do not compute an authoritative `totalTokens`. Lifetime usage is not current context occupancy.

### Cost provenance

- USD amounts are decimal strings (up to 12 fractional digits), with `provider-reported` or supported `estimated` provenance and `api-equivalent`/`billed`/`unknown` meaning.
- Never fabricate precision, treat subscription fees as API spending, combine incompatible currency/scope/meaning or reinterpret unqualified legacy numbers as USD. Estimation requires a versioned pricing contract.

### Account limits

- Each account/model window has an opaque ID, unit (tokens/requests/credits/percent), optional native reset time and measured used/remaining/limit values.
- Do not sum unrelated windows or percentages, derive remaining/subscription balance from Session usage, or expose secret account identity. Share the provider cache internally, fenced by account/credential generation.

### Context gauges

- Current context describes the last native generation, not lifetime tokens. Observe occupied or capacity (at least one); percentage requires both for the same model, context and instant.
- Breakdown kinds must be distinct/disjoint, with sum no greater than occupancy; remainder requires compatible native measurements.
- Compaction/model/account changes retire the gauge but preserve Session totals. Never infer content from transcript bytes or invent missing categories.

## Refresh, events and freshness

- GET emits `revision` and an Auth-derived opaque `accessRevision`, plus Session
  `eventSeq`. The strong ETag is over the **authorized projected snapshot**, including
  access generation and freshness/refresh state, with
  `Cache-Control: private, no-cache`. Authorization runs before handling
  `If-None-Match` or returning 304. A change in Session policy invalidates validators;
  the client discards sensitive cached groups when `accessRevision` changes. This is a
  deliberate exception to other Session endpoints' `no-store` policy.

### SSE invalidation and outbox

- **Events:** Session SSE carries `telemetry` invalidations, never raw account data. Bootstrap Snapshot, replay after `eventSeq` and reuse the existing stream per Session.
- **UI:** coalesce to at most two GETs/second per mounted Session; discard stale revisions/access generations. Gaps and `resync-required` require a fresh bootstrap.
- **Durability:** publish through committed SQLite outbox. Worker batches updates within 500 ms per Session; terminal Turns, explicit refresh and credential fencing publish promptly. Outbox survives restart. SSE subscription never invokes providers.

### Expiry and account fencing

- Account and context observations expire within 60 seconds, including after terminal Turn/restart. Settled usage/cost has no TTL but retains coverage status.
- `staleAt` marks stale on GET without writes and invalidates subscribers; reads stay correct even without subscribers.
- An account changed outside Runtime is detected at the next identity check, not by GET. Old data ages to stale, never claims the new identity.
- Fence native producer samples by invocation, native context, account and credential generation.

## Explicit refresh and capabilities

- Refresh requires `session.manage` at the store-derived Session scope, and
  account limits additionally require `session.view-provider-limits`.
  Read `session.view` permits stored usage/cost/context; when the limits grant
  is missing, return `limits` as unavailable `NOT_AUTHORIZED` with
  **no** amounts, timestamps or window IDs. A principal may read known limits
  while `refreshable:false`; reading does not require Manage.

### Refresh admission and deduplication

- **Request:** a distinct, nonempty subset of four groups, maximum body 4 KiB. Unsupported groups return `422 CAPABILITY_UNSUPPORTED`; unauthorized return 403. Never silently drop a selection.
- **Admission:** `refreshable` is advisory; recheck at execution. `202` confirms scheduling, not a new observation. No polling resource exists.
- **Idempotency:** equal actor/Session/body/`requestId` replays for 24 hours; changed body returns `409 IDEMPOTENCY_CONFLICT`. Coalesce native reads across callers without exposing their IDs.

### Scheduler and cooldown

- Only **account-scoped limits refresh** currently runs. Do not advertise context refresh without native-context affinity.
- Provider/account cooldown is 30 seconds across credential renewal; exceeding it returns `429` with `Retry-After`. At most one native read per binding runs, for up to 10 seconds. Cached GET never waits.
- Refresh must not send prompts, replay/resume Turns, edit workspaces, change models or repair authentication.
- Project visibility and refreshability independently. Permission changes re-project data and revoke SSE access; absent limits permission must not leak account windows through other groups.

## Persistence, migration and supported sources

- All canonical counters, outbox and freshness are coordinated by the
  existing SQLite Session owner. Shared provider-limit cache belongs to
  provider integration, not a second Session lifecycle/ledger writer.
  Reject overflows, invalid timestamps, impossible token breakdowns and
  unrepresentable native cost; a snapshot is limited to **32 KiB UTF-8**.

### Migration and legacy records

- A safe `migration.status` can report running/completed/failed; it cannot
  expose SQLite paths, messages or repair instructions. An interrupted
  migration restarts from the durable checkpoint and batches at most
  **100** old normalized Turn summaries; no transcript scan. Old usage
  without coverage is partial; pre-telemetry records may show
  `BASELINE_MISSING`. New/empty Sessions start with a complete baseline.
  Interrupted refresh becomes failed/idle, never automatically replays a
  provider operation.

### Provider coverage

- Supported observations remain provider-specific and **must be verified
  against current adapters and fixtures** before promising a field:
  Claude captures native Turn tokens/cache and native limit windows;
  Codex captures cumulative tokens/current context and explicit read-only
  account limits; Antigravity captures cumulative/reasoning/cache-read
  counters. Any unsupported money/context value remains unavailable.
  The [provider roadmap](../../ideas/specflow-runtime/provider-migration-plan.md)
  is not implemented contract coverage.
- Verification should include partial accounting and restart, provenance,
  account change/late samples, compaction, 403 vs 304 isolation,
  idempotent/coalesced/429 refresh, SSE replay/race and expiry, and slow
  readers. Idle subscribers must not induce native provider calls.
