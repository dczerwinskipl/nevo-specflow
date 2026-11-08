---
id: ideas.specflow-runtime.session-ui-integration.plan
type: engineering
title: Managed Session UI integration and Session actions — delivery record
status: current
scope: specflow
areas: [ai, runtime, server, security, ui, testing]
tags: [sessions, telemetry, interactions, work, session-actions, planning, implementation]
read_when:
  - asking what the feat/session-ui-integration delivery decided and what it left open
  - planning the Session association registry or the Session list
summary: >
  Delivered record of the Managed Session UI integration (T1-T13): real telemetry, closed command
  acknowledgements, unknown-Turn reconcile, multi-select questions, Antigravity icon, Work counts
  and classified digest, Session rename/archive/unarchive/delete end to end. Keeps the owner
  decisions and the open follow-ups; the behaviour lives in the owning contracts.
related:
  - reference.api.sessions
  - reference.api.session-telemetry
  - architecture.ai.session-storage-and-lifecycle
  - architecture.runtime.authorization
  - ideas.specflow-runtime.session-v10-backend-readiness
  - ideas.specflow-ui.components.session-chat-v10-design
  - ideas.specflow-ui.full-session-screen-structure
  - ideas.specflow-ui.session-actions-ux
---

# Managed Session UI integration — delivery record

Branch `feat/session-ui-integration`, one PR. All tasks T1-T13 are delivered. The contracts are
authoritative and this record does not repeat them:
[Sessions API](../../../reference/api/sessions.md) (command acknowledgements, Work counts, Work
digest, rename/archive/unarchive/delete, errors),
[Session telemetry API](../../../reference/api/session-telemetry.md),
[storage and lifecycle](../../../architecture/ai/session-storage-and-lifecycle.md) (archive and
delete transaction, delete map),
[authorization](../../../architecture/runtime/auth/authorization.md) (`session.delete`),
[Full Session structure](../../specflow-ui/full-session-screen-structure.md) §7.7, §17.1, §22.1 and
[Chat V10](../../specflow-ui/components/session-chat-v10-design.md) §3.1, §6 (UI behaviour).

## Delivered

| Task | Delivered as                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------- |
| T1   | `@nevo/http-client` `getResponse` returning status and requested headers (ETag, 304)                 |
| T2   | Session details read live telemetry (ETag revalidation, SSE revisions); provider-limits refresh      |
| T3   | Closed command acknowledgement schemas, validated by Runtime routes and the UI                       |
| T4   | Unknown-Turn notice with reconcile                                                                   |
| T5   | Questions with `maxSelections > 1`                                                                   |
| T6   | Antigravity provider mark (vendored, pinned)                                                         |
| T7   | `WorkPage.counts` maintained in the Turn record                                                      |
| T8   | `ConversationEntry.digest` with `ToolOperation` classified from adapter tool identity                |
| T9   | Rename/archive/unarchive/delete contract, `archivedAt`, `capabilities.delete`, new error codes       |
| T10  | Runtime implementation with durable idempotency, delete map characterization, stream close on delete |
| T11  | Header Session actions, archived bar, post-delete navigation, Session not-found view                 |
| T12  | Docs reconciled; cross-boundary HTTP scenario `test/sessions/session-lifecycle.http.test.ts`         |
| T13  | Codex `mcpToolCall`/`webSearch` items open an `other` ToolAction instead of failing the Turn         |

## Owner decisions (2026-11-08)

- D1, D2, D10 (telemetry refresh, reconcile placement, archived state and post-delete navigation):
  accepted through the UX contract; rationale and rejected alternatives in
  [session-actions-ux](../../specflow-ui/session-actions-ux/README.md). Rename stays allowed on an
  archived Session; `migration` is not shown.
- D3: `counts` omitted for Turns created before the change; no backfill.
- D4: digest implemented in this PR, classified only from the provider's own tool identity, `other`
  fallback, on the Turn's latest `work-summary` entry.
- D5-D7: `archivedAt`, archived is read-only (`SESSION_ARCHIVED` on start/respond), archive/delete
  refused with `TURN_CONFLICT` while a Turn is active or unknown (no auto-cancel), Unarchive in scope.
- D8, D9: hard delete of Session-owned Runtime rows, refused with `SESSION_DELETE_BLOCKED` while
  Engine evidence is unsettled; Engine records and native provider transcripts untouched; the
  project-scoped create key is kept; repeat delete is 404; `DELETE` returns 204; `session.delete`
  for developer and admin.
- Minor defaults: a question with options and no `maxSelections` is single-select; a rename title is
  nonblank (no "clear title"); a later naming signal must never overwrite a user rename.

## Open follow-ups

- **Stage 3, Session associations:** an authorized association registry (Session to
  Specification/Task, execution scope, attention) and a bounded Session list/catalogue. Until then
  Context scope stays `unknown`, archive has no list to leave and post-delete navigation goes to
  `/sessions/new`.
- Out of scope and still unplaced by a reviewed UX contract: demo-mode managed Sessions,
  planned-area tabs, attachments, the naming signal, Tasks/Attention Context sections, and
  `TurnSummary.usage`/`error` presentation.
