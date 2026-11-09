---
id: ideas.specflow-ui.full-session-screen-structure
type: product
title: Full Session screen structure — open areas
status: draft
scope: specflow
areas:
  - ui
  - ai
  - runtime
tags:
  - session
  - context
  - handover
  - artifacts
  - files
  - task-batch
  - floating-session
read_when:
  - adding workflow execution, Task batches, continuation or recovery to Full Session
  - designing Handover, artifact or file tabs in the Session Secondary
  - designing floating Session
summary: >
  Open Full Session structure beyond the implemented contract: workflow execution in the Session
  (single Task, Task batch, continue, recovery, terminal consequences), Handover/artifact tabs,
  File detail tabs and floating Session, plus the decisions still deferred.
related:
  - product.specflow.ui.full-session
  - product.specflow.ui.ai-session-ux
  - product.specflow.ui.interaction-model
  - ideas.specflow-ui.screens.floating-session
  - ideas.specflow-runtime.session-v10-backend-readiness
  - architecture.ai.canonical-session-turn-work
  - ideas.developer-workspace.code-inspection-and-editing
---

# Full Session screen structure — open areas

The implemented Full Session (conversation, Work block, Work history, Composer, start form, Secondary
tabs, Context order and availability, Session actions) is the
[Full Session contract](../../product/specflow/ui/full-session.md). The owner-approved Workspace V2
and Chat V10 mocks ([examples](examples/session-chat-v10/README.md)) remain references for the areas
below, which wait on Runtime/Engine capabilities. Mock fixtures are not contracts.

## 1. Workflow execution in the Session

No Runtime projection supplies the Session's current execution scope, Task attention or workflow
consequences yet ([V10 backend readiness](../specflow-runtime/session-v10-backend-readiness.md)).
When it does:

- **Single Task.** Primary may carry a compact `Implementer · TASK-03` scope; Context's Current
  execution lists the Task with its workflow meaning and next human/agent action; selecting it opens
  Task detail in Secondary without leaving the conversation.
- **Task batch.** Primary shows `Reviewer · 3 Tasks`, never a representative Task. Context lists
  every executed Task, per-Task outcome/state, and shared evidence (one review report may support
  several Tasks while per-Task verdicts stay separate). Selecting one Task narrows Secondary detail
  but never rewrites the execution scope.
- **Entry context vs execution.** Opened from TASK-03 while the execution is a batch, the surface
  shows the entry context (TASK-03) separately from the execution (3 Tasks).
- **Settled Turn, more work remains.** Expose Continue only when authoritative readiness allows it;
  never call it "Task done".
- **Recovery required.** A short reason plus the authoritative recovery action, distinct from a
  Session interaction and from ordinary resumable state; operation records stay in deeper
  inspection.
- **Terminal Turn consequence.** Context shows the Turn outcome and the Task/workflow consequence
  (still active, resumable, recovery required) separately; never infer Task completion from the Turn.
- **Session vs workflow attention.** "Session interaction requires response" and "TASK-03 requires
  owner review" have different owners and actions; a Task decision routes to its Task detail, a
  Specification decision to the Specification.
- **Workflow events in the chat** are described in
  [Session Chat V10 open directions](components/session-chat-v10-design.md).

## 2. Handover and artifact tabs

When a handover, report or evidence object is independently addressable or shared (one review report
covering several Tasks), it opens as its own Secondary tab with its original identity and links back
to every relevant Task. Details bound to one Task execution or attempt stay on that Task tab's local
stack. The canonical Handover and artifact contracts still need integration. No third pane.

## 3. File detail tabs

An independently inspected file can open as its own Secondary tab, so several files stay open beside
Context. A file tab may show read-only Markdown/code, a revision-aware preview or a diff once that
capability exists; Open in IDE is an optional escalation. Long file lists belong in their own tab with
search and progressive loading. The managed Session API has no semantic file-reference, revision or
diff contract, so no surface may pretend a file was read, changed or is previewable: a mention, a
read, an edit and an open tab are different facts. The Context **Planned areas** rows are the
placeholders for these surfaces.

## 4. Floating Session

Wide-only quick conversation from a Task or Specification without leaving it; never a mandatory step
before Full Session and never a compressed copy of its inspectors (no Work history, raw tool detail,
full Context, Task detail or file browser). See
[Floating Session UI spec](screens/floating-session-ui-spec.md).

## 5. Still deferred

- cancel near current activity beyond the Composer's Stop, where the provider supports it;
- provider-error/limit transfer to another agent;
- richer cost/usage/limit presentation (history, budgets, charts);
- persisted manual split size across reloads;
- reasoning presentation policy beyond provider-supplied, user-renderable summaries.
