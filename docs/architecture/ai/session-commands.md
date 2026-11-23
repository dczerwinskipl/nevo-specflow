---
id: architecture.ai.session-commands
type: architecture
title: Managed Session commands and lifecycle
status: current
scope: specflow
areas: [ai, runtime, server, security]
tags: [sessions, commands, turns, interaction, idempotency]
read_when:
  - reviewing managed session commands and lifecycle
summary: >-
  Create/Turn command semantics, interactive approvals, managed Session archive/delete and idempotent recoverable operations.
related:
  - reference.api.sessions
  - architecture.ai.session-storage-and-lifecycle
  - reference.protocols.session-provider-driver
  - architecture.runtime.authorization
---

# Managed Session commands and lifecycle

Session commands use idempotent admission, immutable execution identity and explicit
recovery semantics. See [Session OpenAPI](../../reference/api/openapi.md) for request
and response schemas.

## Common shapes

`SessionInfo.providerTitle` and `modelTitle` are presentational and resolved on every Session read
(the snapshot, the management answers and every `LiveProjection.session` on the event stream)
from the Runtime's provider catalogue, exactly as for a list row; a title no longer listed is
dropped, never kept from an earlier read. A caller with `session.view` alone therefore names the
executor without `GET /api/session-providers`; clients read that catalogue for a Session
(`?sessionId=`, which requires `session.manage` on it) only for the composer's model, effort and
mode pickers, when they can manage the Session.

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

- Command approvals may include an `action` with `operation: 'command'`, the exact `command`, workspace-relative `cwd` using slash separators (`.` for the root), `authority: 'workspace-write' | 'host-execution'`, and `approval: 'once'`.
- `workspace-write` represents execution confined to the workspace.
- `host-execution` delegates the exact command to the user's account permissions and can affect files outside the workspace.
- Clients must show this distinction together with the exact command and directory before approval.
- It never authorizes a subsequent command, a native persistent permission or automatic replay.
- `actionSummary` remains a human-readable fallback.
- The command text can itself contain paths as part of what the user is asked to approve.

At most one answerable interaction per Turn. prompt/actionSummary <=8 KiB each, <=20 options,
each ID <=128 characters and label <=512 bytes; entire Interaction <=24 KiB. The driver must
reject/map unsupported oversize interaction input explicitly; never silently hide required choices.
Only an active, reconstructable interaction is included. Expired interactions remain historical Work.
Question/permission content and options are immutable while answerable. Replacing a question
allocates a new interactionId and expires the old one; a stale form cannot answer changed content.

## Routes and commands

The route catalogue, request and response structures are generated under the OpenAPI `Sessions` tag.

No core spec/task prefix on the Session routes, GET-all-transcript endpoint, attach/import,
list-all count, force-recovery or workflow finish endpoint. The last three routes are specified in
[Session list, association read and composed create](session-association-and-list.md#session-list-association-read-and-composed-create).
Disabled Session capability gives 503 SESSION_DISABLED for these routes.

### Interaction answers and Turn overrides

- **Answer:** text up to 16 KiB; only declared, unique option IDs. Text requires `allowText`. `maxSelections` is 1–20, default 1. Reject an empty answer unless an explicit empty option was offered.
- **Permission:** denial resolves the interaction without automatically failing the Turn.
- **Start override:** mode, native `providerModeId`, model and effort may override Session defaults for **this Turn only**. Provider identity is fixed; unspecified values inherit defaults.
- **Admission:** validate the effective combination and write authorization before starting. Reject unsupported choices as `MODEL_UNSUPPORTED` / `CAPABILITY_UNSUPPORTED`; never reconfigure a running Turn.
- **Projection:** `capabilities.start` and default-mode readiness describe defaults, not every override. The composer needs Session-scoped admission capability; a project catalogue alone is insufficient.

### Reconciliation and positive evidence

- **Authority:** `session.manage`; no caller-supplied outcome, receipt or force switch. Never resend a potentially executed prompt.
- **Proof:** settle only from an exact Engine receipt or proof that the pre-dispatch process identity is no longer running. The latter yields `interrupted` / `PROCESS_STOPPED`.
- **Unknown:** absent evidence stays unknown. A live process returns `409 SESSION_RECOVERY_REQUIRED`. Startup uses the same evidence checks.

### Command acknowledgements and compatibility

Acknowledgements use closed `CreateSessionResult`, `StartTurnResult`, `CancelTurnResult`, `RespondInteractionResult` and `ReconcileTurnResult` schemas (`sessionValidators.createResult` through `reconcileResult`); reconcile `outcome` is a `TurnOutcome`.

- **Unexpected 2xx:** treat as unknown, not success; retain Start for replay with its `requestId`.
- **Schema evolution:** adding acknowledgement fields breaks existing clients. Release an accepting UI first.

### Request bounds and idempotency

- **Bodies:** Create/Start up to 256 KiB; respond/cancel/reconcile/rename/archive/unarchive up to 64 KiB. Exceeding the route limit returns `413 SESSION_PAYLOAD_TOO_LARGE`.
- **Allocation:** creating a Session never launches its provider.
- **Retry:** honor `requestId` on Create, Cancel, Rename, Archive and Unarchive. A repeated Cancel of an already terminal Turn is a no-op **for that Turn only**. A duplicate accepted response replays its result; a new answer to a resolved interaction conflicts.

### Rename, archive, unarchive and delete

Schemas: `RenameSessionSchema`, `ArchiveSessionSchema` (archive and unarchive) and
`SessionCommandResultSchema` in `@nevo/specflow-contracts/sessions`.

- Rename `{requestId, title}`: title is trimmed and must stay 1..256 characters with a
  non-whitespace character; there is no "clear title". Allowed on an archived Session (metadata, not conversation).
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

#### Delete, recovery and visibility

`DELETE /api/sessions/:sessionId` takes no body and atomically removes all Session-owned Runtime rows: Session, provider correlation, Turns, conversation, Work, actions, content, interactions, idempotency, usage/fact deduplication, telemetry, association/Task rows and event outbox.

- **Retained:** project-scoped Create idempotency record. Late retry replays the deleted Session ID, which returns `404`. Engine execution records, attempt audit (`sessionId`) and provider-native transcripts are untouched.
- **Active work:** a nonterminal/`unknown` Turn or attached invocation blocks deletion with `409 TURN_CONFLICT` (`details.turnId`).
- **Detached unknown write:** unsettled Engine evidence after invocation detach returns `409 SESSION_DELETE_BLOCKED` (`details.turnId`), with the Turn visible as `activeTurn`.
- **After deletion:** SSE closes without more data; reads/streams and repeated Delete return `404 SESSION_NOT_FOUND`. Specification/Task reads hide references; clients may treat `404` after their own Delete as completion. No tombstone.

- Archive and unarchive leave the association untouched. An archived Session stays associated; it
  is excluded from the workspace Sessions section and from the default list (`archived=exclude`).
