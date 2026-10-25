---
id: reference.api.sessions
type: reference
title: Managed Sessions HTTP and read-model contract
status: draft
scope: specflow
areas: [ai, runtime, server, security, ui]
tags: [sessions, pagination, tail, streaming, idempotency]
read_when:
  - implementing Session schemas, HTTP or UI clients
  - implementing tail/history cursors and replay
summary: >
  Implementation contract for independent Session commands, bounded snapshots,
  conversation and Work paging, content ranges, scoped authorization and SSE resync.
related:
  - architecture.ai.session-storage-and-lifecycle
  - architecture.ai.canonical-session-turn-work
  - reference.protocols.session-provider-driver
  - ideas.specflow-runtime.managed-sessions-delivery
---

# Managed Sessions API

Plan 04 foundation contract, implemented on `feature/managed-sessions-foundation` in PR #98.
This document remains draft pending independent review. Schemas/types live in
`@nevo/specflow-contracts/sessions`. No aliases for legacy /agent-sessions or DemoSession.
All JSON objects reject unknown keys. Optional fields are omitted, never overloaded null values.
IDs below are canonical UUIDs except provider/model IDs, content revision and opaque cursors.
Sequences/revisions are nonnegative safe integers; overflow fails closed, not wraparound.
Timestamps are UTC ISO-8601 strings. Byte limits refer to UTF-8, not JavaScript string length.

## Enable the foundation

Add this project-owned top-level section to `.nevo/config.yaml`:

```yaml
sessions:
  enabled: true
  providers:
    mock:
      enabled: true
```

Both flags default to false. Local overrides and unknown provider keys are rejected.
Start the existing product server and open `/sessions/new`; created chats use `/sessions/:sessionId`.
The explicitly labelled mock performs no external effects. Real provider launch, imported Nevo
history and writable Engine execution are outside this foundation. Disabling only the provider
keeps stored reads available. Disabling the feature acquires no database owner.

## Authorization and transport

Authentication/authorization, origin protection and shared rate limits use existing Runtime
boundaries. Cache-Control: no-store applies. Never include raw provider IDs, process handles,
private interaction IDs, local absolute paths or provider payloads in ordinary DTOs.

Create and provider catalogue: session.create at server-derived {projectId}.
Existing resource reads: session.view at store-derived {projectId, sessionId}.
Start/cancel/respond: session.manage at that same scope. Check access before protected source
reads; a small identity lookup may precede target authorization. No actor/scope/specId from a
request is an authority. Missing auth -> existing 401 authentication_required; forbidden -> 403
forbidden; unknown ID -> 404 SESSION_NOT_FOUND after access handling. Existing Auth conventions
remain authoritative; no new per-creator ACL is introduced.

SSE additionally reauthorizes before every replay/live batch and at least every 30 seconds while
idle, via an injected Auth-owned checker. On revoked access/expired authentication close the
stream without more payload. Sessions does not read Auth cookies or implement login renewal.
The checker resolves current trusted access/policy through Auth's public boundary.

## Common shapes

```ts
type TurnState = 'active' | 'waiting' | 'waitingForUser' | 'cancelling' | 'unknown' | 'terminal';
type Outcome = 'completed' | 'failed' | 'cancelled' | 'interrupted';
type Readiness = 'ready' | 'busy' | 'requiresAttention' | 'unavailable';
type WorkKind = 'commentary' | 'reasoning' | 'interaction' | 'tool';
type ContentRef = { contentId: string; revision: string; byteLength: number };
type TextPreview = {
  text: string; // <=2 KiB, valid UTF-8 boundary
  complete: boolean;
  content?: ContentRef; // required if complete=false
};
type CurrentActivity = {
  kind:
    | 'responding'
    | 'commentary'
    | 'reasoning'
    | 'tool'
    | 'waiting'
    | 'attention'
    | 'cancelling'
    | 'unknown';
  turnId: string;
  workId?: string;
  label: string; // <=1 KiB, safe user-facing provider-supplied/semantic text
};
type ConversationEntry = {
  id: string;
  ordinal: number; // Session-wide, immutable creation order
  revision: number; // monotonic item version
  turnId: string;
  kind: 'request' | 'commentary' | 'work-summary' | 'answer' | 'outcome';
  text: TextPreview;
  workId?: string;
  createdAt: string;
};
type SessionInfo = {
  sessionId: string;
  projectId: string; // trusted hosting scope; not a Specification
  title?: string; // <=256 characters
  providerId: string;
  modelId?: string;
  mode: 'read-only' | 'workspace-write';
  effort?: string;
  readiness: Readiness;
  capabilities: {
    view: boolean;
    manage: boolean; // effective authorization projection
    start: boolean;
    cancel: boolean;
    questions: boolean;
    permissions: boolean; // usable operation projection
  };
  createdAt: string;
  updatedAt: string;
};
type ActiveTurn = {
  turnId: string;
  state: Exclude<TurnState, 'terminal'>;
  revision: number;
  startedAt: string;
};
type Snapshot = {
  session: SessionInfo;
  revision: number; // projection revision, not an Engine precondition
  eventSeq: number; // applied canonical event boundary
  activeTurn?: ActiveTurn;
  currentActivity?: CurrentActivity;
  interaction?: Interaction;
  entries: ConversationEntry[]; // oldest -> newest inside this tail window
  history: { hasOlder: boolean; before?: string };
};
```

Turn summaries (from Work pages/events) include turnId, state, revision, createdAt, updatedAt,
optional completedAt/outcome/error, userMessage and finalAnswer TextPreview, and usage.
outcome/completedAt are required exactly for terminal state; no raw Work array in a summary.
Usage is optional {inputTokens?, outputTokens?, cachedTokens?, reasoningTokens?}, nonnegative safe
integers with unknown fields omitted. Adapter provenance/deduplication is internal; no invented cost.
Conversation entries reference this canonical data; they do not become another lifecycle authority.

Interaction is a discriminated union:

- {interactionId, turnId, workId, revision, kind:'question', prompt, options?: [{id,label}],
  allowText:boolean};
- {interactionId, turnId, workId, revision, kind:'permission', prompt, actionSummary}.

At most one answerable interaction per Turn. prompt/actionSummary <=8 KiB each, <=20 options,
each ID <=128 characters and label <=512 bytes; entire Interaction <=24 KiB. The driver must
reject/map unsupported oversize interaction input explicitly; never silently hide required choices.
Only an active, reconstructable interaction is included. Expired interactions remain historical Work.
Question/permission content and options are immutable while answerable. Replacing a question
allocates a new interactionId and expires the old one; a stale form cannot answer changed content.

## Routes and commands

| Route                                                             | Request                              | Success                       |
| ----------------------------------------------------------------- | ------------------------------------ | ----------------------------- |
| GET /api/session-providers                                        | none                                 | {items: ProviderDescriptor[]} |
| POST /api/sessions                                                | CreateSession                        | 201 {sessionId}               |
| GET /api/sessions/:sessionId                                      | none                                 | 200 Snapshot (tail)           |
| GET /api/sessions/:sessionId/history                              | before cursor, optional limit        | 200 HistoryPage               |
| GET /api/sessions/:sessionId/turns/:turnId/work                   | optional before cursor and limit     | 200 WorkPage                  |
| GET /api/sessions/:sessionId/work/:workId/actions                 | optional before cursor and limit     | 200 ActionPage                |
| GET /api/sessions/:sessionId/content/:contentId                   | revision, optional offset/limitBytes | 200 ContentPage               |
| POST /api/sessions/:sessionId/turns                               | StartTurn                            | 202 {turnId}                  |
| POST /api/sessions/:sessionId/turns/:turnId/cancel                | {requestId}                          | 202 {turnId}                  |
| POST /api/sessions/:sessionId/interactions/:interactionId/respond | Respond                              | 202 {turnId, interactionId}   |
| GET /api/sessions/:sessionId/events                               | optional after sequence              | text/event-stream             |

No core spec/task prefix, GET-all-transcript endpoint, attach/import, deletion, list-all count,
force-recovery or workflow finish endpoint. A new conversation launcher obtains its new ID
from POST; no list endpoint is required for the foundation. Product lists consume later association
projections. Disabled Session capability gives 503 SESSION_DISABLED for these routes.

```ts
type CreateSession = {
  requestId: string;
  providerId: string; // bounded identifier 1..128 characters
  modelId?: string; // 1..256 characters
  mode: 'read-only' | 'workspace-write';
  effort?: string; // 1..64 characters
  title?: string;
};
type StartTurn = {
  requestId: string;
  message: string; // nonblank, <=128 KiB
  modelId?: string;
  effort?: string;
};
type Respond =
  | { requestId: string; kind: 'question'; answer: { optionIds: string[]; text?: string } }
  | { requestId: string; kind: 'permission'; decision: 'allow' | 'deny' };
```

Respond answer text <=16 KiB, option IDs must be declared, duplicate option IDs invalid;
text only when allowText. Empty answer invalid unless the question explicitly offers an empty
option (through its ID). Denied permission resolves the interaction; it does not automatically
fail the Turn. Start inherits pinned Session mode; this foundation exposes no mode-changing command.
Unsupported model/effort overrides fail CAPABILITY_UNSUPPORTED, never silently ignore.

Route bodyLimit: 256 KiB Create/Start, 64 KiB respond/cancel. Exceed -> 413 SESSION_PAYLOAD_TOO_LARGE.
Session allocate does not launch the provider. Enforce requestId semantics from the storage design
for all four commands, including create and cancel. Duplicate cancel after terminal is accepted
as no-op for that Turn; it must never cancel a later Turn. Respond duplicate with same accepted
requestId returns its original response; a fresh response to an already resolved interaction conflicts.

## Bounded history and Work

Snapshot limit is fixed: up to the latest 40 conversation entries, <=256 KiB UTF-8 JSON overall, no full
content chunks or complete Turn hydration. Entry previews include references when shortened.
History default/max 40 entries, <=256 KiB overall. One indexed lookahead establishes hasOlder,
not an exact count. Response:

The byte budget includes JSON escapes, metadata and the signed cursor. If the indexed count-bounded
window exceeds it, return a smaller contiguous newest window and set the cursor immediately before
its oldest returned item. Do not skip excluded entries or scan older rows to fill the page. Work and
ToolAction pages use the same count-and-byte policy.

```ts
type HistoryPage = {
  sessionId: string;
  eventSeq: number; // observation boundary of this page transaction
  entries: ConversationEntry[]; // ascending, exclusive of cursor boundary
  history: { hasOlder: boolean; before?: string };
};
```

Start history with Snapshot.history.before; subsequent pages use returned before. before is present
iff hasOlder. A normal empty result means confirmed end. No unbounded scan to fill a page.
History tokens encode signed {version, storeGeneration, projectId, sessionId, actorKey,
collection, upperOrdinal, expiresAt}, with 24-hour expiry. Work/actions add parent ID and use their
own collection order. The HMAC key persists in ignored local state; restart does not expire otherwise
valid tokens. Verify the token and current authorization every request. Tokens are not access grants.
Changing policy is enforced by current Auth, not a policy object identity stored in the token.

upperOrdinal is exclusive: query earlier entries by indexed range, return up to limit then reverse
to ascending display order. Tokens pin older membership/order; item content may be more recent
than the initial snapshot. revision comparison prevents stale pages overwriting live state.
A page boundary may split a Turn; clients group by turnId without inventing another Turn.

WorkPage = {sessionId, turn: TurnSummary, eventSeq, items: WorkSummary[], history}.
WorkSummary = {workId, ordinal, revision, kind:WorkKind, state:'queued'|'active'|'waiting'|
'completed'|'failed'|'cancelled'|'interrupted'|'expired', title:TextPreview, content?:ContentRef,
actionCount?:number, createdAt, updatedAt}. Interaction status maps to this bounded Work view,
but answerability is only the canonical Interaction projection. actionCount, when present,
is transactionally maintained, never a scan at read time.
ActionPage = {sessionId, workId, eventSeq, items: ToolActionSummary[], history}.
ToolActionSummary = {actionId, ordinal, revision, state, title:TextPreview,
input?:ContentRef, output?:ContentRef, error?:{code,message}, createdAt, updatedAt}.
state uses the Work state vocabulary. Error message <=2 KiB. Only tool Work owns actions.
Work/action limits match HistoryPage. Exact Work identity/kind is immutable; no raw SDK objects.

ContentPage = {contentId, revision, offset, text, nextOffset?, complete}.
revision is required and immutable. offset defaults 0; limitBytes defaults/max 64 KiB.
Offsets count UTF-8 bytes and must be valid character boundaries; invalid/out-of-range -> 400.
Return the longest valid UTF-8 prefix within the byte budget, nextOffset iff more remains.
Old referenced revisions are retained for the Session lifetime, including for actively growing
text; use immutable chunk references/prefix manifests rather than copying all prior text per delta.
Append-only text revisions can identify immutable published prefixes by length/generation with
constant-size revision metadata. Do not copy a growing chunk list or rehash the whole text on each
delta; edits/replacements allocate a new content generation while retaining referenced prefixes.
No compression is required for these limits to hold. Expanding text reads only that content range.
Auth verifies content/Turn/Work membership in the selected Session before returning any bytes.

## Event stream

Initial sequence: first GET Snapshot, then GET events?after=Snapshot.eventSeq.
Event IDs equal canonical eventSeq. Use Last-Event-ID when query after is absent; conflicting
values are 400 SESSION_CURSOR_INVALID. after in the future is invalid. No after/header means
start after a current transaction boundary, never full replay from the beginning.

Each frame: id: <eventSeq>, event: session-change, data: JSON envelope:
{sessionId, eventSeq, kind, changes}. kind is one of session, turn, conversation, work,
interaction. changes carries bounded upserts/references for that kind, using the shapes above,
and the current Session/activeTurn/currentActivity/interaction projection as needed.
The changes object is discriminated by kind:

- session: {session: SessionInfo};
- turn: {turn: TurnSummary, projection: LiveProjection};
- conversation: {entries: ConversationEntry[], projection?: LiveProjection}, at most 8 entries;
- work: {turnId, items: WorkSummary[], projection?: LiveProjection}, at most 8 items;
- interaction: {projection: LiveProjection}.

LiveProjection = {session: SessionInfo, activeTurn: ActiveTurn|null,
currentActivity: CurrentActivity|null, interaction: Interaction|null}.
It is a full replacement of the small current projection at this eventSeq, not a partial merge.
ToolAction changes emit work invalidation as a WorkSummary with its incremented revision;
an open action inspector refreshes the affected bounded page. No raw action output in events.
Terminal Turn update supplies its summary/outcome and a cleared activeTurn projection.

Each upsert has canonical ID/revision. Removal of the current interaction is explicit
{interaction:null}; omission means unchanged in events. Ordinary JSON read optionality is unchanged.
An event frame is <=64 KiB. Large text updates reference content; clients read the visible portion
on demand. Event segmentation is done before committing each canonical update, never by emitting
two different frames with the same eventSeq.

Persist event before broadcast. Replay batches <=100 frames and <=256 KiB, yield between batches.
Subscriber queue <=256 KiB; on overflow emit unnumbered resync-required if possible, then close.
A pruned gap emits unnumbered resync-required and closes. Never jump an event ID silently.
Client deduplicates eventSeq, detects gaps and fetches a new bounded Snapshot. It merges already
loaded older pages by ID/revision, keeping history; it does not reload the transcript.
Heartbeat comments every 15 seconds do not advance eventSeq. Disconnect cleans the subscriber only.
Close authorization/lifecycle resources on shutdown. Concurrent bootstrap/replay/broadcast must
not lose the first event after the snapshot; test with an update in each handoff window.

## Provider catalogue

ProviderDescriptor = {providerId, title, readiness:'ready'|'unavailable'|'authenticationRequired'|
'unknown', reason?:string, capabilities:{questions,permissions,cancel,resume,modelOverride,effortOverride},
models:[{modelId,title,efforts:string[]}], modes:('read-only'|'workspace-write')[]}.
Catalogue response is <=128 KiB; <=32 providers, <=100 models each, <=16 efforts per model,
titles/reasons <=512 bytes. Cap by total bytes as well; oversized provider catalogue is explicit
PROVIDER_CATALOGUE_UNAVAILABLE, not a silent omission of selected model. Catalogue is advisory;
command-time validation is authoritative.
Foundation advertises only explicitly enabled mock, title identifying it as test, read-only mode,
and its actual synthetic capabilities. No real adapter is advertised from a demo list.

## Error contract

Domain error body: {error:'session_error', code, message, details?}. message is safe text <=2 KiB.
details is code-specific and bounded; never provider-private diagnostics. Existing Auth/rate-limit
envelopes remain their own contracts. UI branches on code, not message text.

| Status | Codes and permitted details                                                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | SESSION_INPUT_INVALID (field?), SESSION_CURSOR_INVALID, INTERACTION_RESPONSE_INVALID                                                                                 |
| 404    | SESSION_NOT_FOUND, SESSION_RESOURCE_NOT_FOUND                                                                                                                        |
| 409    | TURN_CONFLICT (turnId), IDEMPOTENCY_CONFLICT, INTERACTION_EXPIRED, SESSION_CURSOR_EXPIRED, CONTENT_REVISION_UNAVAILABLE, SESSION_RECOVERY_REQUIRED (turnId?, reason) |
| 413    | SESSION_PAYLOAD_TOO_LARGE                                                                                                                                            |
| 422    | CAPABILITY_UNSUPPORTED (capability), MODEL_UNSUPPORTED                                                                                                               |
| 503    | SESSION_DISABLED, SESSION_STORE_BUSY, SESSION_STORE_UNAVAILABLE, PROVIDER_UNAVAILABLE, PROVIDER_AUTH_REQUIRED, PROVIDER_CATALOGUE_UNAVAILABLE                        |

Missing/replaced/corrupt store never returns an invented ready/empty snapshot. Store ownership
failure prevents feature startup and is reported in startup diagnostics using the same code.
Cursor expiry calls for a bounded new snapshot/page path, not a retry loop of the same token.
Operational driver failures after accepted Turn start appear as canonical terminal/unknown state,
not retroactive failure of the already acknowledged command.
