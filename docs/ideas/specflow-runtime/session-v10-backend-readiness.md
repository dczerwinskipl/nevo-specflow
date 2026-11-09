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

Remaining backend capability gaps for the accepted Workspace V2 and Chat V10 designs, and legacy
Nevo Session functionality not yet migrated. Implemented APIs are owned by the
[Sessions API](../../reference/api/sessions.md); provider-only gaps belong to the
[capability backlog](provider-migration-plan.md#current-scope-and-capability-backlog-ownership).
This does not authorize shipping every synthetic behavior in the HTML examples.

## Open V10 backend gaps

| Behavior                                                        | Existing production boundary                                                                                                                 | Remaining backend work / frontend rule                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Universal Ask/Plan/Agent and operation approval selectors       | Native provider modes with verified effect authority                                                                                         | No certified cross-provider intent/approval combination projection. Native Plan names alone do not promise non-writing behavior; Antigravity Plan requires write authority. The proposed ComposerOptions is illustrative. Expose verified native choices; do not invent unrestricted Accept All or a Cartesian product. |
| Large Work history with filters/search and Commentary phases    | Bounded Work and ToolAction pages, canonical IDs/ordinals and content references                                                             | Query currently supports before/limit only. Need indexed server search/filter semantics and a Commentary phase anchor for pages beginning mid-phase. Do not fetch every earlier page to manufacture grouping context.                                                                                                   |
| Open exact older Work from a reference                          | IDs on Work pages; ToolActions load by workId                                                                                                | Need bounded Work-by-ID detail or cursor seek. Do not scan lifetime Work merely to locate an inspector target.                                                                                                                                                                                                          |
| Context: current execution, batch, attention and workflow links | Association registry (home Specification and Tasks, `GET /api/sessions/:sessionId/association`), Session list and Specification-owned create | No production current-execution/attention/workflow-event projection. Use explicit unavailable states, not synthetic Context counts or filename-derived ownership.                                                                                                                                                       |
| Inspect Task attempt or workflow event from chat                | Canonical Session identities, separate Engine lifecycle                                                                                      | P5/E3/E5 composition must expose exact authorized Task/attempt/event IDs. An agent saying done is not a workflow event. Frontend source-aware Back behavior can be implemented without inventing these records.                                                                                                         |
| Attachments, camera and trusted repository references           | Text-only StartTurn                                                                                                                          | New upload/storage/expiry, stable reference, model-input capability and adapter contracts are needed. Camera/chips in HTML are fixtures. Do not silently send text while dropping unsupported attachments.                                                                                                              |
| Session file collections, artifacts, changes and handovers      | Textual tool content and general document APIs                                                                                               | No complete semantic Session file/revision/diff/artifact association contract. Do not derive authoritative file history or Task relationships from tool prose.                                                                                                                                                          |

Until a real authorized owner projection exists, the frontend Session Context view shape is not a
backend contract and production composition defaults to unavailable Context.

The frontend gates Send with `session.capabilities.start`, which
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

| Legacy functionality                                                 | Current status and ownership                                                                                                                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sequential Task queues, compatible batches and workflow continuation | Remaining E3/E5 execution integration. Engine writer exclusion is implemented but is not Task/batch orchestration.                                                               |
| Model modalities/context-capacity metadata                           | Current model descriptors expose IDs/titles/efforts only; richer traits need trustworthy adapter provenance (backlog F17). Metadata alone is not an image-upload implementation. |
| Antigravity effort selection                                         | Unavailable until native discovery supplies supported values (backlog F15). Legacy arbitrary `--effort` forwarding is not safety evidence.                                       |

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

1. Work inspection contract: exact detail/seek and search/filter with phase context
   (operation classification and maintained aggregates exist). Bind
   filters to stable cursors and preserve authorization/content byte budgets.
2. Context: current-execution scope and exact Engine workflow/Task attempt references on top of
   the existing association registry and Session list.
3. Selection-aware admission/readiness, then separate capability design for
   certified intent/approval combinations, richer
   model traits and attachments/trusted file references.

These are separate backend deliveries. The UI keeps unavailable features honest while they are
designed; no fake production data, global MCP service or competing lifecycle owner fills the gap.

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
