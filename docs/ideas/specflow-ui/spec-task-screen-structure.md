---
id: ideas.specflow-ui.spec-task-screen-structure
type: product
title: Specification and Task screen structure
status: draft
scope: specflow
areas:
  - ui
  - product
  - workflow
tags:
  - specification
  - task
  - screen-structure
  - primary-secondary
  - human-attention
  - responsive
read_when:
  - sketching the Specs overview, Specification surface, or Task Secondary
  - validating ready, working, and human-review states before visual design
  - deciding which information stays in Specification Primary versus Task Secondary
summary: >
  First screen-structure pass for Specs overview, Specification Primary, and Task Secondary.
  Validates the same structure against ready, agent-working, and human-review states without
  freezing final visual components or styling.
related:
  - ideas.specflow-ui
  - ideas.specflow-ui.information-navigation-inventory
  - ideas.specflow-ui.spec-task-information-hierarchy
  - product.specflow.ui.interaction-model
  - product.specflow.ui.ai-session-ux
  - design-system.principles.ui-ux-guidelines
---

# Specification and Task screen structure

## 1. Purpose

This document is the first **screen-structure** pass after the information inventory.

It does not freeze:

- exact components;
- card/border treatment;
- exact split ratios;
- typography;
- iconography;
- final action placement;
- final backend DTOs.

It does freeze the intended **information order and navigation relationship** strongly enough to
validate the product flow before visual design.

The core steering loop remains:

~~~text
Specs overview
  -> identify attention / ready / working
  -> 1 click on the relevant signal
  -> responsible decision context opens
     - Task-specific signal => Specification + Task Secondary
     - Spec-level signal => Specification context
  -> deliberate action
~~~

A generic Specification click may still open the Specification normally, but an actionable
summary should deep-link to the context that explains that signal instead of forcing the human to
find the same Task again.

Opening that context is never itself the mutating workflow action.

---

## 2. Shared shell and surface topology

### Wide

~~~text
┌──────────────┬──────────────────────────────────┬──────────────────────────┐
│ Navigation   │ Specification Primary            │ Task Secondary           │
│              │                                  │                          │
│ Project      │ spec context                     │ selected Task context    │
│ Specs        │ workflow + tasks                 │ evidence + actions       │
│ Settings     │                                  │                          │
└──────────────┴──────────────────────────────────┴──────────────────────────┘
~~~

Task Secondary is contextual to the selected Specification. It should not make the user feel that
they navigated away from the Spec.

### Compact

Navigation becomes a Drawer, but Specification + Task may still stay split:

~~~text
┌──────────────────────────────────┬──────────────────────────┐
│ ☰ Specification Primary          │ Task Secondary           │
│                                  │                          │
│ workflow + tasks                 │ selected Task context    │
└──────────────────────────────────┴──────────────────────────┘
~~~

Compact is not mobile.

### Narrow

Only one workspace surface is visible:

~~~text
Specification
    -> tap Task

Task detail
    <- Back to Specification
~~~

Anything essential for discovering that a Task needs attention must therefore exist in
Specification Primary before the Task is opened.

---

# 3. Specs overview

## 3.1 Job of the screen

The Specs overview is the project-level human steering queue.

The first scan should answer:

~~~text
What needs me?
What is ready if I want to continue?
What is currently being worked?
What has an issue/remediation path?
What is quiet?
~~~

It should not expose deep workflow mechanics.

## 3.2 Proposed structure

~~~text
Specs

[ Active ] [ Archive ]

Requires attention
  Spec A        TASK-03 requires review
  Spec B        Owner decision required

Ready
  Spec C        Ready to start implementation

In progress
  Spec D        Reviewer working on TASK-05

Other active
  Spec E        No immediate action
  Spec F        Waiting on normal workflow progression
~~~

This is a structural example, not a requirement to render literal grouped sections.

The important rule is that **attention, ready, and working remain perceptibly different**.

A Specification can carry concurrent signals, for example one Task may require review while another
Task is currently being executed. If the screen uses mutually exclusive groups, place the Spec by
its highest-priority human-facing signal and preserve the other meaningful signals inside the item;
do not silently discard them. Avoid duplicating the same Spec across several groups unless the UI is
deliberately presenting independent projections rather than one canonical work queue.

A flat list is still valid if the sort, labels, and hierarchy communicate those categories clearly.

## 3.3 Minimum information per Spec item

Primary:

- Spec title / identity;
- the most important current human-facing signal;
- count/summary when multiple same-priority items exist;
- short reason when attention or issue exists.

A Specification can have multiple simultaneous Task-level signals. The overview may lead with one
signal for scanability, but it must not imply that the remaining attention/ready items do not exist.

Examples:

~~~text
Spec A
  3 Tasks require review
  TASK-03 owner decision required

Spec B
  2 Tasks ready
  next: TASK-05
~~~

The exact aggregation treatment is deferred; preserving multiplicity is not.

Secondary/compact metadata:

- workflow position;
- Task progress;
- current execution summary when authoritative;
- last meaningful activity where useful.

Avoid turning each Spec row into a dashboard card containing every status.

## 3.4 Interaction

There are two distinct targets:

~~~text
Spec identity / neutral row target
  -> Specification

Task-specific attention / ready / issue target
  -> Specification with that Task context already open
~~~

On wide/compact layouts this means Specification Primary + Task Secondary in one navigation action.
On narrow layouts it may land directly on the pushed Task detail while preserving Back to the
Specification.

A Spec-level signal opens the Specification itself because that is the responsible decision context.

If a summary exposes several actionable items, each item/aggregate must have a deterministic target.
For example, "3 Tasks require review" can open the Specification with the relevant attention group
visible, while a concrete TASK-03 signal can open TASK-03 Secondary directly.

The selected decision context must be representable/restorable by product navigation state where
reload/deep linking is expected. Do not make the one-click path depend only on ephemeral component
state.

The overview should not perform the final approval/review/start mutation. It gets the human to the
right context in one interaction; the next deliberate interaction performs the action.

---

# 4. Specification Primary

## 4.1 Job of the surface

Specification Primary answers:

- what change am I working on;
- where is the Specification in its workflow;
- what needs attention now;
- which Tasks are ready / active / waiting;
- what work is currently happening;
- which Task should I inspect next.

The main visual hierarchy should be the **Specification and its Tasks**, not a grid of unrelated
status widgets.

## 4.2 Proposed structural order

~~~text
Specification header
  Spec identity
  concise workflow meaning
  primary Spec-level action when relevant

High-priority state
  prioritized attention items / aggregate
  ready-next-action summary
  current execution summary
  issue/remediation summary
  (render only the categories relevant now)

Task collection
  Task rows / grouped lanes / another scannable structure

Supporting Specification context
  workflow progress/history summary
  important Spec-level artifact/review summary
  source-control/change summary when relevant
  recent meaningful activity
~~~

The "High-priority state" is a semantic slot, not a permanent card that must always exist.

It may contain more than one item when several human decisions are simultaneously pending. Preserve
the distinction between:

- one Spec-level decision;
- one Task-level decision;
- several Task-level decisions sharing the same category/artifact;
- unrelated simultaneous attention items.

When nothing special is happening, the slot can disappear instead of displaying a decorative
"all good" panel.

## 4.3 Task collection

A Task item should primarily communicate:

- id/title;
- semantic workflow meaning, either on the item or through its containing grouping;
- attention reason when human action is required;
- ready next action when useful;
- authoritative current execution indicator when the Task is in current execution scope;
- blocker/dependency reason when relevant.

Do not repeat the same status badge on every Task if a lane/group already provides the same
information.

Task item click:

~~~text
Task
  -> Task Secondary
~~~

## 4.4 Sessions in Specification

Sessions are contextual information, not the primary task hierarchy.

Specification may expose:

- current/running Session summary;
- recent/relevant Sessions;
- a Session connected to a selected Task.

A Session reference exposes the conversation target and a direct **Open full session** action.
Where Floating Session is supported, the conversation target opens that compact surface without
replacing Task Secondary. Full Session does not require opening the floating presentation first.

---

# 5. Task Secondary

## 5.1 Job of the surface

Task Secondary should answer within seconds:

~~~text
What is this Task?
Why is it in this state?
Does it need me?
What evidence should I inspect?
What deterministic action is available?
~~~

It is a decision/context surface, not a miniature dashboard.

## 5.2 Proposed structural order

~~~text
Task header
  TASK-03 — title
  concise workflow meaning
  Close on split / Back on narrow

Decision state
  requires attention / ready / current execution / issue-remediation
  human-readable reason
  available deterministic action when applicable

Task intent
  goal / summary
  acceptance criteria / requirements
  constraints / dependencies

Decision evidence (only when relevant/available)
  review summary
  Handover summary
  changes/diff entry
  verification/gate summary
  artifacts

Related execution
  current execution only when authoritative
  contextual/historical Sessions
  agent role/profile

Deeper inspection
  workflow attempt/history
  raw report
  raw verification
  operation/recovery details
~~~

Not every section is visible in every state. Empty structural placeholders should not be rendered
just to keep the shape symmetrical.

## 5.3 Action placement principle

The primary Task action should stay close to the reason/evidence that justifies it.

Bad:

~~~text
[Approve]

... several screens of unrelated metadata ...

why approval is allowed
~~~

Better:

~~~text
Review required
2 owner decisions remain

review summary
changes
handover

[Review / decide]
~~~

The exact visual placement can be header, local action area, or sticky action region later. The
semantic requirement is proximity between **reason, evidence, and action**.

## 5.4 Evidence ordering

Evidence should be ordered by relevance to the current human decision, not by artifact type.

For a review state, a likely order is:

~~~text
review outcome
handover / what changed        when a Handover exists
diff/change entry              when changes are available
verification                   when decision-relevant
Session                        when useful for context
other artifacts
~~~

For another workflow step, that order can differ.

The UI should not enforce one global "Attachments" list as the only way to find evidence.

---

# 6. State A — ready to start

## 6.1 Specs overview

~~~text
Ready

Spec A
  TASK-03 ready to start
~~~

Selecting the ready signal opens Spec A with TASK-03 context already active. This is visible and
convenient, but calmer than attention.

## 6.2 Specification Primary

~~~text
Spec A
Implementation

Ready to start
Prerequisites satisfied

Tasks
  TASK-01   done
  TASK-02   done
  TASK-03   ready
~~~

The screen should make TASK-03 discoverable without making the whole Spec look like an alert.

## 6.3 Task Secondary

~~~text
TASK-03 — Implement deterministic admission

Ready to start

Why
  required dependencies complete
  relevant entry gates satisfied

Task intent
  ...
  acceptance criteria
  dependencies

What starting does
  activates the authoritative execution/workflow path

[Start]
~~~

The user learns the context before performing Start.

---

# 7. State B — agent is working

## 7.1 Specs overview

~~~text
In progress

Spec A
  Reviewer working on TASK-03
~~~

Selecting the current-work signal opens Spec A with TASK-03 context already active.

This wording is allowed only when authoritative current execution scope proves TASK-03 is part of
the current execution.

Historical Session association is insufficient.

For a batch:

~~~text
Reviewer working on 3 Tasks
~~~

Do not invent one representative Task.

## 7.2 Specification Primary

~~~text
Spec A
Implementation

Current work
  Reviewer
  TASK-02, TASK-03, TASK-04
  Reviewing implementation

Tasks
  TASK-01   done
  TASK-02   current execution
  TASK-03   current execution
  TASK-04   current execution
  TASK-05   waiting
~~~

Task-level execution markers are projections of the current execution scope, not aliases for
workflow `active`.

## 7.3 Task Secondary

For TASK-03:

~~~text
TASK-03 — ...

Currently in execution
Reviewer · batch 3 Tasks

Current activity
  Reviewing changes...

Task intent
  ...

Session
  Review session                        [Open]

Other relevant evidence
  current change summary
~~~

Session access:

~~~text
Session
  conversation target -> Floating Session where supported
  [Open full session]  -> Full Session directly

Floating Session
  conversation/current activity
  [Open full session]
~~~

The Task surface does not embed a second full Session surface.

---

# 8. State C — requires human review

## 8.1 Specs overview

~~~text
Requires attention

Spec A
  TASK-03 requires review
~~~

Selecting the attention signal opens Spec A with TASK-03 review context already active. This is the
reference one-click-to-context path.

Attention state should say **what requires the human**, not merely "action required."

## 8.2 Specification Primary

~~~text
Spec A
Review

Needs your attention
  TASK-03 requires review

Tasks
  TASK-01   reviewed
  TASK-02   reviewed
  TASK-03   owner review required
~~~

TASK-03 should be the obvious next context to inspect.

## 8.3 Task Secondary

~~~text
TASK-03 — ...

Review required

Why
  implementation work completed
  current review evidence is available
  owner decision is required

Task intent
  goal / acceptance criteria

Review
  verdict / concise outcome
  owner decisions
  required fixes vs informational findings

Handover                               (when available)
  what was completed
  what remains
  next expected actor/action

Changes                                (when available)
  relevant current change set            [Inspect]

Verification                           (when relevant)
  concise gate/check outcome              [Inspect]

Session                                (when useful)
  Implementer / Reviewer conversation     [Open] [Full session]

[Review / decide]
~~~

The raw review Markdown, full diff, tool output, and operation history remain deeper inspection.

If one shared review report covers multiple Tasks, Task Secondary shows the outcome relevant to this
Task while keeping access to the shared report.

---


# 9. State D — Specification-level human action

The Specification itself can progress through deterministic workflow. A human-required Spec step
must therefore work without inventing a fake Task owner for the action.

## 9.1 Specs overview

~~~text
Requires attention

Spec A
  Specification approval required
~~~

Selecting the signal opens the Specification decision context directly.

## 9.2 Specification Primary

~~~text
Spec A
Specification review

Needs your attention
  Specification approval required

Why
  current Spec workflow step completed its automated work
  owner decision is required

Decision evidence
  Spec-level review/artifacts
  unresolved owner decisions
  relevant verification/change summary

[Review / decide]
~~~

Task collection remains visible as supporting context but no Task is artificially selected as the
owner of the Spec-level decision.

On narrow layouts this remains a Specification surface; it does not push a Task detail unless the
human explicitly opens one.

---

# 10. Issue / remediation state


This is included because "cannot perform action X" must not become a universal Task-level
`BLOCKED` state.

Example:

~~~text
TASK-03

Cannot start normal workflow step
Waiting for TASK-02

Available remediation
  Agent may inspect/fix dirty worktree state

[Open remediation / continue]
~~~

The exact available operation comes from authoritative application/workflow projection.

The UI should tell the user **which operation is blocked** and what legal path remains.

---

# 11. Resume / recovery state

A settled AI Turn is not enough to decide Task state.

## Continue / resume

~~~text
Execution ended safely
More legal work remains
No ambiguous durable operation requires recovery

[Continue]
~~~

This may occur:

- before workflow attempt activation during remediation;
- during an active workflow attempt;
- while an unfinished durable operation is safely replayable.

## Recovery required

~~~text
Execution stopped
Durable operation state requires reconciliation

Recovery required
  reason / affected operation
  authoritative recovery action

[Recover / inspect]
~~~

Do not present both as generic "stopped" or "blocked."

---

# 12. Mobile / narrow validation

The same information hierarchy must work when Task Secondary replaces Specification Primary.

## Specification

~~~text
☰  Spec A

Needs your attention
TASK-03 requires review          >

Tasks
...
~~~

The attention/ready/current-work signal must be visible before opening Task.

## Task

~~~text
←  TASK-03

Review required
why...

Task intent...

Review...
Handover...
Changes...

[Review / decide]
~~~

Related Session is an explicit action:

~~~text
Session                         [Open]
~~~

The conversation target uses Floating Session where supported. A separate full-screen action opens
Full Session directly, so the floating presentation is optional rather than a mandatory navigation
step.

No desktop-only Secondary may contain the sole copy of information necessary to understand why the
user needs to act.

---

# 13. What this pass deliberately does not decide

Still deferred:

- Task list vs board vs grouped rows;
- exact Active/Archive control;
- exact Spec workflow visualization;
- exact Task Secondary width;
- exact in-Task disclosure treatment for evidence summaries before deeper inspection;
- exact sticky/header action behavior;
- exact treatment of shared multi-Task artifacts;
- exact file/diff preview composition inside the agreed Secondary detail stack;
- visual tokens, cards, shadows, borders, and spacing;
- exact API/read-model shapes.

Those should be decided only when the structure above has been validated against real product
scenarios and available backend projections.

---

# 14. Screen-structure acceptance checks

Before moving to component inventory or visual mockups, verify:

1. From Specs overview, human attention is distinguishable from ready and working.
2. Multiple simultaneous attention/ready items are preserved rather than collapsed into a false
   single state.
3. A Task-specific signal opens the responsible Task context in one interaction; the human does not
   have to reopen the Spec and find the same Task manually.
4. A Spec-level signal opens the responsible Specification context without inventing a Task owner.
5. A neutral Spec click still opens the Specification without inventing a Task selection.
6. One-click decision context is restorable/deep-linkable where product navigation promises reload
   equivalence; it is not only ephemeral UI state.
7. Opening Task/context does not mutate workflow.
8. Task Secondary explains the current state before presenting a mutation.
9. Evidence required for a human decision is reachable from Task without leaving the context.
10. Optional evidence such as Handover, Session, or diff is not rendered as a required empty section.
11. Current execution language uses authoritative execution scope, never historical Session binding.
12. Batch execution remains visibly batch-shaped.
13. A settled Turn can produce continue/resume or recovery state without pretending the Task is done.
14. Narrow/mobile preserves discovery of attention/ready/current-work before Task detail is opened.
15. Session access from Task preserves quick conversation where supported and exposes direct Full
    Session access without requiring Floating Session first.

The equivalent Full Session structure is now captured in
[Full Session screen structure](full-session-screen-structure.md).

The broader design-system/component pass is now captured in
[Design-system and composition gaps](design-system-component-composition-gaps.md).
