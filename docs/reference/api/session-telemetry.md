---
id: reference.api.session-telemetry
type: reference
title: Session telemetry HTTP and live update contract
status: draft
scope: specflow
areas: [ai, runtime, server, security, ui]
tags: [sessions, telemetry, usage, cost, limits, context, sse]
read_when:
  - designing provider telemetry producers and Session telemetry readers
  - implementing live UI consumption of token usage, costs, limits and context size
summary: >
  Bounded Session telemetry snapshot, explicit refresh and existing-stream
  invalidation contract, with provider provenance, freshness and partial availability.
related:
  - reference.api.sessions
  - ideas.specflow-runtime.ai-adapters.usage-accounting
  - ideas.specflow-runtime.session-v10-backend-readiness
---

# Session telemetry API

Implemented backend on the current feature branch; independent final validation
is reported in the PR. This document owns the wire contract. No UI implementation,
Task/Specification/Workflow integration,
provider inference, pricing service or credential broker is in this proposal.

## Resources and operations

| Operation                                         | Result                                                          | Provider work                                                    |
| ------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /api/sessions/:sessionId/telemetry`          | `200 TelemetrySnapshot`, or `304` with matching `If-None-Match` | None; bounded stored/cache projection                            |
| `POST /api/sessions/:sessionId/telemetry/refresh` | `202 RefreshReceipt`                                            | Bounded read-only refresh of requested supported groups          |
| `GET /api/sessions/:sessionId/events?after=...`   | Existing Session SSE, extended with telemetry invalidations     | No inference; shared producers, never one process per subscriber |

GET always returns the four named groups, even when unavailable. It does not
require an active Turn or running provider; historical observations survive
Runtime restart. A missing native installation does not hide recorded usage.
It never scans transcripts, loads content or replays Work/history to sum usage.
Maintain Session totals/coverage in the existing single-owner persistence path.

GET is independently loadable from the chat snapshot. The first scope includes
Session aggregates and at most the active Turn, otherwise the latest Turn.
`turnId` is always explicit on that Turn's measurements. Arbitrary older Turn
telemetry is outside this first resource; existing bounded Turn reads remain.

### Snapshot envelope and readings

```ts
type Reading<T> = {
  status: 'available' | 'partial' | 'unavailable';
  freshness: 'fresh' | 'stale' | 'unknown';
  observedAt?: string; // UTC ISO timestamp of underlying observation
  staleAt?: string; // UTC boundary; not recomputed from GET time
  reason?:
    | 'NOT_SUPPORTED'
    | 'NOT_OBSERVED'
    | 'NOT_AUTHORIZED'
    | 'AUTHENTICATION_REQUIRED'
    | 'PROVIDER_UNAVAILABLE'
    | 'REFRESH_FAILED'
    | 'BASELINE_MISSING';
  source?: 'provider-reported' | 'runtime-aggregate' | 'estimated';
  refreshable: boolean;
  value?: T;
};
type TelemetrySnapshot = {
  sessionId: string;
  revision: number; // monotonic safe integer, committed telemetry version
  accessRevision: string; // opaque Auth-owned access generation, not an access grant
  eventSeq: number; // same committed outbox boundary as the Session stream
  usage: {
    session: Reading<TokenUsage>;
    turn?: { turnId: string; reading: Reading<TokenUsage> };
  };
  cost: {
    session: Reading<MoneyUsage>;
    turn?: { turnId: string; reading: Reading<MoneyUsage> };
  };
  limits: Reading<{ windows: LimitWindow[] }>;
  context: Reading<ContextUsage>;
  migration?: { status: 'running' | 'completed' | 'failed' };
  refresh: {
    state: 'idle' | 'queued' | 'running';
    groups: ('usage' | 'cost' | 'limits' | 'context')[];
    retryAfterSeconds?: number;
  };
};
```

Unknown values are omitted, never zero/null/NaN. `unavailable` has no `value`;
`available`/`partial` have a value. Partial means only some requested dimensions
or accounting coverage are known. Freshness is independent: an incomplete native
breakdown can be fresh. A failed refresh retains the previous value and its
observation time, with `REFRESH_FAILED`; it never replaces a known total with zero.
Error reasons are safe codes, not raw provider diagnostics.

Session totals have their own coverage and timestamp, distinct from the latest
Turn. Do not label a Session sum complete when some Turn counters are missing.
Do not average percentages across models, windows or contexts.

### Usage and money

`TokenUsage` contains optional nonnegative safe-integer `inputTokens`,
`outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `reasoningTokens`, plus
`coverage: {complete: boolean, observedTurns: number, totalTurns: number}`.
The counts are transactionally maintained, not calculated through history scans.
No authoritative `totalTokens` is derived without verified dimensional semantics.
The object also carries `relationships: {cacheReadToInput, cacheWriteToInput,
reasoningToOutput}`, each `included | excluded | unknown`. These preserve whether
cache/reasoning counts overlap the input/output counters. Token consumption is
not current context occupancy.

`MoneyUsage` contains `currency: 'USD'`, `amount` as a nonnegative decimal string,
`basis: 'provider-reported' | 'estimated'`, and
`meaning: 'api-equivalent' | 'billed' | 'unknown'`, with the same coverage shape.
Decimal format is `^(0|[1-9][0-9]{0,15})(\.[0-9]{1,12})?$`; arithmetic is decimal,
not binary floating-point summation. Only validated source scope/currency/meaning
can share an aggregate. Incompatible or missing costs make that aggregate partial
or unavailable; do not combine billed charges with API-equivalent estimates.

This delivery enables only provider-reported amounts with established currency,
scope and basis. `estimated` reserves a distinct future path; estimating requires
an explicit versioned pricing contract. Subscription payment/remaining credits
cannot be inferred from API-equivalent cost. Never infer currency from a bare
legacy numeric `cost` without native evidence.

### Limits

`LimitWindow` has an opaque safe `windowId`, `scope: 'account' | 'model'`, optional
`modelId`, `unit: 'tokens' | 'requests' | 'credits' | 'percent'`, and at least one
of `used`, `remaining` or `limit` as nonnegative decimal strings with the same
precision bound as money. Optional `windowSeconds` is a positive safe integer;
`resetsAt` is an observed UTC timestamp. Percent values are 0..100.
There are at most 16 windows. Only derive remaining when compatible native units
and limit/used semantics are established. Different windows are not additive.
No private account ID, credential, subscription secret or billing history is exposed.

The configured account may be shared by several Sessions and by external CLI use.
Limits are owned by a provider/account binding, never decremented from Session
usage. An adapter cache is shared internally across those Sessions and fenced by
account identity and credential generation. UI labels come from stable scope/unit
fields and safe catalogue metadata, not arbitrary native account labels.

### Current context

`ContextUsage` contains an opaque `contextGeneration` (not the native Session ID),
optional `turnId` and `modelId`, optional safe-integer `occupiedTokens` and
`capacityTokens`, and optional `lastCompactedAt`. At least one native measurement
is needed for a value. An effective percentage is meaningful only when both
occupied and positive capacity refer to this same context/model/observation.

Optional `breakdown` is `{coverage: 'complete' | 'partial', components, unclassifiedTokens?}`.
There are at most 8 components, each `{kind, tokens}`; kinds are `instructions`,
`tool-definitions`, `conversation`, `tool-results`, `attachments`, `provider-state`.
Kinds are unique, measurements disjoint and their sum cannot exceed the reported
occupancy. `unclassifiedTokens` can be the exact remainder only when occupancy
and known components share compatible measurement semantics. Otherwise omit the
breakdown. A provider total without categories is still useful data.

Compaction can reduce occupancy while lifetime usage grows. Never estimate system
prompts/tools/provider state from transcript length or label missing categories as
empty. Bytes/characters are not tokens. Account/model/native-context changes retire
the previous context gauge rather than attaching it to the new selection. Preserve
Session usage totals independently of a current-context reset.

## Live updates and refresh

Reuse the existing committed outbox, sequence, wake-up, replay, authorization,
heartbeat, backpressure and `resync-required` behavior. Add the discriminated
Session event kind `telemetry` with `changes: {telemetryRevision: number}`.
This is a coordinated contract extension; today's strict event decoders must be
updated, not assumed to accept it. Events carry invalidation only, never unfiltered
account observations. They are emitted only after the corresponding commit.

Bootstrap: fetch telemetry, then open the existing Session stream after its
`eventSeq`. If chat already owns that stream, feed telemetry invalidations from
the same connection; do not open a second stream per panel. If an already-open
stream has observed a telemetry revision newer than an in-flight GET, fetch again.
On invalidation coalesce reads (at most twice per second per mounted Session), GET
with `If-None-Match`, and replace the whole small telemetry snapshot only when its
revision is newer in the same access generation (equal revisions may replace
refresh/freshness projections after revalidation). `accessRevision` changes force
a fresh authorized bootstrap; clear sensitive cached groups and discard responses
started under the previous access generation. SSE closes on a change to relevant
access, including loss of the account-limit permission while Session View remains.
Do not reload chat/history/content. On replay gaps or a
`resync-required`, refetch both subscribed read models with the established
snapshot/replay handshake.

Producer coalescing: commit the latest changed native observation within 500 ms;
active provider pushes therefore aim for UI visibility within about one second,
excluding provider/network delay. Coalesce _before_ durable publication; do not
silently discard assigned outbox sequences. A terminal flush commits outstanding
Turn usage/cost with terminal publication. Shutdown/overload cannot silently lose
an authoritative terminal sample.

Account-limit reads are shared and demand-driven, at most once per 30 seconds per
provider/account binding while at least one authorized consumer is subscribed.
No background polling when none remain. Push-capable providers invalidate sooner.
Native context reads are event-driven; do not launch inference or a second CLI
against an active native context just to populate a gauge. Unsupported live
sources remain unavailable; terminal-only sources remain terminal-only.

Each adapter declares observation expiry; account observations have a maximum
fresh lifetime of 60 seconds. Context observations also expire after 60 seconds,
including after a terminal Turn or Runtime restart. They describe the last
observed occupancy, not a continuing connection to the external native context.
Current-context freshness is invalidated on new
input/native context or model change until a matching observation arrives.
Historical settled usage/cost need no TTL; their coverage/revision remains explicit.
Schedule a persisted freshness invalidation at `staleAt`, so a silent provider does
not leave the UI looking fresh. Refreshing an identical observation can update
its observation/expiry timestamp; identical GETs cannot manufacture a newer revision.
GET projects expiry from persisted timestamps without a write transaction. The
existing subscribed expiry timer publishes committed invalidations for live
consumers. With no subscribers, no expiry write is needed for correct GETs.
Changing a native account outside Runtime is detected by the next identity check,
not by GET. Until then readings retain their original observation time and expire
within 60 seconds; stale data is historical evidence, not a claim about the new
account. A confirmed scope change retires the old account/context observation.

### Explicit refresh

```http
POST /api/sessions/:sessionId/telemetry/refresh
Content-Type: application/json

{"requestId":"<canonical UUID>","groups":["limits","context"]}
```

`groups` is a unique nonempty subset of the four groups; no unknown keys. At most
4 KiB request body. Every selected group must be authorized and refreshable:
otherwise 403 for authorization, or 422 `CAPABILITY_UNSUPPORTED` with the group.
Do not silently omit groups. GET `refreshable` is advisory; command-time checks
are authoritative. Unsupported cost/context refresh does not prevent refreshing
limits in a separate explicit request.

Response: `202 {requestId, acceptedGroups, state:'queued'|'running', telemetryRevision}`.
This acknowledges read scheduling, not new measurements or success. Deduplicate
the same request ID/body per actor/Session for 24 hours; changed body is 409
`IDEMPOTENCY_CONFLICT`. Coalesce native work across concurrent refreshes and retain
per-request receipts without exposing another actor's request ID. Expose shared
queued/running state in GET; completion/failure commits a revision and wakes SSE.
No separate job-polling endpoint is required.
The current shared scheduler admits only account-scoped `limits`. A future context
refresh MUST introduce native-context affinity before it can use shared work;
advertising `context` in a driver alone cannot enable account-scoped coalescence.

Observe the provider/account refresh interval; 429 with `Retry-After` for a new
request exceeding it. Bound work to 10 seconds and at most one in-flight native
read per binding; bounded store/admission failures use existing 503 errors. A
cached GET never waits for this work. Refresh cannot send a prompt, modify a
workspace, resume/replay a Turn, change models or repair authentication.

## Authorization, persistence and bounds

Session View controls stored usage/cost/context reads; Session Manage is additionally
required to trigger an explicit refresh. Account limits also require the separate
`session.view-provider-limits` capability at the trusted project/Session scope.
View plus this capability authorizes passive, shared, read-only native monitoring
while SSE is subscribed, even without Manage. It does not authorize inference,
authentication repair or a manually scheduled POST. Manage governs that explicit
command; a user may view monitored observations while `refreshable` is false.
Without it, return `limits` unavailable with `NOT_AUTHORIZED`, no cached amount,
timestamps or window IDs. Reject requested limit refresh without it. Auth policy
changes invalidate actor-visible validators and reproject before further payloads.
GET/SSE use the same checker and revocation behavior as the existing Session API.

The HTTP snapshot includes a safe `migration.status` diagnostic during normal
operation. A failed background migration remains observable as `failed` while
historical aggregates retain `BASELINE_MISSING`; raw SQLite messages and paths
never enter this field. Restart retries from the durable migration checkpoint.

Native monetary numbers are exact-only within the canonical 12-decimal contract.
Invalid or unrepresentable optional Claude cost is omitted without rejecting an
otherwise authoritative Turn result, and is never silently rounded into the
ledger. Native Codex percentages use a resolution of 10^-12 percentage points,
rounding upward; valid tiny usage cannot become a fabricated zero. Codex context
generations identify local observation epochs: confirmed compaction changes the
epoch, duplicate completion does not, and a new protocol lifetime starts a new
epoch rather than claiming continuity across an unobserved restart.

Keep canonical usage/cost and replay/freshness publication in the existing SQLite
owner/transaction coordinator. Keep the shared provider-limit cache in the provider
integration boundary, persist only sanitized observations through that owner and
project by Session binding. Fence late samples on invocation/native context/account
and credential generation. No second Session lifecycle or database writer.

Response bound: 32 KiB UTF-8 JSON; reasons are enumerated codes; arrays are bounded.
All objects reject unknown fields, timestamps are UTC ISO strings, revisions are
safe integers, and no raw native payloads/paths/identities escape. Overflow is an
explicit error, never truncation of financial/window meaning.

Return a strong opaque ETag over the authorized projection revision and access
generation; require private revalidation (`Cache-Control: private, no-cache`, no
shared-cache reuse). Authorize before evaluating `If-None-Match`, including 304.
Freshness/refresh state transitions change the validator; do not include request
wall-clock time in every response. This route-specific policy is a proposed
exception to existing Sessions `no-store`, not a global cache-policy replacement.

## Implementation readiness and acceptance

The snapshot, explicit refresh, SSE invalidation, access generation and account-limit
permission are implemented. Built-in admin has the new account-limit permission;
developer/viewer do not acquire it implicitly. Trusted local mode retains its
existing all-capabilities behavior. No frontend adapter/rendering was changed.

| Source      | Implemented observations                                                                                                              | Explicit refresh                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Claude      | Existing Turn tokens, cache writes, cumulative estimated USD with fresh-context baseline and native five-hour/seven-day limit windows | None; observations arrive through the active invocation            |
| Codex       | Existing cumulative tokens, native latest context occupancy/capacity and opaque generation                                            | Read-only account-limit windows, no thread/Turn creation or resume |
| Antigravity | Existing cumulative tokens/reasoning/cache-read counters                                                                              | None; bare cost has no proven currency and remains unavailable     |

Native source mappings remain a per-provider prerequisite: verify monetary units,
token overlap, usage basis, context meaning and limit windows using controlled
fixtures before enabling each field. Missing support is a valid unavailable result,
not evidence that an invented observation should be shown.

Verification includes: GET without launching providers/transcript scans; complete
and partial aggregates across restart/replay; currency/overlap validation; account
switch and late events; compaction and model change; stale/failed observation;
403/304 isolation; refresh idempotency/coalescing/timeout/429; snapshot-to-SSE race,
reconnect/resync, slow readers and terminal flush. Test 32 idle clients: zero
outbox polling and no per-client provider reads, one bounded shared account read
per interval only when supported and authorized. No test uses real subscriptions,
credentials or paid inference. No UI implementation belongs to this delivery.

SQLite schema 1 migrates atomically to additive schema 2. Existing normalized Turn
summaries migrate asynchronously in batches of at most 100 rows, followed by
bounded Session publication. Reads do not scan transcripts. Legacy aggregates are
unavailable with `BASELINE_MISSING` until their baseline is ready, and imported
v1 usage remains partial because old records lack coverage provenance. Existing
empty Sessions and newly created Sessions establish a complete baseline without
fabricated historical measurements. Interrupted refresh state is recovered as
failed/idle without replaying provider work. Observed money is never inferred
from an unqualified legacy numeric amount.
