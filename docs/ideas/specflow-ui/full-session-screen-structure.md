---
id: ideas.specflow-ui.full-session-screen-structure
type: product
title: Full Session screen structure
status: draft
scope: specflow
areas:
  - ui
  - product
  - ai
  - runtime
tags:
  - session
  - conversation
  - commentary
  - work
  - context
  - primary-secondary
  - human-attention
  - responsive
read_when:
  - designing Full Session or floating Session
  - deciding what belongs in Session Primary versus contextual Secondary
  - presenting current activity, Work history, pending interactions, Tasks, or files
  - validating single-Task, batch, generic, resumable, and attention Session states
summary: >
  Screen-structure pass for Full Session and floating Session. Defines Conversation as Primary,
  Context as the default split Secondary, Work/File contextual inspection, current-activity and
  attention placement, batch scope, and narrow behavior without freezing final components.
related:
  - ideas.specflow-ui
  - ideas.specflow-ui.information-navigation-inventory
  - ideas.specflow-ui.spec-task-information-hierarchy
  - ideas.specflow-ui.spec-task-screen-structure
  - product.specflow.ui.interaction-model
  - product.specflow.ui.ai-session-ux
  - architecture.ai.canonical-session-turn-work
  - ideas.developer-workspace.code-inspection-and-editing
---

# Full Session screen structure

## 1. Purpose

This document applies the same screen-structure discipline used for Specification + Task to the
second major product surface: Full Session.

It does not freeze:

- exact chat components;
- exact inspector tabs/navigation;
- exact split ratios;
- exact URL shape;
- final artifact/Handover contracts;
- provider-specific rendering;
- visual styling.

It does freeze the intended information hierarchy strongly enough to validate the product flow.

The central model is:

~~~text
FULL SESSION

PRIMARY
Conversation / human-readable work stream

SECONDARY
Context by default on split layouts
or an explicitly selected inspector/detail
~~~

The Session is a work interface, not a provider transcript and not a raw tool log.

---

## 2. Canonical facts the UI can rely on

### 2.1 Current contract

The authoritative new SpecFlow architecture models:

~~~text
Session
└── Turn
    ├── Work: commentary
    ├── Work: reasoning
    ├── Work: interaction
    └── Work: tool
        └── ToolAction
~~~

Runtime/application code owns semantic projections such as:

- current activity;
- whether user attention is required;
- summarized phase/status;
- Session readiness.

UI must not rebuild those semantics from raw provider events or by scanning Work arrays.

### 2.2 Legacy deterministic evidence

The legacy canonical Session UI/runtime also demonstrates useful migration concepts:

- application Session identity;
- Spec association;
- contextual/historical Task associations;
- active Turn;
- pending interaction;
- Turn status;
- currentActivity;
- historicalWork;
- finalAnswer;
- Session readiness;
- provider capabilities/mode;
- single-Task or Task-batch execution in newer deterministic flow.

These are evidence for product needs, not a target DTO for the new repository.

---

## 3. Full Session topology

### 3.1 Wide

Default entry:

~~~text
┌──────────────────────────────────────┬─────────────────────────────┐
│ Conversation / Session Primary       │ Context Secondary           │
│                                      │                             │
│ human-readable chronology            │ execution / related Tasks   │
│ current activity                     │ attention / actions         │
│ pending interaction                  │ artifacts / handovers       │
│ composer                             │ Session metadata as needed  │
└──────────────────────────────────────┴─────────────────────────────┘
~~~

Product direction: Context is open by default when entering Full Session on a split-capable layout
and no more specific Secondary target was requested.

The empty right side should not remain unused while useful Session context exists.

### 3.2 Compact

If AppWorkspace still supports split at the available width, use the same default:

~~~text
Conversation | Context
~~~

Navigation may already be a Drawer. Navigation collapse does not imply workspace stacking.

### 3.3 Narrow

Do not auto-push Context when entering the Session.

~~~text
Full Session
  Conversation
  [Context] [Work] ...

tap Context
  -> pushed Secondary
  <- Back to Session
~~~

The primary surface must therefore expose enough current state to understand what is happening
without opening Context.

### 3.4 Default does not mean permanent

Context is the default Secondary entry state, not a panel the product continually forces open.

If the user closes Secondary on a split layout:

- keep it closed until the user explicitly opens Context/Work/File/detail again;
- do not reopen Context on every new message or current-activity update.

If the user enters via an explicit deep link/intent for Work, File, Task detail, or another inspector
target, that target overrides default Context.

---

## 4. Session Primary — human-readable work stream

### 4.1 Job of the surface

Primary should answer:

- what did I ask;
- what is the agent saying;
- what is happening now;
- does the agent need something from me;
- what was the meaningful path to the current/final result;
- can I continue the conversation.

It should not require opening Work merely to discover whether the Session is busy, waiting, or
requires attention.

### 4.2 Structural order

~~~text
Session header
  Session identity/title
  parent Specification orientation
  agent role/profile when useful
  contextual actions

Conversation stream
  user message
  Commentary / meaningful progress
  compact Work summary
  assistant final answer
  ...

Live / current region
  current activity
  pending interaction when any

Composer
  availability determined by authoritative readiness/capabilities
~~~

The exact placement of the live/current region may be sticky near the composer or integrated into
chronology later. The requirement is that current activity remains visible/discoverable in Primary.

### 4.3 Conversation chronology

The normal stream preserves human-readable chronology across:

- user requests;
- Commentary when supplied;
- compact semantic Work summaries;
- first-class pending/resolved interactions;
- final answers.

Raw tool calls and outputs do not become ordinary chat bubbles.

Reasoning is not automatically promoted into the normal conversation stream merely because it exists
as canonical Work. Its presentation follows product/capability policy and deeper inspection rules.

### 4.4 Commentary

Commentary is useful because it explains what the agent is doing and often why.

Rules:

- preserve meaningful Commentary in chronology;
- do not fabricate Commentary for providers/Turns that do not supply it;
- do not replace current activity with stale Commentary;
- repeated/noisy progress can be compressed at summary levels while canonical history remains intact.

### 4.5 Compact Work summaries

Tool activity should normally appear as semantic summaries, for example:

~~~text
Read 4 files · searched repository
Ran tests
Edited 3 files
~~~

The summary should be clickable when deeper Work inspection exists.

Exceptional Work deserves more prominence than repetitive happy-path history:

- failed tool/action;
- interrupted/cancelled work;
- user interaction;
- unknown/unavailable state.

---

## 5. Current activity

### 5.1 Primary responsibility

Current activity belongs in Session Primary even though full Work history lives in Secondary.

Examples:

~~~text
Reviewer · Reviewing TASK-03
Running tests…
Waiting for model…
Waiting for tool result…
Cancelling…
~~~

Use canonical Runtime currentActivity/readiness, never visual inference from the last Work item.

### 5.2 Execution scope wording

Historical/contextual Session association is not current execution.

Valid current execution presentations include:

~~~text
Generic/spec-level work

Implementer · TASK-03

Reviewer · 3 Tasks
  TASK-02, TASK-03, TASK-04
~~~

For Task batch execution:

- show the batch as a batch;
- do not choose a fake primary Task;
- the Primary summary may use a compact count;
- full scope remains directly inspectable in Context.

### 5.3 Terminal Turn

When a Turn settles:

- remove the live "working" presentation;
- preserve the final answer and meaningful historical path;
- do not infer that the Task/workflow is completed.

If authoritative workflow state says more legal work remains, expose continue/resume separately.

If ambiguous durable state requires recovery, expose recovery separately.

---

## 6. Pending interaction / requires attention

### 6.1 Interaction is Primary content

Permission, question, or confirmation is first-class Work and requires the human.

A pending interaction must be visible in Session Primary without requiring Context or Work.

~~~text
Agent needs your input

Question / permission / confirmation
details needed to decide

[response controls]
~~~

The interaction response is the deliberate mutation.

### 6.2 Composer and interaction controls

Do not assume a generic composer is the correct response mechanism for every pending interaction.

The authoritative interaction/readiness/capability contract decides whether:

- dedicated controls answer the interaction;
- normal composer remains available;
- Session is read-only/unavailable;
- another operation is required.

Avoid UI-local rules such as "requiresAttention always disables composer" unless the application
contract explicitly says so.

### 6.3 Attention outside the current Turn

Context may also contain workflow-level attention related to the Session's Spec/Tasks.

Do not conflate:

~~~text
Session interaction requires response
~~~

with:

~~~text
TASK-03 requires owner review
~~~

Both may be visible, but they have different owners and actions.

---

## 7. Context Secondary — default inspector

### 7.1 Job of Context

Context answers:

- what product work is this Session related to;
- what is it executing now;
- what requires human action around that work;
- which Tasks/artifacts/handovers matter;
- what should I open next for more specific context.

It should not become a metadata dump.

### 7.2 Proposed structural order

~~~text
Current execution
  agent role/profile
  generic / single Task / Task batch
  effective execution configuration only when useful

Attention / next actions
  Session interaction summary
  Spec/Task human-required action
  continue/resume/recovery when relevant

Related product context
  Specification
  current execution Tasks
  contextual/historical Tasks

Evidence
  Handover(s) when available
  review/artifact references
  change/verification summary when relevant

Session details
  mode/capabilities/provider/model only as secondary technical context
~~~

Empty sections disappear.

### 7.3 Current execution vs related Tasks

Keep these visually and semantically separate.

~~~text
Current execution
  TASK-03, TASK-04, TASK-05

Related Tasks
  TASK-01
  TASK-02
~~~

A Task can be historically/contextually related without being active in the current Turn.

### 7.4 Task selection inside Context

Selecting a Task from Context can replace Context with Task detail inside the same Secondary
surface.

~~~text
Conversation | Context
                 -> TASK-03

Conversation | Task detail
                 <- Context
~~~

This is inspector drill-down, not a third workspace pane and not a nested Full Session.

The local return path should preserve Session Primary.

### 7.5 Handover / artifact selection

The same rule applies to decision evidence:

~~~text
Context
  -> Handover detail
  -> Artifact/review detail
  -> verification detail
~~~

Do not create a third simultaneous pane.

The canonical Handover/artifact contracts are still migration gaps, so this section defines
navigation shape, not persisted fields.

---

## 8. Work Secondary

### 8.1 Job of Work

Work answers the technical/history question:

> What did the agent/runtime actually do?

It is not the default way to understand the Session.

### 8.2 Information levels

Use the existing product levels:

~~~text
L1 Summary / Now       Primary
L2 Expanded Work       Work Secondary overview
L3 Work details        selected Work detail
L4 Action details      selected ToolAction/detail
~~~

### 8.3 Work root

Candidate structure:

~~~text
Work

Current / latest Turn
  chronological semantic rows
  completed commentary
  grouped happy-path tools
  exceptional tools
  interactions

Older Turns
  bounded summaries / expand as needed
~~~

The precise grouping behavior remains implementation-owned, but product semantics are:

- preserve chronology;
- compress repetitive happy-path activity;
- keep exceptional/error/interaction boundaries visible;
- keep raw payload/output below summary levels.

### 8.4 Work item drill-down

Selecting a Work item replaces the Work root in Secondary:

~~~text
Conversation | Work
                 -> Tool group
                    -> ToolAction / output
                 <- Work
~~~

Again: one Secondary, no third pane.

### 8.5 Live Work

Current activity can be represented in Work too, but Primary remains the canonical always-visible
human summary.

Do not make the user open Work just to know that tests are currently running.

---

## 9. File Secondary

### 9.1 Entry points

A file can be opened from:

- Commentary link/reference;
- compact Work summary;
- Work detail/action;
- Task/context evidence;
- artifact/review reference.

Clicking it replaces the current Secondary content.

~~~text
Conversation | File preview
~~~

### 9.2 Geometry

File preview may need more width than normal Context.

The workspace may eventually use a presentation/sizing hint:

- Context: Primary-dominant;
- Work: balanced or Primary-dominant;
- File: balanced or file-dominant.

This document does not freeze exact ratios.

### 9.3 IDE escalation

File preview is compact inspection.

A separate action opens the full developer workspace/IDE when needed.

~~~text
File preview
  [Open in IDE]
~~~

Full IDE is not another nested Session pane.

---

## 10. Secondary navigation model

### 10.1 Root modes

At product level, the stable root concepts are:

- Context;
- Work;
- File when explicitly selected.

Task/Handover/artifact/Work-item details are contextual drill-down states inside Secondary rather
than permanent global tabs.

### 10.2 Return behavior

Examples:

~~~text
Context -> Task -> Context
Context -> Handover -> Context

Work -> Tool group -> ToolAction -> Work

Context -> File -> previous inspector context
Work -> File -> previous inspector context
~~~

A small local inspector stack is appropriate here because it preserves one Session Primary and one
Secondary while increasing specificity.

This is different from opening a Session from Task, where Session uses a floating surface instead of
being pushed as another Task Secondary level.

### 10.3 Closing Secondary

On split layouts:

~~~text
Conversation | Context
        -> Close Secondary
Conversation
~~~

Opening Context/Work/File later reopens Secondary.

On narrow:

~~~text
Conversation
  -> Context
  <- Back
Conversation
~~~

---

## 11. Floating Session

### 11.1 Purpose

Floating Session is the quick interaction surface opened from Task/Specification without abandoning
that work context.

It is not a compressed copy of every Full Session inspector.

### 11.2 Proposed structure

~~~text
Floating Session header
  Session title / agent role
  concise relation to entry context
  [Open full session]

Recent conversation
  recent user/assistant content
  meaningful Commentary
  compact current activity

Pending interaction
  when one requires response

Composer / response controls
  according to readiness/capabilities
~~~

### 11.3 What stays out

Do not make floating Session host:

- full Work history;
- raw tool details;
- full Context inspector;
- full Task detail;
- file browser;
- large artifact/review inspection.

Those are reasons to promote to Full Session or use the underlying Task/Spec surface.

### 11.4 Entry context vs execution scope

If floating Session is opened from TASK-03 while current execution is a batch TASK-02/03/04:

~~~text
Entry context
  TASK-03

Current execution
  3 Tasks
~~~

Do not relabel the whole execution as TASK-03 merely because that is where the user clicked.

Full Session should expose the complete scope.

---

## 12. State A — generic/spec-level Session

A Session can be associated with a Spec and historical Tasks while the current Turn has no Task
execution identity.

### Primary

~~~text
User
  Investigate why workflow admission is failing

Commentary
  Checking the workflow admission path…

Current activity
  Searching repository…
~~~

Do not show "working on TASK-03" from historical association.

### Context

~~~text
Current execution
  Generic / Spec-level

Specification
  Spec A

Related Tasks
  TASK-02
  TASK-03

Recent artifacts / activity
  ...
~~~

---

## 13. State B — single-Task execution

### Primary

~~~text
Implementer · TASK-03
Editing workflow admission…

conversation / Commentary / compact Work
~~~

### Context

~~~text
Current execution
  Implementer
  TASK-03 — deterministic admission

Task state / attention
  current workflow meaning
  next human/agent action when relevant

Related evidence
  changes
  Handover
  verification
~~~

Selecting TASK-03 opens Task detail in Secondary without leaving Session Primary.

---

## 14. State C — Task-batch execution

### Primary

~~~text
Reviewer · 3 Tasks
Reviewing implementation…

conversation / Commentary / compact Work
~~~

Do not show a representative Task as the execution identity.

### Context

~~~text
Current execution
  Reviewer
  TASK-02
  TASK-03
  TASK-04

Per-Task outcome/state
  TASK-02 ...
  TASK-03 ...
  TASK-04 ...

Shared evidence
  review report
  common Session artifacts
~~~

One shared review artifact may support several Tasks while per-Task verdicts remain separate.

Selecting one Task narrows Secondary detail to that Task but does not rewrite Session execution scope.

---

## 15. State D — Session requires human interaction

### Primary

~~~text
Agent needs your input

Allow command execution?
command / reason / details

[Allow] [Deny]
~~~

The interaction is visible without opening Context.

### Context

Context can still show why this Turn exists:

~~~text
Current execution
  Implementer · TASK-03

Related workflow
  implementation step

Task attention
  no separate owner decision
~~~

Session interaction attention and Task workflow attention remain distinct.

---

## 16. State E — Turn settled, more work remains

### Primary

~~~text
Last Turn completed / interrupted safely

Final answer / last Commentary

More work can continue
[Continue]
~~~

Show Continue only when authoritative readiness allows it.

This can occur before attempt activation during remediation, during an active attempt, or for a
safely replayable unfinished operation.

### Context

~~~text
Workflow / execution
  more legal work remains

Reason
  ...

Next action
  Continue / remediation
~~~

Do not call this "Task done."

---

## 17. State F — recovery required

### Primary

~~~text
Execution stopped

Recovery required
short human-readable reason

[Inspect recovery]
~~~

### Context

~~~text
Affected operation
  ...

Why automatic continuation is unsafe
  ...

Authoritative recovery action
  ...
~~~

Recovery-required is not the same as Session requires-attention interaction and not the same as
ordinary resumable state.

Technical operation records remain deeper inspection.

---

## 18. Narrow / mobile validation

### 18.1 Primary entry

~~~text
☰  Session title

Spec A
Reviewer · 3 Tasks

Current activity
Reviewing changes…

[Context] [Work]

conversation...

composer
~~~

The compact current-scope line must not become a metadata wall.

### 18.2 Context pushed detail

~~~text
←  Context

Current execution
  Reviewer
  3 Tasks

Needs attention
  TASK-03 owner decision

Related Tasks
  ...

Artifacts
  ...
~~~

### 18.3 Work pushed detail

~~~text
←  Work

chronological summary...
~~~

Selecting a Work item may push deeper inside the same local inspector stack. Back eventually returns
to Session Primary.

### 18.4 File pushed detail

~~~text
←  File

code preview...

[Open in IDE]
~~~

No information necessary to know "what is happening now" or "the Session needs my response" may
exist only in these pushed details.

---

## 19. Header and parent context

Full Session has no permanent top-level sidebar entry, so the surface must preserve parent
orientation.

Candidate header information:

- Session title;
- agent role/profile when useful;
- parent Specification identity;
- concise current execution scope;
- contextual surface actions.

Do not overload the header with provider/model/internal ids.

### Return from Full Session

When Full Session was explicitly promoted from a floating Session, returning should restore the
product context the user came from where that context is representable:

~~~text
Specification + TASK-03
  -> Floating Session
  -> Open full session
  -> return
Specification + TASK-03
~~~

A direct Session deep link has no previous transient context to restore; its deterministic parent
fallback is the owning Specification when available.

This should be represented by product navigation state rather than depending only on browser-history
accident.

---

## 20. What this pass deliberately does not decide

Still deferred:

- exact Conversation rendering primitives;
- whether Context/Work root switching uses tabs, segmented controls, header actions, or another
  composition;
- exact inspector local-stack API;
- exact split ratios and resizing;
- exact Session URL;
- exact Task/Handover/artifact data contracts;
- exact composer behavior for every provider capability combination;
- exact reasoning presentation policy;
- exact file-preview implementation;
- visual styling/tokens.

---

## 21. Screen-structure acceptance checks

Before global component/composition gap analysis, verify:

1. Full Session Primary answers what was asked, what the agent is saying, what is happening now, and
   whether the Session needs the human.
2. Context opens by default on split-capable Full Session entry when no more specific Secondary
   target is requested.
3. Closing Secondary is respected; default Context is not forcibly reopened by normal Session updates.
4. Narrow entry stays on Conversation and exposes explicit Context/Work inspection actions.
5. Current execution scope is distinct from historical/contextual Task association.
6. Batch execution remains visibly batch-shaped in Primary and Context.
7. Pending interaction is visible/respondable from Primary without opening an inspector.
8. Current activity is visible from Primary; Work is not required merely to discover live state.
9. Commentary is preserved when supplied and never fabricated when absent.
10. Raw tool details stay below normal conversation information level.
11. Context separates current execution Tasks from merely related Tasks.
12. Task/Handover/artifact/Work-item drill-down stays inside one Secondary; no third workspace pane is
    introduced.
13. File preview can replace Secondary and escalate separately to full IDE.
14. Floating Session remains intentionally smaller than Full Session.
15. Opening floating Session from one Task does not rewrite a current batch into that Task.
16. Settled Turn, Task/workflow completion, resumable continuation, and recovery-required remain
    distinct concepts.
17. Returning from explicitly promoted Full Session can restore the originating Spec/Task context
    where product navigation state can represent it.
18. Direct Session entry still has deterministic parent orientation/fallback.

If these hold, Specification/Task and Full Session together are sufficient to start the broader
design-system component/composition gap pass.
