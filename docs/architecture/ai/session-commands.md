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

- Respond answer text <=16 KiB, option IDs must be declared, duplicate option IDs invalid; text only when allowText; an optional maxSelections (1 to 20) limits selected option IDs (absent means 1, single-select) and is checked before durable response admission.
- Empty answer invalid unless the question explicitly offers an empty option (through its ID).
- Denied permission resolves the interaction; it does not automatically fail the Turn.
- Start may override mode, native providerModeId, model and effort for that Turn; the Session's provider remains fixed and its defaults are not rewritten.
- Unspecified selections inherit the Session defaults.
- Runtime validates the effective native combination and write authorization before admission; a running Turn is never reconfigured.
- Unsupported choices are rejected with MODEL_UNSUPPORTED or CAPABILITY_UNSUPPORTED, never silently ignored.
- Snapshot `capabilities.start` and default-mode readiness describe the Session defaults, not every possible override.
- A selection-aware Composer needs Session-scoped admission capabilities; project-scoped catalogue authorization alone is not authoritative for an existing Session.


### Reconciliation and positive evidence

Reconcile uses session.manage and the existing positive-evidence recovery path. It accepts no
caller-supplied outcome, native receipt or force flag, and never resends a possibly executed prompt.
Unavailable evidence leaves the operation unknown rather than manufacturing a terminal result.
Positive evidence is an exact Engine settlement receipt or native-stop evidence: no process of the
identity recorded before dispatch remains, which settles the Turn `interrupted` with error
`PROCESS_STOPPED` (architecture.ai.session-storage-and-lifecycle). Startup recovery applies the same
evidence without a request. A live process answers 409 SESSION_RECOVERY_REQUIRED.


### Command acknowledgements and compatibility

Every command acknowledgement is a closed contract schema (`CreateSessionResult`,
`StartTurnResult`, `CancelTurnResult`, `RespondInteractionResult`, `ReconcileTurnResult`, with
`sessionValidators.createResult` ... `reconcileResult`); the Reconcile `outcome` is a
`TurnOutcome`. A client treats a 2xx body of another shape as an unknown outcome, never as success:
a Start command stays retained for replay with the same `requestId`. Because the schemas are
closed, adding a field to a 2xx acknowledgement is a breaking change for deployed clients: it needs
a coordinated UI release that accepts the field first.


### Request bounds and idempotency

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

- `DELETE /api/sessions/:sessionId` (no body) hard-deletes every Session-owned Runtime row in one transaction: Session, provider correlation, Turns, conversation, Work, actions, content, interactions, Session-scoped idempotency records, fact/usage deduplication, telemetry, the association and its Task rows, and the event outbox.
  - The project-scoped create record is kept, so a late create retry with the old requestId replays the deleted sessionId, whose use answers 404.
  - It is rejected with 409 TURN_CONFLICT (details.turnId) while any Turn is nonterminal or `unknown` or a live invocation of the Session is still attached, so a running write Turn gets TURN_CONFLICT. 409 SESSION_DELETE_BLOCKED (details.turnId) occurs only for an `unknown` or recovering write Turn whose invocation has detached while its Engine effect evidence is unsettled; that Turn is visible as `activeTurn`.
  - Engine workspace-execution records and provider-native transcripts are not touched (only the Runtime's locator is removed); Engine attempt records keep the `sessionId` as audit.
  - Open SSE streams of the deleted Session close without further payload.
  - There is no tombstone: a repeated delete, and any later read or stream request, including the association read, is 404 SESSION_NOT_FOUND; Specification and Task reads then hide the reference.
  - Clients treat 404 after their own delete as done.
- Archive and unarchive leave the association untouched. An archived Session stays associated; it
  is excluded from the workspace Sessions section and from the default list (`archived=exclude`).
