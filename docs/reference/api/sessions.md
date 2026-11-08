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
  - listing Sessions, reading a Session's association or starting a Session from a Specification
summary: >
  Implementation contract for independent Session commands, bounded snapshots,
  conversation and Work paging, content ranges, scoped authorization and SSE resync, plus the
  Session list, the association read and the composed create from a Specification.
related:
  - ideas.specflow-runtime.session-association
  - architecture.runtime.authorization
  - architecture.ai.session-storage-and-lifecycle
  - architecture.ai.canonical-session-turn-work
  - reference.protocols.session-provider-driver
  - ideas.specflow-runtime.managed-sessions-delivery
---

# Managed Sessions API

Independent telemetry reads, refresh and live invalidation are specified in
[Session telemetry API](session-telemetry.md). They do not depend on Task/Spec/Workflow.

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
Start the existing product server and open a Specification's **Sessions** list; a Session started
there (`/specs/:specId/sessions/new`) opens at `/sessions/:sessionId`. Every UI start is from a
Specification; `/sessions/new` redirects to `/`.
The explicitly labelled mock performs no external effects. The optional Claude adapter uses this
same API; see [Claude enablement and supported installations](../../ideas/specflow-runtime/claude-provider.md).
On Windows x64, `sessions.providers.antigravity.enabled: true` enables no-input
discovery of the consumer CLI, with an optional absolute `executable` path.
Managed Agent and Plan require Engine write admission. Automatic file access is
bound to Runtime-held Windows file identities; every shell command requires a
one-time host-execution approval. See
[Antigravity implementation and acceptance limits](../../ideas/specflow-runtime/antigravity-provider.md).
Importing external Nevo history remains outside this API. Writable execution uses
Engine-owned admission and settlement; it does not imply OS isolation. Disabling only the provider
keeps stored reads available. Disabling the feature acquires no database owner.

## Authorization and transport

Authentication/authorization, origin protection and shared rate limits use existing Runtime
boundaries. Cache-Control: no-store applies. Never include raw provider IDs, process handles,
private interaction IDs, local absolute paths or provider payloads in ordinary DTOs.

Standalone create and provider catalogue: session.create at server-derived {projectId}.
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

`session.execute-write` never carries `specId`: until a Specification's Session is confined to that
Specification's worktree, every provider runs with the Runtime's whole verified workspace as `cwd`,
so a Specification-scoped grant must not admit writes. A Session's home Specification is immutable,
so its scope never changes. See
[Runtime authorization](../../architecture/runtime/auth/authorization.md#session-scope). Missing auth -> existing 401 authentication_required; forbidden -> 403
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
  digest?: WorkDigest; // work-summary entries only; see "Work digest"
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
    executeWrite?: boolean;
    delete?: boolean; // effective session.delete projection
  };
  archivedAt?: string; // present while archived (read-only)
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
  allowText:boolean, maxSelections?:integer};
- {interactionId, turnId, workId, revision, kind:'permission', prompt, actionSummary, action?}.

Command approvals may include an `action` with `operation: 'command'`, the exact
`command`, workspace-relative `cwd` using slash separators (`.` for the root),
`authority: 'workspace-write' | 'host-execution'`, and `approval: 'once'`.
`workspace-write` represents execution confined to the workspace. `host-execution`
delegates the exact command to the user's account permissions and can affect
files outside the workspace. Clients must show this distinction together with
the exact command and directory before approval. It never authorizes a subsequent
command, a native persistent permission or automatic replay. `actionSummary`
remains a human-readable fallback. The command text can itself contain paths as
part of what the user is asked to approve.

At most one answerable interaction per Turn. prompt/actionSummary <=8 KiB each, <=20 options,
each ID <=128 characters and label <=512 bytes; entire Interaction <=24 KiB. The driver must
reject/map unsupported oversize interaction input explicitly; never silently hide required choices.
Only an active, reconstructable interaction is included. Expired interactions remain historical Work.
Question/permission content and options are immutable while answerable. Replacing a question
allocates a new interactionId and expires the old one; a stale form cannot answer changed content.

## Routes and commands

| Route                                                             | Request                              | Success                           |
| ----------------------------------------------------------------- | ------------------------------------ | --------------------------------- |
| GET /api/session-providers                                        | none                                 | {items: ProviderDescriptor[]}     |
| POST /api/sessions                                                | CreateSession                        | 201 {sessionId}                   |
| GET /api/sessions/:sessionId                                      | none                                 | 200 Snapshot (tail)               |
| GET /api/sessions/:sessionId/history                              | before cursor, optional limit        | 200 HistoryPage                   |
| GET /api/sessions/:sessionId/turns/:turnId/work                   | optional before cursor and limit     | 200 WorkPage                      |
| GET /api/sessions/:sessionId/work/:workId/actions                 | optional before cursor and limit     | 200 ActionPage                    |
| GET /api/sessions/:sessionId/content/:contentId                   | revision, optional offset/limitBytes | 200 ContentPage                   |
| POST /api/sessions/:sessionId/turns                               | StartTurn                            | 202 {turnId}                      |
| POST /api/sessions/:sessionId/turns/:turnId/cancel                | {requestId}                          | 202 {turnId}                      |
| POST /api/sessions/:sessionId/turns/:turnId/reconcile             | {requestId}                          | 200 {turnId, outcome, reconciled} |
| POST /api/sessions/:sessionId/interactions/:interactionId/respond | Respond                              | 202 {turnId, interactionId}       |
| POST /api/sessions/:sessionId/rename                              | {requestId, title}                   | 200 {session: SessionInfo}        |
| POST /api/sessions/:sessionId/archive                             | {requestId}                          | 200 {session: SessionInfo}        |
| POST /api/sessions/:sessionId/unarchive                           | {requestId}                          | 200 {session: SessionInfo}        |
| DELETE /api/sessions/:sessionId                                   | none                                 | 204 (no body)                     |
| GET /api/sessions/:sessionId/events                               | optional after sequence              | text/event-stream                 |
| GET /api/sessions                                                 | list query                           | 200 SessionListPage               |
| GET /api/sessions/:sessionId/association                          | none                                 | 200 SessionAssociationRead        |
| POST /api/specs/:specId/sessions                                  | CreateContextSession                 | 201 CreateContextSessionResult    |

No core spec/task prefix on the Session routes, GET-all-transcript endpoint, attach/import,
list-all count, force-recovery or workflow finish endpoint. The last three routes are specified in
[Session list, association read and composed create](#session-list-association-read-and-composed-create).
Disabled Session capability gives 503 SESSION_DISABLED for these routes.

```ts
type CreateSession = {
  requestId: string;
  providerId: string; // bounded identifier 1..128 characters
  modelId?: string; // 1..256 characters
  mode: 'read-only' | 'workspace-write';
  providerModeId?: string;
  effort?: string; // 1..64 characters
  title?: string;
};
type StartTurn = {
  requestId: string;
  message: string; // nonblank, <=128 KiB
  mode?: 'read-only' | 'workspace-write';
  providerModeId?: string;
  modelId?: string;
  effort?: string;
};
type Respond =
  | { requestId: string; kind: 'question'; answer: { optionIds: string[]; text?: string } }
  | { requestId: string; kind: 'permission'; decision: 'allow' | 'deny' };
```

Respond answer text <=16 KiB, option IDs must be declared, duplicate option IDs invalid;
text only when allowText; an optional maxSelections (1 to 20) limits selected option IDs and is checked
before durable response admission. Empty answer invalid unless the question explicitly offers an empty
option (through its ID). Denied permission resolves the interaction; it does not automatically
fail the Turn. Start may override mode, native providerModeId, model and effort for that Turn;
the Session's provider remains fixed and its defaults are not rewritten. Unspecified selections
inherit the Session defaults. Runtime validates the effective native combination and write
authorization before admission; a running Turn is never reconfigured. Unsupported choices are
rejected with MODEL_UNSUPPORTED or CAPABILITY_UNSUPPORTED, never silently ignored.
Snapshot `capabilities.start` and default-mode readiness describe the Session defaults,
not every possible override. A selection-aware Composer needs Session-scoped admission
capabilities; project-scoped catalogue authorization alone is not authoritative for an
existing Session. See [the V10 backend readiness audit](../../ideas/specflow-runtime/session-v10-backend-readiness.md).

Reconcile uses session.manage and the existing positive-evidence recovery path. It accepts no
caller-supplied outcome, native receipt or force flag, and never resends a possibly executed prompt.
Unavailable evidence leaves the operation unknown rather than manufacturing a terminal result.

Every command acknowledgement is a closed contract schema (`CreateSessionResult`,
`StartTurnResult`, `CancelTurnResult`, `RespondInteractionResult`, `ReconcileTurnResult`, with
`sessionValidators.createResult` ... `reconcileResult`); the Reconcile `outcome` is a
`TurnOutcome`. A client treats a 2xx body of another shape as an unknown outcome, never as success:
a Start command stays retained for replay with the same `requestId`. Because the schemas are
closed, adding a field to a 2xx acknowledgement is a breaking change for deployed clients: it needs
a coordinated UI release that accepts the field first.

Route bodyLimit: 256 KiB Create/Start, 64 KiB respond/cancel/reconcile/rename/archive/unarchive.
Exceed -> 413 SESSION_PAYLOAD_TOO_LARGE.
Session allocate does not launch the provider. Enforce requestId semantics from the storage design
for every command with a requestId, including create, cancel, rename, archive and unarchive.
Duplicate cancel after terminal is accepted as no-op for that Turn; it must never cancel a later Turn. Respond duplicate with same accepted
requestId returns its original response; a fresh response to an already resolved interaction conflicts.

### Rename, archive, unarchive and delete

Schemas: `RenameSessionSchema`, `ArchiveSessionSchema` (archive and unarchive) and
`SessionCommandResultSchema` in `@nevo/specflow-contracts/sessions`.

- Rename `{requestId, title}`: title is trimmed and must stay 1..256 characters with a
  non-whitespace character; there is no "clear title". Allowed on an archived Session (owner
  decision 2026-11-08: metadata, not conversation).
- Archive `{requestId}` sets `SessionInfo.archivedAt`. It is rejected with 409 TURN_CONFLICT
  (details.turnId) while the Session has a nonterminal Turn, including `unknown`; it never
  cancels implicitly. The check and the write share one transaction, so no Turn can be admitted
  in between. Archiving an archived Session is a no-op that keeps the original `archivedAt`.
- An archived Session is read-only: start Turn and interaction respond return 409
  SESSION_ARCHIVED and `capabilities.start` is false. Reads, content, history, Work, SSE,
  telemetry GET and telemetry refresh keep working.
- Unarchive `{requestId}` removes `archivedAt`; on a non-archived Session it is a no-op.
- Rename/archive/unarchive replay a matching `(actor, command, sessionId, requestId)` without a
  second effect and answer with the current effective `SessionInfo`; a changed payload under the
  same requestId is 409 IDEMPOTENCY_CONFLICT. A change emits one `session` event.
- `DELETE /api/sessions/:sessionId` (no body) hard-deletes every Session-owned Runtime row in
  one transaction: Session, provider correlation, Turns, conversation, Work, actions, content,
  interactions, Session-scoped idempotency records, fact/usage deduplication, telemetry, the
  association and its Task rows, and the event outbox. The project-scoped create record is kept, so a late create retry with the old
  requestId replays the deleted sessionId, whose use answers 404.
  It is rejected with 409 TURN_CONFLICT (details.turnId) while any Turn is nonterminal or
  `unknown` or a live invocation of the Session is still attached, so a running write Turn gets
  TURN_CONFLICT. 409 SESSION_DELETE_BLOCKED (details.turnId) occurs only for an `unknown` or
  recovering write Turn whose invocation has detached while its Engine effect evidence is
  unsettled; that Turn is visible as `activeTurn`. Engine workspace-execution records and
  provider-native transcripts are not touched (only the Runtime's locator is removed); Engine
  attempt records keep the `sessionId` as audit. Open SSE streams of the deleted Session close
  without further payload. There is no tombstone: a repeated delete, and any later read or stream
  request, including the association read, is 404 SESSION_NOT_FOUND; Specification and Task reads
  then hide the reference. Clients treat 404 after their own delete as done.
- Archive and unarchive leave the association untouched. An archived Session stays associated; it
  is excluded from the workspace Sessions section and from the default list (`archived=exclude`).

## Session list, association read and composed create

Schemas: `SessionListQuerySchema`, `SessionListFilterSchema`, `SessionListPageSchema`,
`SessionAssociationReadSchema`, `CreateContextSessionSchema` and `CreateContextSessionResultSchema`
in `@nevo/specflow-contracts/sessions`. Sessions stay independent: the association is a separate,
Session-owned sidecar record
([storage](../../architecture/ai/session-storage-and-lifecycle.md#authorization-and-associations)),
written only by the composed create. There is no route to reassign, unlink or append Tasks.

### Composed create

`POST /api/specs/:specId/sessions` (body limit 256 KiB) starts a Session associated with the
Specification, atomically:

```ts
type CreateContextSession = CreateSession & { taskIds?: string[] }; // <=32, unique, members of specId
type CreateContextSessionResult = {
  sessionId: string;
  association: { specId: string; taskIds: string[] };
};
```

- Refusal precedence: schema validation (400), authentication, `503 SESSION_DISABLED`, then `spec.start-session` at
  `specScope(projectId, specId)`, `session.create` at `{projectId, specId}` and, for
  `mode: 'workspace-write'`, `session.execute-write` at `{projectId}` (403 `forbidden`); only then
  the Engine verification, so a refused caller never learns whether the Specification exists.
- The Engine verifies the Specification and every `taskId` before the write (time-of-check only):
  `404 {error: 'specification_not_found'}`, `404 {error: 'specification_task_not_found'}` (unknown
  Task or one of another Specification), `503 {error: 'specification_source_unavailable'}` when the
  Specification or Task source is unreadable. The project-mode Runtime has no Engine Task source
  yet, so a create with `taskIds` answers that 503 there.
- The Session and its association rows are written in one store transaction under the
  project-scoped create idempotency key; its fingerprint covers `{input, association}`. The same
  `requestId` sent standalone and from a Specification, or to two Specifications, is
  `409 IDEMPOTENCY_CONFLICT`. A replay re-runs the Engine verification, so a replay after the
  Specification was removed answers 404 while the stored Session stays.
- `POST /api/sessions` and `CreateSession` are unchanged and create a standalone Session; the UI
  has no entry to it. The demo Runtime has no composed create: its workspace `startSession` action
  carries the demo start `path` instead.

### Association read

`GET /api/sessions/:sessionId/association` (project and demo mode) serves the Session Context and
the navigator:

```ts
type SessionAssociationRead = {
  sessionId: string;
  association:
    | { kind: 'standalone' }
    | {
        kind: 'specification';
        specification: AssociatedFact<{
          specId: string;
          key?: string;
          title: string;
          collection: 'current' | 'archived';
        }>;
        tasks: AssociatedFact<{ taskId: string; key?: string; title: string }>[]; // [] when forbidden
      };
};
type AssociatedFact<T> =
  | { state: 'available'; value: T }
  | { state: 'missing'; id: string } // associated, the referenced object is gone
  | { state: 'forbidden' } // no spec.view: no id, no title, no Task list
  | { state: 'unavailable' }; // Engine source unreadable
```

`session.view` at the Session's scope admits the read (unknown ID: 404 SESSION_NOT_FOUND).
Specification and Task facts additionally need `spec.view` at `specScope(projectId, specId)`,
checked before any Engine lookup, so `forbidden` never reveals existence. Titles, keys and the
archive collection are read from the Engine at request time; the registry stores only ids. A
removed Specification or Task reads as `missing` (no cascade); a later object reusing the same id
reads as the associated one. Without an Engine Task source (project mode today) associated Tasks
read as `unavailable`.

### Session list

`GET /api/sessions?specId=&taskId=&standalone=true&archived=exclude|include|only&limit=&cursor=`

```ts
type SessionListItem = {
  sessionId: string;
  title?: string;
  providerId: string;
  modelId?: string;
  readiness: Readiness;
  activeTurn?: { turnId: string; state: TurnState };
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  association:
    | { kind: 'standalone' }
    | { kind: 'specification'; specId: string; taskIds: string[] } // only with spec.view at specScope
    | { kind: 'restricted' }; // associated, caller lacks spec.view
};
type SessionListPage = { items: SessionListItem[]; nextCursor?: string };
```

- Filters select, they never grant. `specId` and `standalone` are exclusive and `taskId` requires
  `specId` (otherwise `400 SESSION_INPUT_INVALID` with `field`). `archived` defaults to `exclude`.
- Authorization: `session.view` in any scope, then each scanned row at
  `sessionScope(row, 'view')`; rows the caller may not view are skipped. With `specId` the request
  also requires `spec.view` at `specScope(projectId, specId)` (403 otherwise): selecting by a
  Specification reveals which Sessions belong to it. Without `specId` or `standalone`, a caller
  whose `session.view` comes only from Specification-scoped grants gets
  `400 SESSION_LIST_SCOPE_REQUIRED` (`field: 'specId'`); `standalone=true` answers such a caller an
  empty page.
- Order: newest created first, keyset-paged on the immutable creation sequence. `limit` 1..100,
  default 50. One request scans at most 500 index rows and stops when `limit` rows are filled or
  the budget is spent; `nextCursor` points after the last **scanned** row, so a page may hold
  fewer than `limit` items, even none, while `nextCursor` is present. Clients follow it explicitly.
- `nextCursor` is HMAC-signed and bound to the store generation, the project and the exact filter;
  a tampered cursor or one of another filter is `400 SESSION_CURSOR_INVALID`, an expired one
  `409 SESSION_CURSOR_EXPIRED`.
- A page decodes only the rows it returns; a Session deleted between scan and decode is omitted.
  The demo Runtime serves the same route from its catalogue.

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
ToolActionSummary = {actionId, ordinal, revision, state, title:TextPreview, operation?:ToolOperation,
input?:ContentRef, output?:ContentRef, error?:{code,message}, createdAt, updatedAt}.
ToolOperation = 'read'|'edit'|'write'|'list'|'search'|'command'|'test'|'web'|'other', immutable,
recorded at action open from the provider's own tool identity only (see "Work digest");
omitted for actions recorded before Runtime classified them.
state uses the Work state vocabulary. Error message <=2 KiB. Only tool Work owns actions.
Work/action limits match HistoryPage. Exact Work identity/kind is immutable; no raw SDK objects.

### Work aggregate counts

`WorkPage.counts` is the Turn-wide Work aggregate, independent of which page is returned:

```ts
type WorkCounts = {
  total: number; // every Work the Turn opened, not this page's items.length
  inProgress: number; // Work currently in the 'active' state only
  byKind: { commentary: number; reasoning: number; interaction: number; tool: number };
};
type WorkPage = {
  // ...fields above...
  counts?: WorkCounts;
};
```

Runtime keeps the aggregate in the Turn record and updates it in the same transaction as every Work
open and Work state change (provider facts, interaction admission and delivery, Turn settlement,
restart recovery), like `actionCount`; the `work` read projects it and never scans Work at read
time. `counts` is omitted for Turns recorded before Runtime maintained the aggregate; they are not
backfilled. The UI MUST hide its summary row when `counts` is absent and MUST NOT derive it from
`items.length`, which is only a bounded page. Among pages of the same Turn, the one with the higher
`eventSeq` carries the newer counts.

### Work digest

A digest tallies the Turn's ToolActions by operation:

```ts
type OperationCounts = Partial<Record<ToolOperation, number>>; // closed keys, omitted when 0
type WorkDigest = {
  opened: OperationCounts; // every ToolAction the Turn opened, whatever state it reached
  failed?: OperationCounts; // the ToolActions whose state became 'failed' (also counted in opened)
};
```

Runtime maintains it in the Turn record in the same transaction as each ToolAction open and state
change, including actions that Turn settlement marks failed. The Turn's latest `work-summary`
entry carries the current digest: a new tool Work's entry starts with the digest at that moment,
and each later change revises that entry (`revision` increments) and emits one `conversation`
change with that single entry. An earlier `work-summary` entry keeps the digest it had while it
was the latest; clients use the Turn's latest entry that carries one. No digest is attached
before the Turn's first ToolAction, and none for Turns recorded before Runtime maintained it.

Classification comes only from the provider's own tool identity on the driver's `action-open`
fact (`operation`, see [driver protocol](../protocols/session-provider-driver.md)); it is never
inferred from command text, arguments or titles, and an unmapped identity is `other`. `test` and
`web` are used only when a provider's native tool itself identifies a test run or a web access;
no currently supported provider maps one (the Codex `webSearch` item is `other`, see below).

The digest counts only ToolActions Runtime admitted; it is not a full count of every native tool a
provider has. Claude web tools (`WebFetch`, `WebSearch`) are unreachable only because the adapter
restricts Claude with `--tools` to the inventory above; widening that list requires a mapping in
the same change. Codex `mcpToolCall` and `webSearch` ThreadItems each open one tool Work with one
ToolAction classified `other` (owner decision; `web` is not inferred for a native web search), so
the digest counts them and the Turn keeps running. An MCP call's state follows its native status
(`completed` or `failed`); a web search carries no native status and is `completed` when its item
completes; either one still open when the Turn ends takes the Turn's terminal state (failed,
cancelled or interrupted). Codex ThreadItem types outside the adapter's accepted inventory still
fail the protocol. The Codex
adapter configures no MCP servers and disables web search, and no approval or sandbox path changes
for these items.

A reader that is not following the live stream (a detached tab, or one that has loaded only
history pages) holds the digest from the last `work-summary` revision it received, which can be
behind the current one: for example, a new tool Work's entry is created with the digest before
that Work's first ToolAction and is revised only when that action opens. Such a reader catches up
on its next snapshot/resync or `conversation` change; it MUST NOT add its own counts to the digest.

| Provider    | Native identity                                                                       | Operation    |
| ----------- | ------------------------------------------------------------------------------------- | ------------ |
| Claude      | `Read`                                                                                | read         |
| Claude      | `Glob`, `Grep`                                                                        | search       |
| Claude      | `Edit` / `Write`                                                                      | edit / write |
| Claude      | `Bash`                                                                                | command      |
| Codex       | ThreadItem `commandExecution` (one action, parsed fragments ignored)                  | command      |
| Codex       | ThreadItem `fileChange` (one patch)                                                   | edit         |
| Antigravity | `view_file` / `list_dir`                                                              | read / list  |
| Antigravity | `find_by_name`, `grep_search`                                                         | search       |
| Antigravity | `write_to_file` / `replace_file_content`, `multi_replace_file_content`                | write / edit |
| Antigravity | `run_command`                                                                         | command      |
| any         | anything else (`call_mcp_tool`, undeclared names, mock scenarios without `operation`) | other        |

ContentPage = {contentId, revision, offset, text, nextOffset?, complete}.
revision is required and immutable. offset defaults 0; limitBytes defaults/max 64 KiB.
Offsets count UTF-8 bytes and must be valid character boundaries; invalid/out-of-range -> 400.
A conversation `TextPreview.text` is the UTF-8 byte prefix of its content (at most 2048 bytes, cut on a
character boundary), so a client continues with `offset` = the UTF-8 byte length of the preview text,
not 0, and appends the pages to the preview.
Return the longest valid UTF-8 prefix within the byte budget, nextOffset iff more remains.
Old referenced revisions are retained for the Session lifetime (until Session delete), including for actively growing
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
Committed outbox changes wake live subscribers. Idle streams revalidate authentication/policy at
most one second apart without polling the outbox; no change is broadcast before its transaction commits.
Close authorization/lifecycle resources on shutdown. Concurrent bootstrap/replay/broadcast must
not lose the first event after the snapshot; test with an update in each handoff window.

## Provider catalogue

ProviderDescriptor = {providerId, title, readiness:'ready'|'unavailable'|'authenticationRequired'|
'unknown', reason?:string, reasonCode?:string, compatibility?:{classification:'tested'|'provisional'|'unsupported',protocolProfile,version?}, capabilities:{questions,permissions,cancel,resume,modelOverride,effortOverride},
models:[{modelId,title,efforts:string[]}], modes:('read-only'|'workspace-write')[]}.
Catalogue response is <=128 KiB; <=32 providers, <=100 models each, <=16 efforts per model,
titles/reasons <=512 bytes. Cap by total bytes as well; oversized provider catalogue is explicit
PROVIDER_CATALOGUE_UNAVAILABLE, not a silent omission of selected model. Catalogue is advisory;
command-time validation is authoritative.
The catalogue includes explicitly enabled production drivers. The mock identifies itself as a test;
Claude discovers native model/effort metadata and reports unavailable when its installation/auth/policy
fails the supported authentication/policy or protocol checks. Unlisted compatible versions run
Provisional; a missing catalogue entry or unknown hash is not a refusal reason. Each Session is dispatched through its own selected provider;
enabling the mock does not grant Claude availability. No real adapter is advertised from a demo list.

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

Missing/replaced/corrupt store never returns an invented ready/empty snapshot. Store ownership
failure prevents feature startup and is reported in startup diagnostics using the same code.
Cursor expiry calls for a bounded new snapshot/page path, not a retry loop of the same token.
Operational driver failures after accepted Turn start appear as canonical terminal/unknown state,
not retroactive failure of the already acknowledged command.
