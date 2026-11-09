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
  - replacing the stand-in Task tab with real Task detail and drill-down
summary: >
  Open Full Session structure beyond the implemented contract: workflow execution in the Session
  (single Task, Task batch, continue, recovery, terminal consequences), real Task detail and
  drill-down in Task tabs, Handover/artifact tabs, File detail tabs and floating Session, plus the
  decisions still deferred.
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

## 2. Task tabs in the Session

Today a Task tab opened from Context is a stand-in (key, title, a note), because the association
read carries no Task detail ([Full Session, Secondary tabs](../../product/specflow/ui/full-session.md#secondary-tabs)).
Open:

- **Real Task detail in the Task tab**, from the Specification/Task read model (the Specification's
  Task detail presentation), not from the association read.
- **Drill-down on the Task tab's own stack.** Attempts, review events, rejections and feedback opened
  from a Task push onto that Task tab's local stack, keeping their Task provenance; Back returns to
  the direct parent inside the tab. Evidence targets follow the
  [Task evidence drill-down](navigation-and-route-model.md#1-task-evidence-drill-down).
- **Tasks list tab.** The Secondary already defines a Tasks list tab whose rows open each Task's own
  tab (so a Task never lives both as a tab and as a page inside the list), but no entry opens it:
  Context lists Related Tasks one row each. Whether a Session with many related Tasks gets a
  **Related Tasks** entry that opens the list is undecided.

## 3. Handover and artifact tabs

When a handover, report or evidence object is independently addressable or shared (one review report
covering several Tasks), it opens as its own Secondary tab with its original identity and links back
to every relevant Task. Details bound to one Task execution or attempt stay on that Task tab's local
stack. The canonical Handover and artifact contracts still need integration. No third pane.

## 4. File detail tabs

An independently inspected file can open as its own Secondary tab, so several files stay open beside
Context. A file tab may show read-only Markdown/code, a revision-aware preview or a diff once that
capability exists; Open in IDE is an optional escalation. Long file lists belong in their own tab with
search and progressive loading. The managed Session API has no semantic file-reference, revision or
diff contract, so no surface may pretend a file was read, changed or is previewable: a mention, a
read, an edit and an open tab are different facts. The Context **Planned areas** rows are the
placeholders for these surfaces.

## 5. Floating Session

Wide-only quick conversation from a Task or Specification without leaving it; never a mandatory step
before Full Session and never a compressed copy of its inspectors (no Work history, raw tool detail,
full Context, Task detail or file browser). See
[Floating Session UI spec](screens/floating-session-ui-spec.md).

## 6. Still deferred

- cancel near current activity beyond the Composer's Stop, where the provider supports it;
- provider-error/limit transfer to another agent;
- richer cost/usage/limit presentation (history, budgets, charts);
- persisted manual split size across reloads;
- reasoning presentation policy beyond provider-supplied, user-renderable summaries;
- still unplaced by a reviewed UX contract: demo-mode managed Sessions, a Task-context Session start
  (the composed create already accepts `taskIds`), the Attention Context section, and
  `TurnSummary.usage`/`error` presentation.
