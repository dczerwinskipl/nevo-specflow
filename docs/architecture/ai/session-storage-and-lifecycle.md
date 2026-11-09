---
id: architecture.ai.session-storage-and-lifecycle
type: architecture
title: Managed Session persistence and lifecycle design
status: current
scope: specflow
areas: [ai, runtime, security, testing]
tags: [sessions, sqlite, durability, recovery, pagination]
read_when:
  - implementing managed Session storage or admission
  - implementing Session tail reads and restart recovery
  - recovering a Session blocked by an unknown Turn
  - changing the Session SQLite schema
summary: >
  Independent Sessions, worker-owned SQLite, one local Runtime owner, transactional
  admission, store admission bounds, bounded reads, schema migration, and positive-evidence
  crash recovery.
related:
  - architecture.ai.canonical-session-turn-work
  - architecture.ai.provider-boundary
  - architecture.runtime.ownership-and-lifecycle
  - reference.api.sessions
  - reference.protocols.session-provider-driver
---

# Managed Session persistence and lifecycle

The independent Session boundary is an owner decision recorded in the canonical AI model.

## Independent capability

Session owns identity, configuration, Turn/Work/ToolAction, interactions, history, semantic
projections and provider invocation. Core records and operations do not require spec/task/workflow
identifiers. Associations live outside the core aggregates: an association module owns sidecar
tables in the same database (see [Authorization and associations](#authorization-and-associations)),
and the core writes the association payload verbatim in the create transaction without reading it
for lifecycle decisions. A product-local storage namespace and verified execution environment do not
constitute Specification ownership.

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

Store: `<verified Project Home>/.nevo/local/state/sessions/sessions.sqlite`.
The feature owns this database, WAL and SHM files. Use foreign keys, WAL, synchronous FULL,
bounded busy timeout (5 seconds), schema version and transactional schema changes.
Refuse a future unsupported schema; never silently recreate a nonempty invalid database
(see [Schema migration](#schema-migration)).
No native history import, old-JSON loader, compatibility aliases or automatic transcript conversion.
Filesystem is local to one host; shared network filesystems and multiple active Session Runtimes
for the same database are unsupported.

Enforce that restriction with a singleton owner row acquired in BEGIN IMMEDIATE, containing
runtime UUID, monotonically increasing epoch and PID. A second owner fails with
SESSION_STORE_BUSY. Never steal based on elapsed time, heartbeat absence or missing HTTP listener.
Take over only after an injected process probe positively establishes that the recorded PID
does not exist on this host. Permission errors/uncertainty mean busy. An alive reused PID may
conservatively block startup; do not kill it or pretend it is the old Runtime. Operator recovery
stops the conflicting process or uses an offline, explicitly confirmed maintenance operation
outside this feature. No force-takeover endpoint is included.

Every write transaction verifies runtime UUID/epoch; callbacks carry the invocation ID as well.

Store admission is bounded, not an unbounded retry queue: ordinary requests stop at 48 concurrent
Worker commands; the remaining slots up to 64 are reserved for lifecycle-critical work (provider
facts, dispatch, delivery receipts, close). At most 64 lifecycle requests wait, FIFO, each with a
5-second admission deadline; exhaustion or Worker loss is an explicit `SESSION_STORE_BUSY` /
unavailable rejection, never dropped success. A sequenced provider fact rejected with transient
`SESSION_STORE_BUSY` is retried at most twice, identically (same invocation, sequence and fact),
after 25 ms and 100 ms, and only within a two-second window for starting retries; Worker
deduplication absorbs a commit whose acknowledgement was lost, and a replayed `lost` fact preserves
unknown. Provider input is never resent. A failed lifecycle write cannot fabricate a terminal
result; permanent failure records uncertainty and a persistently unavailable store needs restart
recovery.
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
bound to two application Sessions. Native import/attach is excluded.

Schema version 3 adds list projection columns to `sessions`, maintained by `saveSession` in the
same statement as the JSON snapshot, so a list never decodes a snapshot per row:
`created_seq` (monotonic creation order from a meta counter, never rewritten), `archived_at`,
`readiness` and `updated_at`, with `sessions_created(project, created_seq)` (unique) and
`sessions_archived(project, archived_at, created_seq)`. The title stays in the snapshot: a list page
decodes only the rows it returns. The 2 -> 3 migration runs in one transaction and backfills the
four columns by decoding each existing snapshot once (`created_seq` in `createdAt` order, ties by
rowid). Version 3 also creates the association tables (below), empty: Sessions created before it
are standalone. Versions 0-3 are accepted; a later version is refused.

Session create allocates an ID and configuration before provider execution. Native correlation
may arrive later and must pass the same epoch/invocation fence. A stale callback never binds or
mutates a replacement/terminal Turn. Provider configuration is pinned at Session create; optional
Turn overrides are recorded on admission, separately from later provider catalogue changes.

Commands use durable idempotency keyed by trusted actor, command kind, aggregate scope and UUID
requestId. Fingerprint normalized explicit input. Look up an existing accepted request after
authorization but before current provider/readiness validation. Matching input returns the original
accepted result even after terminalization/restart; different input gives IDEMPOTENCY_CONFLICT.
Exception: rename, archive and unarchive replays answer the current effective SessionInfo rather
than a stored copy, still without a second effect.
Keep accepted keys for the Session lifetime. Session delete removes its Session-scoped keys; the
project-scoped create key is kept, so a late create retry replays the deleted sessionId, whose use
is then 404.
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
Only positive reconciliation evidence can remove that block. There is no force-recover API.

### Positive evidence and operator recovery

Startup settles an admitted real Turn as interrupted only when its persisted native dispatch
barrier was not crossed; it never replays the input. Repeated start request IDs return the same
admission.

| Evidence                                                                 | Safe action                                                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Persisted native context and dispatch-intent = 0 after owner death       | Interrupt the undispatched Turn; a new explicit intent may use the original confirmed context and bindings. Never retry the message. |
| Confirmed native context and dispatch-intent = 1                         | Context identity alone does not prove the operation stopped or completed. Retain unknown.                                            |
| Dispatch-intent = 1 without confirmed native context                     | The request may have executed. Retain unknown; never resend or allocate a replacement native context.                                |
| Failed native answer delivery or uncertain write                         | Retain admission/idempotency; mark the operation unknown. Never resend an answer automatically.                                      |
| Missing provider/account/workspace, or unproven process-tree termination | Keep the Session unavailable for new Turns; restore and verify the original binding before any reconciliation.                       |

Unknown Turns carry safe reasons distinguishing missing context, unavailable provider evidence and
missing settlement. There is no force-success or force-failure endpoint. Operators MUST NOT edit
SQLite, remove a barrier or clear a native context to unblock a Session; preserve the database and
the original provider state. An operator first establishes that the old Runtime and its owned
provider tree have stopped. The authenticated reconcile command can consume an exact Engine
settlement receipt; a dispatched Turn without such evidence stays blocked until provider-specific
positive reconciliation exists. A separate new Session is a new conversation, not recovery of the
old one, and must wait until any possibly surviving process affecting the workspace is contained.

## Archive and delete

Archive marks the Session read-only (`archivedAt`); it is admitted only when no Turn is nonterminal
or unknown, checked in the same transaction as the write, and new Turn starts and interaction
responses are refused while archived. Unarchive clears the mark. Neither cancels anything.

Delete is a hard delete inside one Worker transaction. It refuses with SESSION_DELETE_BLOCKED while
a detached nonterminal Turn carries an unsettled Engine effect binding, and with TURN_CONFLICT
while any other Turn is nonterminal or unknown or the coordinator still holds a live invocation for
the Session. Otherwise it removes every Session-owned row: the Session record, provider context,
Turns, conversation entries, Work, actions, content with its chunks and revisions, text keys,
interactions, idempotency records scoped to the Session (the project-scoped create record is kept
on purpose), fact/usage/telemetry deduplication rows of its invocations, Session usage, telemetry
state, the association and its Task rows, and the event outbox. A single delete map classifies every table as Session-owned or global;
a test fails when the schema gains a table the map does not classify. Engine records keep the Session
ID as audit data; provider-native transcripts are left in place. Subscribers are woken by the commit
and close because the Session no longer resolves. There is no tombstone.

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

## Schema migration

The schema version is SQLite `user_version`. Initialization runs every forward migration in a
single `BEGIN IMMEDIATE` transaction, holding the write lock against concurrent openers and
re-reading the version under it: ordered DDL, data transforms/backfill and the new version commit
together, and any failure rolls back schema, data and version together, so an interrupted upgrade
is retried rather than presented as complete. A migration MUST preserve Session/Turn/Work IDs,
request hashes and accepted results, content offsets and revisions, and outbox sequences. An unknown
future version, or a nonempty database without a recognized schema, fails closed with
`SESSION_STORE_UNAVAILABLE`. There is no general migration framework, legacy-format loader or
compatibility alias. Migration tests SHOULD open a real fixture of the previous version.

## Scope boundary

Document writes, Engine-managed claims and workflow completion are owned by their own features;
they are not hidden work inside this store or coordinator.
