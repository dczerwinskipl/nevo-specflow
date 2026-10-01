---
id: ideas.specflow-ui.full-session-screen-structure
type: product
title: Full Session screen structure
status: draft
scope: specflow
areas:
  - ui
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

### 2.2 Old-repo deterministic evidence

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
  [Context]

  compact Work burst >
  Task / Handover / artifact references >

tap Context or a detail target
  -> pushed local Secondary
  <- Back to Session
~~~

The Primary must expose enough current state to understand what is happening without opening detail.
Floating Session does not exist on Narrow.
### 3.4 Default does not mean permanent

Context is the default Secondary content on split-capable Full Session entry, not a panel the product
continually forces open.

If the user closes Secondary:

- keep it closed until an explicit user action reopens Context or another detail;
- do not reopen it on new messages/current activity;
- do not auto-switch it because Work or a human interaction arrived.

Task/Handover/Work/future File details are local inspector state created by user actions, not stable
deep-link URL state.
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

When the canonical current-activity projection summarizes the same underlying streaming Commentary
or tool work already visible in chronology, do not render two equally prominent copies of the same
fact. Primary needs one clear live answer plus discoverable chronology, not duplicated "working"
chrome.

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

Waiting for model/tool without required user input is calm live state, not attention. When the
authoritative Session capability/runtime contract allows Turn cancellation, Primary may expose a
Cancel action near current activity. After cancellation is requested, Cancelling is a live
transition state and should prevent conflicting actions until Runtime resolves it. Do not render a
fake Cancel control for providers/sessions that do not support it.

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

Canonical interaction state controls whether response controls remain actionable. If the provider
operation disappears, the interaction expires, or restart recovery marks it interrupted, the UI must
not leave stale permission/question/confirmation controls enabled. Historical interaction evidence
may remain visible, but it is no longer an active request.

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

When a Session interaction already requires response in Primary, Context may summarize that fact for
orientation but should not duplicate the full response controls. The authoritative interaction stays
actionable from Primary.

Likewise, Context should not become a universal place to execute unrelated Spec/Task owner
decisions. A Task-specific review/approval signal routes to that Task detail inside Secondary; a
Spec-level decision routes to the Specification decision context. Session-owned controls such as a
pending interaction or supported Turn cancellation remain Session controls.

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

## 8. Work inspection in Secondary

### 8.1 Job of Work inspection

Work inspection answers:

> What did the agent/runtime actually do?

It is a technical/history detail opened deliberately by the user, not a permanent sibling mode that
the product must keep visible beside Context.

### 8.2 Information levels

Use the existing product levels:

~~~text
L1 Summary / Now       Primary
L2 Expanded Work       opened inspection detail
L3 Work details        selected Work detail
L4 Action details      selected ToolAction/detail
~~~

### 8.3 Entry

Compact Work bursts remain in conversation chronology. Clicking one opens the corresponding expanded
Work/history view in Secondary.

~~~text
Conversation
  "1 task | 2 search | 4 commands"
        -> click
Conversation | expanded Work detail
~~~

Commentary remains readable prose in the main chronology and is not converted into a technical event
card merely to fit Work inspection.

### 8.4 Drill-down

Within Secondary:

~~~text
Work detail
  -> Tool group
  -> ToolAction / output
  <- Back
~~~

One Secondary is reused; no third pane is created.

### 8.5 Live updates

Current activity remains visible in Primary. Incoming Work may update counts/statuses, but it must
not auto-open Work inspection or reset/replace the detail the user is currently viewing.
## 9. File detail in Secondary

File preview is a **future capability**, not part of the current UI implementation contract.

When that capability lands, a file reference from Commentary, Work, Task/context evidence, or an
artifact should open file inspection in the same Secondary slot. A future **Open in IDE** action may
then escalate from that preview.

Until file inspection exists:

- do not render a fake file preview;
- do not render an Open in IDE affordance that cannot work;
- preserve file/reference identity so the interaction can be added later without changing the
  surrounding Session/Task information hierarchy.

No future file capability may introduce a third simultaneous pane.
## 10. Secondary navigation model

### 10.1 Base and detail targets

On split-capable Full Session entry, **Context** is the default Secondary content.

Explicit user actions may replace it with a more specific detail:

- Task;
- Handover;
- artifact/review/verification;
- expanded Work / ToolAction;
- future File preview;
- another product detail that supports the current Session.

There is no required permanent Context/Work tab pair.

### 10.2 Return behavior

Examples:

~~~text
Context -> Task -> Handover -> Back -> Task -> Back -> Context
Context -> Work detail -> ToolAction -> Back -> Work detail -> Back -> Context
Context -> future File preview -> Back -> Context
~~~

A local inspector stack preserves one Session Primary and one Secondary while increasing
specificity.

Normal live Session updates never change the current Secondary target automatically.

### 10.3 Closing Secondary

On split layouts, closing Secondary leaves Conversation Primary.

On narrow, the same local detail becomes the visible pushed surface. The Workbench Back pops deeper
detail first, then closes Secondary and returns to Conversation.

Browser/system Back on Narrow should be integrated so an active local pushed-detail stack gets the
first opportunity to pop before router navigation. This must not make Secondary part of the URL.
## 11. Floating Session

### 11.1 Purpose

Floating Session is the quick interaction surface used for Session conversation from
Task/Specification where the floating presentation is supported, without abandoning that work
context.

It is not a mandatory waypoint to Full Session: the originating Session reference may expose a direct
Open full session action.

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
Last Turn settled

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

## 18. State G — waiting without human action

Waiting is live state, but not human attention.

### Primary

~~~text
Waiting for model…
~~~

or:

~~~text
Waiting for tool result…
~~~

Keep the state visible and calm. Do not show warning/attention treatment unless authoritative
readiness says the human is required.

### Context

Context can continue showing execution scope and related product work, but it should not invent a
next human action merely because the Turn is waiting.

---

## 19. State H — terminal failure, cancellation, or interruption

A terminal Turn may end without a normal completed final answer.

### Primary

~~~text
Turn failed / cancelled / interrupted

human-readable outcome or cause
last meaningful Commentary / work summary

[Retry / Continue] only when authoritative application state permits
~~~

A failed ToolAction inside an otherwise active Turn is not promoted to this Session-level terminal
state. The Turn/runtime projection remains authoritative.

Technical stack traces, raw tool outputs, provider details, and operation records stay in Work/deep
inspection unless they are the only useful human-readable explanation.

### Context

Context should show the surrounding workflow consequence separately:

~~~text
Turn outcome
  interrupted

Task/workflow
  still active / resumable / recovery required / no action
~~~

Do not infer Task completion or recovery policy from the terminal Turn outcome alone.

---

## 20. State I — unavailable / unknown Session state

When authoritative Session state cannot be established or the provider/runtime is unavailable,
preserve history but make the inability to act explicit.

### Primary

~~~text
Session unavailable

human-readable reason when known
historical conversation remains visible

composer/action availability follows authoritative readiness
~~~

Unknown/unavailable is not the same as a failed historical Turn.

Transport reconnecting may be shown as connection feedback, but transport state must not overwrite
canonical Session/Turn semantics. Once authoritative state is restored, the canonical projection
wins.

---

## 21. Narrow / mobile validation

### 21.1 Primary entry

Full Session opens directly to Conversation. Floating Session does not exist on Narrow.

~~~text
☰  Session title

Spec A
Reviewer · 3 Tasks

Current activity
Reviewing changes…

[Context]

conversation...
compact Work bursts are clickable

composer / interaction controls
~~~

### 21.2 Context pushed detail

~~~text
←  Context

Current execution
  Reviewer
  3 Tasks

Needs attention
  TASK-03 owner decision

Related Tasks
  ...

Evidence
  ...
~~~

### 21.3 Work/detail pushed inspection

Clicking a compact Work burst, Task, Handover, artifact, or future File reference pushes that detail
using the same local Secondary stack.

Back walks the local detail stack and eventually returns to Conversation.

No information necessary to know what is happening now or that the Session needs a response may
exist only in pushed detail.
## 22. Header and parent context

Full Session has no permanent top-level sidebar entry, so the surface should preserve lightweight
parent orientation.

Candidate header information:

- Session title;
- agent role/archetype when useful;
- parent Specification identity;
- concise current execution scope;
- contextual surface actions.

Do not overload the header with provider/model/internal ids.

### Return from Full Session

Full Session is a normal routed product surface. Back returns through router history to the previous
routed surface.

If that surface is a Specification, the product does not promise to reconstruct a Task or other
Secondary selection from the URL. Secondary is local Workspace state.

A direct Session route still exposes parent orientation (for example owning Specification when
available), but does not invent a previous Secondary state.
## 23. What this pass deliberately does not decide

Still deferred:

- exact Conversation rendering primitives;
- exact local inspector stack API;
- exact split ratios and resizing;
- exact Session URL;
- exact canonical Handover/artifact references in the new Runtime;
- exact composer behavior for every provider capability combination;
- exact reasoning presentation policy;
- exact future file-preview / IDE integration implementation;
- provider-error/limit transfer to another agent;
- exact cost/usage/limit presentation (reserve low-emphasis Session metadata/Context space without
  implementing it yet).
## 24. Screen-structure acceptance checks

Before global component/composition gap analysis, verify:

1. Full Session Primary answers what was asked, what the agent is saying, what is happening now, and
   whether the Session needs the human.
2. Context opens by default on split-capable entry and can be closed/reopened explicitly.
3. Secondary changes only because of explicit user inspection/navigation; live Work does not steal
   the inspector.
4. Narrow entry stays on Conversation and has no Floating Session substitute.
5. Current execution scope is distinct from historical/contextual Task association.
6. Batch execution remains visibly batch-shaped.
7. Pending interaction is visible/respondable from Primary; a complex interaction may explicitly
   open detail but does not auto-navigate the user.
8. Current activity is visible from Primary.
9. Commentary is preserved as prose when supplied and never fabricated.
10. Compact Work summaries preserve chronology; clicking them can open deeper Work inspection.
11. Raw tool details stay below the normal conversation level.
12. Context separates current execution Tasks from merely related Tasks.
13. Task/Handover/artifact/Work/future File details reuse one Secondary/local stack; no third pane.
14. File preview and Open in IDE remain absent until their capability exists.
15. Floating Session is Wide-only and never required before Full Session.
16. Settled Turn, Task/workflow completion, resumable continuation, and recovery-required remain
    distinct concepts.
17. Waiting without human input remains calm live state and is not styled as attention.
18. Unknown/unavailable Session state preserves history while action availability follows
    authoritative readiness.
19. Unsupported Session capabilities do not produce fake controls.
20. Browser/system Back on Narrow can pop local pushed detail before leaving the routed surface,
    without encoding Secondary in the URL.

The resulting design-system/component mapping is captured in
[Design-system and composition gaps](design-system-component-composition-gaps.md).