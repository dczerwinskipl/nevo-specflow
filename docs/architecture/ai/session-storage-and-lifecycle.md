---
id: architecture.ai.session-storage-and-lifecycle
type: architecture
title: Managed Session persistence and lifecycle design
status: draft
scope: specflow
areas: [ai, runtime, security, testing]
tags: [sessions, sqlite, durability, recovery, pagination]
read_when:
  - implementing managed Session storage or admission
  - implementing Session tail reads and restart recovery
summary: >
  Decided implementation design for independent Sessions, worker-owned SQLite,
  one local Runtime owner, transactional admission, bounded reads and crash recovery.
related:
  - architecture.ai.canonical-session-turn-work
  - architecture.ai.provider-boundary
  - architecture.runtime.ownership-and-lifecycle
  - reference.api.sessions
  - reference.protocols.session-provider-driver
---

# Managed Session persistence and lifecycle

Plan 04 implements this design in PR #98. It remains draft pending independent review;
the migration evidence document records executed verification separately from design obligations.
Current architecture wins.
The independent Session boundary is an owner decision recorded in the canonical AI model.

## Independent capability

Session owns identity, configuration, Turn/Work/ToolAction, interactions, history, semantic
projections and provider invocation. Core records and operations do not require spec/task/workflow
identifiers. Associations live above the core. A product-local storage namespace and verified
execution environment do not constitute Specification ownership.

Runtime composition injects a trusted storage context:
`{ projectId, absoluteStateDirectory }`. The product resolves it from verified Project Home;
the core never discovers a repository or imports Specs/Tasks/Engine implementations. Initially
one store serves one local project. A Session's projectId is immutable access scope, not its ID.
Execution context is a separate injected port; the foundation mock has no filesystem effects.

## Storage choice and process model

Use Node 24's built-in `node:sqlite` in a dedicated Worker thread, with async request/response
ports to Runtime. DatabaseSync and synchronous SQLite operations stay entirely in that worker.
Do not add a native npm database dependency, block the HTTP event loop or read an entire transcript.
Package the Worker entry with the installed artifact; test startup from an installed tarball.
Node 24.20.0 on the inspected host exposes DatabaseSync; portability still needs implementation tests.

Store: `<verified Project Home>/.nevo/local/state/sessions/sessions.sqlite`.
The feature owns this database, WAL and SHM files. Use foreign keys, WAL, synchronous FULL,
bounded busy timeout (5 seconds), schema version and transactional schema changes.
Refuse a future unsupported schema; never silently recreate a nonempty invalid database.
No native history import, old-JSON loader, compatibility aliases or automatic transcript conversion.
Filesystem is local to one host; shared network filesystems and multiple active Session Runtimes
for the same database are unsupported in this delivery.

Enforce that restriction with a singleton owner row acquired in BEGIN IMMEDIATE, containing
runtime UUID, monotonically increasing epoch and PID. A second owner fails with
SESSION_STORE_BUSY. Never steal based on elapsed time, heartbeat absence or missing HTTP listener.
Take over only after an injected process probe positively establishes that the recorded PID
does not exist on this host. Permission errors/uncertainty mean busy. An alive reused PID may
conservatively block startup; do not kill it or pretend it is the old Runtime. Operator recovery
stops the conflicting process or uses an offline, explicitly confirmed maintenance operation
outside this feature. No force-takeover endpoint is included.

Every write transaction verifies runtime UUID/epoch; callbacks carry the invocation ID as well.
Startup acquires ownership and reconciles the indexed set of active records before registration.
Graceful shutdown stops admission, cancels owned invocations, persists settlement, closes streams,
releases ownership by compare-and-set and closes the worker. If settlement fails, retain evidence;
do not announce a clean release. Restart recovery requires no scan of settled transcript content.

## Durable model and indexed access

Use separate records for:

- Sessions and small current projections;
- Turns and invocations (with partial unique index for one nonterminal Turn per Session);
- ordered Work and nested ToolAction, with immutable IDs/kinds and per-item revision;
- conversation entries (small previews, stable Session-wide order, content references);
- immutable UTF-8 content chunks (at most 16 KiB), indexed by content/revision/offset;
- interactions and private adapter correlation;
- command idempotency and the canonical event outbox.

These are responsibilities, not mandatory table names. Index tail/history by
(sessionId, conversationOrdinal), Work by (turnId, workOrdinal), content by
(contentId, revision, byteOffset), events by (sessionId, eventSeq), recovery by nonterminal state.
IDs are app-owned UUIDs; provider locator is separate (provider, providerSessionId). Neither path,
route nor provider string shape defines identity. One provider session locator cannot be actively
bound to two application Sessions in this delivery. Native import/attach is excluded.

Session create allocates an ID and configuration before provider execution. Native correlation
may arrive later and must pass the same epoch/invocation fence. A stale callback never binds or
mutates a replacement/terminal Turn. Provider configuration is pinned at Session create; optional
Turn overrides are recorded on admission, separately from later provider catalogue changes.

Commands use durable idempotency keyed by trusted actor, command kind, aggregate scope and UUID
requestId. Fingerprint normalized explicit input. Look up an existing accepted request after
authorization but before current provider/readiness validation. Matching input returns the original
accepted result even after terminalization/restart; different input gives IDEMPOTENCY_CONFLICT.
Keep accepted keys for the Session lifetime; no DELETE/purge API is part of the foundation.
Validation/auth failures before admission have no accepted operation. Concurrent requests serialize.

## Transactions and lifecycle

Admission atomically writes Turn, invocation, request entry, user conversation entry, current
projection and outbox event. Persist dispatch intent before invoking a driver. New dispatch is
forbidden while the Session has a nonterminal/unknown invocation. A matching request is replayed,
not redispatched. Drivers consume explicit invocation identity and ordered neutral facts.

Canonical Turn phases: active, waiting, waitingForUser, cancelling, unknown, terminal.
Terminal outcomes: completed, failed, cancelled, interrupted. Terminal records and their Work
never change. unknown is nonterminal and unavailable for new starts, not an inferred failure.
Readiness priority: store/recovery/unknown unavailable; pending valid interaction requiresAttention;
other nonterminal Turn busy; otherwise ready if the configured provider is usable, unavailable
if not. Tool failure alone does not fail its Turn.

One pure reducer validates transitions, Work kind/order, interaction validity and outcome.
The coordinator arbitrates protocol completion, cancel, timeout, exit and failure through it.
The first accepted terminal transition wins; an already recorded cancellation intent makes a
later provider completion settle cancelled once the operation has stopped. A timeout recorded
first remains timeout failure. A disconnected HTTP client never cancels a Turn.

Each canonical update commits affected records, current projection and outbox together, before
broadcast. Readers see a transactionally consistent small snapshot. Events contain bounded deltas
or invalidations, never the growing full Turn. Sequence is Session-wide and survives restart.
Several native interaction requests are queued in Work creation order. Only the oldest valid
pending interaction is answerable; resolving it exposes the next. Cap pending interactions at
32 per Session. Overflow is an explicit protocol failure and cancellation request, retaining
unknown/cancelling until settlement rather than silently dropping a permission request.
Usage samples declare delta/Turn-total/Session-cumulative provenance; deduplicate source samples,
never add repeated totals. Reasoning and commentary remain distinct.

Cancel is a durable request, not proof of stopped side effects. Keep cancelling/unknown until
the driver proves settlement; record no invented success on process exit. On clean shutdown
the read-only mock settles interrupted. On restart, a dead owner's mock Turns become interrupted,
pending live interactions become expired and open Work is explicitly closed. A future real-driver
invocation with uncertain external effects remains unknown and cannot be automatically replayed.
Only positive reconciliation evidence can remove that block. Plan 04 does not expose a force-recover API.

## History, content and replay

The exact bounded API is in reference.api.sessions. Tail queries never read content chunks or scan
all Turns, derive a total count or fold an entire event log. Small materialized projections are
updated with canonical writes and recovered from active records. A newly opened long Session
and a cache miss use the same bounded path.

History cursors pin membership/order, not an indefinite database transaction. Older settled entries
are immutable; active entries may be returned at a newer item revision. Page replies identify their
observed event sequence; clients merge by stable ID/revision. A new live entry does not shift a
cursor's older membership. No offset paging. Large single Turns are independently pageable.

Outbox retention is 24 hours or the latest 10,000 events per Session, whichever retains fewer.
Expiry is independent of persisted conversation history. Replay reads indexed bounded batches;
if the next required sequence was pruned, send resync-required and obtain a new bounded snapshot.
Never synthesize complete history from an incomplete event log.

## Authorization and associations

Reuse existing session.create/view/manage and flat-role coverage. Create requires session.create
at trusted {projectId}; existing Sessions use {projectId, sessionId} loaded from the store.
There is no creator ACL or automatic creator grant: configured project/global roles determine
sharing; creator is audit metadata only. A sessionId-scoped grant can allow one existing Session
but cannot create another. A specId-only assignment does not cover an independent Session.
Access-disabled mode follows existing Auth policy; use its stable internal audit/idempotency key,
not a client-supplied user ID.

The integration layer may associate a Session with a Specification/Task only after checking both
resources. This delivery adds no relation mutation API, automatic grant inheritance, cascade delete
or implicit workflow progression. Existing SessionReferenceOwner is an associated-view port; it
must not become the required identity type for the core. Rebinding a workspace cannot silently
relocate a provider-native Session.

## Readiness boundary

All foundation decisions above are fixed for implementation. Acceptance proves no-effect mock,
storage/index behavior, scoped API and real UI. Real adapters, document writes, Engine managed
claims and workflow finish are downstream deliveries with separate acceptance, not hidden work
inside this store or coordinator.
