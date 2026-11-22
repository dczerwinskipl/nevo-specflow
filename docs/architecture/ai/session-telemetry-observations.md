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
This document owns measurement/accounting **semantics and security**, not the HTTP DTO shape.

## Observation semantics

- A Session telemetry GET projects stored/aggregated values. It never starts a provider, scans
  a transcript or replays Session Work to sum usage. It returns the four named groups
  (usage, cost, limits and context) even when unavailable, without needing an active Turn.
  Session totals and the selected active/latest Turn observation are independently timestamped.
  Unknown numeric values are **omitted**, never manufactured as zero/null/NaN.
- `available`, `partial` and `unavailable` describe coverage independently of freshness
  (`fresh`, `stale`, `unknown`). An unavailable reading cannot contain `value`;
  an available or partial reading must. A failed refresh keeps previously observed values
  and times, marking `REFRESH_FAILED`. Safe reason codes never reveal native diagnostics.
- Token usage and coverage are updated transactionally in the Session SQLite owner. Each
  group has `observedTurns/totalTurns` and a completion flag; missing native Turn counters
  make the aggregate partial. Relationship flags disclose whether cache-read/cache-write
  count within input, or reasoning within output; with `unknown` overlap there is no
  authoritative `totalTokens` sum. Lifetime usage never equals current context occupancy.
- Money is a **decimal string** in USD with up to 12 fractional digits, provenance
  (`provider-reported` or an explicitly supported `estimated`) and meaning
  (`api-equivalent`, `billed`, `unknown`). Arithmetic is decimal; never round
  unsupported native precision into a fabricated ledger amount or equate subscription
  fees with API-equivalent spending. Estimates require a future versioned pricing
  contract. Incompatible currency, scope or billed/estimated meaning cannot combine
  into a complete total. Unqualified legacy numeric amounts do not become USD.
- Account/model limit windows identify an **opaque window**, unit (tokens/requests/credits/
  percent), safe numeric used/remaining/limit and optionally the native reset time.
  Different windows and percentages are not additive. Do not derive remaining,
  subscription balance or account identity from Session usage. Provider account-limit
  caches are shared across Sessions internally and fenced to account/credential generation;
  no secret account identifiers appear in public telemetry.
- Current context is a gauge of the last native context generation, not a lifetime usage
  counter. At least one of occupied or capacity tokens must be observed. Percentage is
  meaningful only when both refer to the same model/context/instant. Breakdown components
  are disjoint, distinct kinds whose sum cannot exceed occupancy; unclassified remainder
  exists only when native measures are compatible. Compaction, model and account changes
  retire an old gauge without erasing the Session's historical totals. Never infer
  prompt/tool context from transcript bytes or fabricate an absent category.

## Refresh, events and freshness

- GET emits `revision` and an Auth-derived opaque `accessRevision`, plus Session
  `eventSeq`. The strong ETag is over the **authorized projected snapshot**, including
  access generation and freshness/refresh state, with
  `Cache-Control: private, no-cache`. Authorization runs before handling
  `If-None-Match` or returning 304. A change in Session policy invalidates validators;
  the client discards sensitive cached groups when `accessRevision` changes. This is a
  deliberate exception to other Session endpoints' `no-store` policy.
- The existing committed Session event stream carries `telemetry` as an
  **invalidation**, not raw account measurements. Bootstrap snapshot first, then
  replay after `eventSeq`; if a stream is already open, reuse it rather than opening
  another per UI panel. Coalesce invalidations to at most **two GETs/second** per mounted
  Session; discard responses of older revisions/access generations. Gaps or
  `resync-required` trigger a fresh bootstrap.
- Native telemetry writes publish invalidations via the committed SQLite outbox
  after commit. The Worker coalesces updates into a **500 ms** per-Session window,
  but terminal Turn publication and explicit refresh/credential fencing publish
  promptly. The outbox persists through restart. Opening an SSE subscriber does not
  invoke provider work.
- Account observations are fresh for at most **60 seconds**; context observations
  also expire within 60 seconds, including after Turn terminal/restart. Historical
  settled usage/cost has no TTL, though its coverage remains explicit. A
  `staleAt` deadline projects stale on a GET without a write and publishes
  invalidation for subscribers. With no subscribers the GET remains accurate
  without an expiry write.
- An account change outside Runtime is discovered on the next identity check, not
  from GET; until then the old observation ages into stale and is not claimed
  to describe the new account. All native producer samples are fenced by
  invocation, native context, account and credential generation.

## Explicit refresh and capabilities

- Refresh requires `session.manage` at the store-derived Session scope, and
  account limits additionally require `session.view-provider-limits`.
  Read `session.view` permits stored usage/cost/context; when the limits grant
  is missing, return `limits` as unavailable `NOT_AUTHORIZED` with
  **no** amounts, timestamps or window IDs. A principal may read known limits
  while `refreshable:false`; reading does not require Manage.
- A refresh request selects a nonempty distinct subset of the four groups,
  with a **4 KiB** body bound. Reject every unsupported/unauthorized selected
  group (422 `CAPABILITY_UNSUPPORTED` or 403), never silently omit it.
  Advertised `refreshable` is advisory; execution checks again. A 202
  receipt acknowledges **scheduling**, not a new measurement or a successful
  provider response. No separate refresh-polling resource exists.
- Replay of `requestId` with identical actor/Session/body deduplicates
  for **24 hours**. Changed body under that key refuses 409
  `IDEMPOTENCY_CONFLICT`. Native work coalesces across eligible concurrent
  callers but receipts never expose another user's request id.
- The current scheduler supports **account-scoped limits refresh**; a future
  context refresh needs native-context affinity and must not be falsely enabled
  merely by provider metadata. Provider/account cooldown is **30 seconds**
  across credential renewals: new attempts above it return **429 with
  `Retry-After`**. At most one native read per binding runs for up to
  **10 seconds**. A cached GET never waits for it. Refresh never sends a
  prompt, replays/resumes a Turn, edits a workspace, changes a model or
  repairs authentication.
- Refreshable readings and group visibility are independently projected.
  Permission changes trigger re-projection and SSE revocation; opening
  a stream without the limits capability must not leak that account's
  numeric windows through another group.

## Persistence, migration and supported sources

- All canonical counters, outbox and freshness are coordinated by the
  existing SQLite Session owner. Shared provider-limit cache belongs to
  provider integration, not a second Session lifecycle/ledger writer.
  Reject overflows, invalid timestamps, impossible token breakdowns and
  unrepresentable native cost; a snapshot is limited to **32 KiB UTF-8**.
- A safe `migration.status` can report running/completed/failed; it cannot
  expose SQLite paths, messages or repair instructions. An interrupted
  migration restarts from the durable checkpoint and batches at most
  **100** old normalized Turn summaries; no transcript scan. Old usage
  without coverage is partial; pre-telemetry records may show
  `BASELINE_MISSING`. New/empty Sessions start with a complete baseline.
  Interrupted refresh becomes failed/idle, never automatically replays a
  provider operation.
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
