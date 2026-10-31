---
id: ideas.specflow-runtime.session-v10-backend-readiness
type: engineering
title: Session migration remainder and V10 backend readiness
status: draft
scope: specflow
areas: [ai, runtime, ui, testing]
tags: [sessions, migration, work, context, providers, composer]
read_when:
  - implementing Session Workspace V2 or Session Chat V10 against real Runtime APIs
  - checking which old Nevo Session functionality remains to migrate
  - planning bounded Work inspection and product association follow-ups
summary: >
  Evidence-based remaining legacy functionality and backend capability gaps for
  accepted Workspace V2 and Chat V10, without promoting prototype fixtures to APIs.
related:
  - ideas.specflow-runtime.provider-migration-plan
  - ideas.specflow-ui.components.session-chat-v10-design
  - ideas.specflow-ui.components.session-composer-design
  - reference.api.sessions
  - architecture.ai.canonical-session-turn-work
---

# Session migration remainder and V10 backend readiness

Audit baseline: main `3c0967fa`, the Session foundation merged in PR #98 and the
Antigravity implementation in PR #107. Legacy evidence is `D:/repos/git/nevo`,
primarily `tools/dashboard/server/ai/sessions`, `providers` and `orchestration`.
The current frontend implementation branch is `feat/session-workspace-v2-v10`.
This audit separates implemented APIs from requirements needing another capability;
it does not authorize shipping every synthetic behavior in the HTML examples.

## What has already migrated

The independent Session/Turn/Work model, worker-owned SQLite, durable command
idempotency, bounded tail/history/content, SSE replay, native context continuation,
questions and operation permissions, process ownership and honest recovery are
implemented. Claude, Codex and Antigravity have executable adapters; Antigravity
is no longer only a question-transport stub. Native loading of private MCP
configuration and question invocation have separate manual native-CLI evidence;
actual-account answer/resume evidence is recorded in the provider document.

Runtime already accepts `StartTurn.mode`, `providerModeId`, `modelId` and `effort`.
These configure the next Turn while provider identity remains Session-pinned.
They do not rewrite Session defaults or reconfigure an active invocation. Do not
add a second Composer mutation or infer these values from UI labels.

Common MCP question transport lives in Sessions `interactions/mcp`, with an
endpoint and credential per Invocation. Antigravity supplies native registration,
permission hooks and native idle evidence. Claude's control protocol and Codex's
JSON-RPC questions remain native adapters to the same canonical Interaction model.

## Accepted V10 behavior versus real backend capabilities

| Behavior                                                                               | Existing production boundary                                                                                       | Remaining backend work / frontend rule                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat, current activity, question/permission, cancel and content expansion              | Snapshot/history, currentActivity, interactions/respond, cancel, SSE and revision-bound content ranges             | Ready foundation. Layout, Copy/Quote, navigation stacks, splitter and draft/scroll retention belong to frontend. A settled Turn does not imply a finished Task.                                                                                                                                                         |
| Next-Turn native mode, model and effort                                                | `StartTurn` overrides; provider catalogue models/efforts, providerModes, compatibility/readiness and authorization | Ready for supported native combinations. Preserve unavailable reasons. Historical native execution metadata must not be guessed from current Session defaults.                                                                                                                                                          |
| Universal Ask/Plan/Agent and operation approval selectors                              | Native provider modes with verified effect authority                                                               | No certified cross-provider intent/approval combination projection. Native Plan names alone do not promise non-writing behavior; Antigravity Plan requires write authority. The proposed ComposerOptions is illustrative. Expose verified native choices; do not invent unrestricted Accept All or a Cartesian product. |
| Large Work history with filters/search and Commentary phases                           | Bounded Work and ToolAction pages, canonical IDs/ordinals and content references                                   | Query currently supports before/limit only. Need indexed server search/filter semantics and a Commentary phase anchor for pages beginning mid-phase. Do not fetch every earlier page to manufacture grouping context.                                                                                                   |
| Optional compact Work counts by operation                                              | Work summaries and per-Work actionCount                                                                            | No Turn aggregate or canonical read/write/edit/search/command taxonomy. Omit optional counts until an owned server projection exists; actionCount is not an operation-kind count.                                                                                                                                       |
| Open exact older Work from a reference                                                 | IDs on Work pages; ToolActions load by workId                                                                      | Need bounded Work-by-ID detail or cursor seek. Do not scan lifetime Work merely to locate an inspector target.                                                                                                                                                                                                          |
| Context: owning Spec, Task scope, single/batch execution, attention and workflow links | Existing product readers and Session reference infrastructure; demo composition                                    | No complete production managed-Session context/current-execution/event projection. Session projectId is not specId. Use explicit unavailable states, not synthetic Context counts or filename-derived ownership.                                                                                                        |
| Inspect Task attempt or workflow event from chat                                       | Canonical Session identities, separate Engine lifecycle                                                            | P5/E3/E5 composition must expose exact authorized Task/attempt/event IDs. An agent saying done is not a workflow event. Frontend source-aware Back behavior can be implemented without inventing these records.                                                                                                         |
| Attachments, camera and trusted repository references                                  | Text-only StartTurn                                                                                                | New upload/storage/expiry, stable reference, model-input capability and adapter contracts are needed. Camera/chips in HTML are fixtures. Do not silently send text while dropping unsupported attachments.                                                                                                              |
| Session file collections, artifacts, changes and handovers                             | Textual tool content and general document APIs                                                                     | No complete semantic Session file/revision/diff/artifact association contract. Do not derive authoritative file history or Task relationships from tool prose.                                                                                                                                                          |

The frontend branch explicitly marks its Session Context view shape as **not a
backend contract** and defaults production composition to unavailable Context.
Preserve that distinction until a real authorized owner projection exists.

The frontend branch currently gates Send with `session.capabilities.start`, which
is correct for the existing default-selection Composer. V10 overrides need a
selection-aware capability contract: separate lifecycle/provider readiness from
default-mode availability and effective selection authorization. A write-default
Session may permit a read-only override without ExecuteWrite; an unavailable
default mode may have a ready alternative. Keep current default-mode behavior;
do not solve this by enabling Send whenever Manage is true. Test both cases.
Catalogue mode authorization uses project scope; starting an existing Session
uses Session scope, so they are not interchangeable. This is a concrete backend
integration gap for the new Composer, not a missing StartTurn command.

Reasoning Work kind alone is not a provenance/renderability certificate. Use
only actual provider-supplied, explicitly user-renderable text or summaries;
numeric thinking-token usage is never Thinking text. No reasoning means neutral
activity, not invented intent or exposure of private model internals.

## Remaining functionality demonstrated in old Nevo

| Legacy functionality                                                 | Current status and ownership                                                                                                                                                                                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec/Task/batch context and authorized Session associations          | Remaining P5 composition above independent Sessions. Legacy service creates/binds context; it must not become a required specId/taskId in Session core.                                                                                            |
| Sequential Task queues, compatible batches and workflow continuation | Remaining E3/E5 execution integration. Engine writer exclusion is implemented but is not Task/batch orchestration.                                                                                                                                 |
| Find and reopen previous chats through a filtered Session catalogue  | Opening a known URL works; production Session list/search is not implemented. Legacy listSessions filters by Spec/Task/provider. Define bounded authorized catalogue and association projections.                                                  |
| Session deletion/unbinding and retention                             | Legacy provides deletion. Explicitly excluded from the foundation; define active/unknown execution and reference/retention rules before adding DELETE. Never delete unsettled Engine evidence to free a writer.                                    |
| Model modalities/context-capacity metadata                           | Legacy has advisory metadata and batch context-capacity snapshots. Current model descriptors expose IDs/titles/efforts only. Restore richer traits only with trustworthy adapter provenance; metadata alone is not an image-upload implementation. |
| Antigravity effort selection                                         | Intentionally unavailable until native discovery supplies supported values. Legacy's arbitrary --effort forwarding is not safety evidence.                                                                                                         |

The subsequent owner-authorized telemetry extension addresses the missing public
projection for observed token/cost/limit/context data. See
[the telemetry API](../../reference/api/session-telemetry.md) for exact current
provider coverage and [usage accounting](ai-adapters/usage-accounting.md) for
provenance. Claude monetary samples and Codex current context are mapped; bare
Antigravity numeric costs and unobserved context-category breakdowns remain
unavailable. This is independent of deferred Spec/Task/workflow composition.

Not proven lost functionality: no legacy attachment upload pipeline was found in
the inspected Session dispatch, which sends message/prompt strings. Cursor in V10
is a prototype fixture, not evidence of an old adapter to migrate. Quota reset
windows/capacity scheduling are proposed enhancements, not demonstrated legacy
guarantees. Continuous credential renewal during a long Turn remains a separate
native-auth integration scope; it does not justify a new Runtime refresh broker.

Intentional exclusions remain: history import/backwards compatibility, attaching
arbitrary native conversations, silent new-session fallback after uncertain
dispatch, persistent global MCP installation, protocol-silence destructive
watchdogs and unrestricted native tool/plugin execution. These are not migration
bugs to restore mechanically. Narrow supported platform/authentication profiles
and conservative unknown recovery remain explicit limitations.

## Bounded delivery order

1. Work inspection contract: exact detail/seek, search/filter with phase context,
   canonical operation classification and optional maintained aggregates. Bind
   filters to stable cursors and preserve authorization/content byte budgets.
2. P5 Context and catalogue: production authorized associations/current scope and
   Session discovery, followed by exact Engine workflow/Task attempt references.
3. Selection-aware admission/readiness, then separate capability design for
   certified intent/approval combinations, richer
   model traits, attachments/trusted file references and deletion/retention.

These are separate backend deliveries. The UI can use the ready boundaries above
and keep unavailable features honest while they are designed. No new UI, fake
production data, global MCP service or competing lifecycle owner is part of this
audit/refactor.

## Evidence pointers

- `packages/specflow-contracts/src/sessions/commands.ts`: Create/Start, native
  provider modes and model capabilities.
- `packages/specflow-runtime/src/features/sessions/http/routes.ts`: paging,
  commands, reconciliation and authorization.
- `packages/specflow-runtime/src/features/sessions/persistence/reads.ts` and
  `facts.ts`: bounded Work reads and action counts.
- `tools/dashboard/server/ai/sessions/service.mjs` in legacy Nevo: create/bind,
  attach and delete; `sessions/routes.mjs`: Session listing.
- Legacy `sessions/turns/routes.mjs` and `orchestration/admission.mjs`: queue/batch
  admission, workflow instructions and context capacity.
- [Accepted V10 contract](../specflow-ui/components/session-chat-v10-design.md)
  and [Composer capability gaps](../specflow-ui/components/session-composer-design.md).
