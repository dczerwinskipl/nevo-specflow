---
id: reference.api.session-telemetry
type: reference
title: Proposed Session telemetry HTTP and live update contract
status: draft
scope: specflow
areas: [ai, runtime, server, security, ui]
tags: [sessions, telemetry, usage, cost, limits, context, sse]
read_when:
  - designing provider telemetry producers and Session telemetry readers
  - implementing live UI consumption of token usage, costs, limits and context size
summary: >
  Proposed bounded Session telemetry snapshot, explicit refresh and existing-stream
  invalidation contract, with provider provenance, freshness and partial availability.
related:
  - reference.api.sessions
  - ideas.specflow-runtime.ai-adapters.usage-accounting
  - ideas.specflow-runtime.session-v10-backend-readiness
---

# Proposed Session telemetry API

**Proposal only; not implemented.** This document owns the proposed wire contract.
The existing Sessions API remains unchanged until coordinated schema/server/client
implementation. No UI implementation, Task/Specification/Workflow integration,
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
fresh lifetime of 60 seconds. Current-context freshness is invalidated on new
input/native context or model change until a matching observation arrives.
Historical settled usage/cost need no TTL; their coverage/revision remains explicit.
Schedule a persisted freshness invalidation at `staleAt`, so a silent provider does
not leave the UI looking fresh. Refreshing an identical observation can update
its observation/expiry timestamp; identical GETs cannot manufacture a newer revision.

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

Observe the provider/account refresh interval; 429 with `Retry-After` for a new
request exceeding it. Bound work to 10 seconds and at most one in-flight native
read per binding; bounded store/admission failures use existing 503 errors. A
cached GET never waits for this work. Refresh cannot send a prompt, modify a
workspace, resume/replay a Turn, change models or repair authentication.

## Authorization, persistence and bounds

Session View controls stored usage/cost/context reads; Session Manage is additionally
required to trigger refresh. Account limits also require a proposed separate
`session.view-provider-limits` capability at the trusted project/Session scope.
That permission is a new Auth contract dependency, not an existing capability.
Without it, return `limits` unavailable with `NOT_AUTHORIZED`, no cached amount,
timestamps or window IDs. Reject requested limit refresh without it. Auth policy
changes invalidate actor-visible validators and reproject before further payloads.
GET/SSE use the same checker and revocation behavior as the existing Session API.

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

The snapshot/event/refresh behavior above is defined for planning. Implementation
also depends on the explicit Auth capability and access-generation projection;
these must be delivered through Auth's owner before exposing account observations.
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
