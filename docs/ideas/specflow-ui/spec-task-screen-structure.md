---
id: ideas.specflow-ui.spec-task-screen-structure
type: product
title: Specification and Task screen structure
status: draft
scope: specflow
areas:
  - ui
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

The core steering loop is:

```text
Specs overview
  -> identify attention / ready / working
  -> open the owning Specification through the stable Spec row target
Specification
  -> make the responsible Task(s), Session, evidence, and workflow context explicit
  -> open Task detail when Task-specific inspection is needed
  -> deliberate workflow action
```

The canonical Specs Overview row has one stable destination: the owning Specification. Dynamic
attention/ready/working state changes the row summary and grouping, not its navigation target.
Ordinary status/reason prose in the overview is non-interactive and never deep-links directly into
Task Secondary.

Opening Specification/Task context is navigation only and never performs the mutating workflow
action.

---

## 2. Shared shell and surface topology

### Wide

```text
┌──────────────┬──────────────────────────────────┬──────────────────────────┐
│ Navigation   │ Specification Primary            │ Task Secondary           │
│              │                                  │                          │
│ Project      │ spec context                     │ selected Task context    │
│ Specs        │ workflow + tasks                 │ evidence + actions       │
│ Settings     │                                  │                          │
└──────────────┴──────────────────────────────────┴──────────────────────────┘
```

Task Secondary is contextual to the selected Specification. It should not make the user feel that
they navigated away from the Spec.

### Compact

Navigation becomes a Drawer, but Specification + Task may still stay split:

```text
┌──────────────────────────────────┬──────────────────────────┐
│ ☰ Specification Primary          │ Task Secondary           │
│                                  │                          │
│ workflow + tasks                 │ selected Task context    │
└──────────────────────────────────┴──────────────────────────┘
```

Compact is not mobile.

### Narrow

Only one workspace surface is visible:

```text
Specification
    -> tap Task

Task detail
    <- Back to Specification
```

Anything essential for discovering that a Task needs attention must therefore exist in
Specification Primary before the Task is opened.

---

# 3. Specs overview

## 3.1 Job of the screen

The Specs overview is the project-level human steering queue.

The first scan should answer:

```text
What needs me?
What is ready if I want to continue?
What is currently being worked?
What else is active but does not need me?
```

Issue/remediation details are supporting signals inside those categories, not a mandatory separate
lane.

It should not expose deep workflow mechanics.

## 3.2 Proposed structure

```text
Specs

[ Active ] [ Archive ]

Requires attention
  Spec A        3 Tasks require review
  Spec B        Owner decision required

In progress
  Spec C        Reviewer working on 3 Tasks

Ready / idle
  Spec D        Ready to start
  Spec E        No immediate action
  Spec F        Agent remediation available
```

This is the current structural contract for Specs Overview: Active Specs use grouped sections.
The exact visual treatment of the headers remains a design concern, but flattening these groups is
not an implementation-level alternative.

The important rule is that **Requires attention, In progress, and Ready / idle remain perceptibly
different**, while Ready and Idle remain distinguishable through the row summary inside their shared
low-priority group.

A Specification can carry concurrent signals, for example one Task may require review while another
Task is currently being executed. Place the Spec according to the canonical cross-group priority
`attention > in-progress > ready-idle`. The row keeps one dominant aggregate summary and may show at
most one bounded lower-priority qualifier when omitting it would materially misrepresent current
state. Do not duplicate the same Spec across several groups or expose raw signal collections.

## 3.3 Minimum information per Spec item

The detailed row/group/presentation contract is owned by
[Spec steering collection and item UI spec](components/spec-steering-ui-spec.md). This document only
records the cross-surface information boundary.

The canonical overview row shows:

- Spec identity/title;
- compact Task progress when known;
- one dominant aggregate human-facing state summary;
- at most one bounded concurrent qualifier allowed by the steering-row presentation contract;
- optional compact trailing metadata allowed by that contract.

Task IDs, per-Task signal labels, raw Session/execution identifiers, and arbitrary lists of concurrent
signals are not overview-row content. Multiplicity is preserved in the source projection and reduced
to the dominant summary plus at most one explicit aggregate qualifier for scanning.

Examples:

```text
Spec A
  5 / 9 Tasks · 3 Tasks require review

Spec B
  2 / 8 Tasks · Reviewer working on 3 Tasks
```

The overview must not turn a Spec row into a miniature detail screen merely to prove that all source
signals were preserved.

## 3.4 Interaction

The entire Spec row has one stable destination:

```text
Spec row
  -> Specification
```

Status/reason prose inside the row is non-interactive. The responsible Task, Session, evidence, and
workflow action become explicit after entering the Specification.

A genuinely separate contextual resource such as a linked pull request may be an explicit nested
control when the steering-row contract allows it; ordinary status text must not become a competing
link.

Do not change the destination of the whole row based on dynamic priority. On Narrow, activating the
row still enters the Specification rather than pushing a Task detail directly.

The overview never performs the final workflow mutation.

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

```text
Specification header
  Spec identity
  concise workflow meaning
  primary Spec-level action when relevant

High-priority state
  prioritized human-attention items / aggregate
  (only when the human is genuinely required)

Task collection
  Task rows / grouped lanes / another scannable structure
  ready/current-work/remediation reasons stay with their Tasks

Supporting Specification context
  ready-next-action summary when useful
  current execution summary
  non-human issue/remediation summary when useful
  workflow progress/history summary
  important Spec-level artifact/review summary
  source-control/change summary when relevant
  recent meaningful activity
```

The High-priority state slot is reserved for genuine human-required attention. Ready work and
agent-remediable issues do not get promoted into it merely because they are actionable.

When nothing needs the human, the slot disappears.

## 4.3 Task collection

A Task item communicates identity/title, semantic workflow meaning, attention reason, ready action,
authoritative current execution, and dependency/blocker reason when relevant.

### Selection and bulk actions

Task rows support multi-selection when batch actions are available.

A straightforward baseline interaction is checkbox selection. Once at least one Task is selected, a
selection action region appears with the actions the backend says are meaningful for that selection,
for example Start plus future selection-safe actions.

Selection validation is server/application-owned:

- warnings such as unmet dependencies remain visible;
- a warning may allow the action when the backend says it is legal;
- a blocker disables/prevents the operation and explains why;
- frontend must not infer batch executability from Task status strings.

Starting selected Tasks preserves batch scope. The start interaction can then choose the required
agent/provider using the shared Session-start model.

Do not repeat the same status badge on every Task if grouping already communicates it.

Task row click still opens Task Secondary and never performs the bulk action.

## 4.4 Sessions in Specification

Sessions are contextual history/work, not the primary Task hierarchy.

Specification may expose current/running Session summary and several recent/relevant Sessions.

Existing Session access:

- Wide conversation target -> Floating Session;
- Compact/Narrow conversation target -> Full Session;
- explicit Open full session may be shown where it adds clarity.

Starting a new Session is a separate explicit action using the shared Session-start interaction. Do
not place a one-off prompt textarea inside Specification solely to avoid opening the common composer.

# 5. Task Secondary

## 5.1 Job of the surface

Task Secondary should answer within seconds:

```text
What is this Task?
Why is it in this state?
Does it need me?
What evidence should I inspect?
What deterministic action is available?
```

It is a decision/context surface, not a miniature dashboard.

## 5.2 Proposed structural order

```text
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

Decision evidence
  review summary
  Handover / transition context
  changes reference
  verification/gate summary
  readable artifacts/documents

Related Sessions
  active/current highlighted when authoritative
  several recent/relevant historical/contextual Sessions
  [Show all] when needed

Deeper inspection
  workflow attempt/history
  raw report
  Work/tool details
  operation/recovery details
```

Optional sections disappear when unavailable.

## 5.3 Action placement principle

The primary Task action should stay close to the reason/evidence that justifies it.

Bad:

```text
[Approve]

... several screens of unrelated metadata ...

why approval is allowed
```

Better:

```text
Review required
2 owner decisions remain

review summary
changes
handover

[Review / decide]
```

The exact visual placement can be header, local action area, or sticky action region later. The
semantic requirement is proximity between **reason, evidence, and action**.

## 5.4 Evidence ordering

Evidence is ordered by relevance to the current human decision, not alphabetically by artifact kind.

Artifacts/documents are read targets. Mutation controls come from the owning workflow/Human Step.

When a workflow/history/evidence item references a Session, clicking that Session opens the Session
directly. Do not invent an intermediate proof-details page merely to restate the same reference.

A future turn anchor may make that navigation more precise.

The UI must not enforce one global Attachments list as the only way to find evidence.

# 6. State A — ready to start

## 6.1 Specs overview

```text
Ready

Spec A
  2 / 5 Tasks · Ready to start
```

Opening the row enters Spec A. The Specification surface then makes the ready Task(s) explicit. The
overview stays visible and convenient but calmer than attention.

## 6.2 Specification Primary

```text
Spec A
Implementation

Ready to start
Prerequisites satisfied

Tasks
  TASK-01   done
  TASK-02   done
  TASK-03   ready
```

The screen should make TASK-03 discoverable without making the whole Spec look like an alert.

## 6.3 Task Secondary

```text
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
```

The user learns the context before performing Start.

---

# 7. State B — agent is working

## 7.1 Specs overview

```text
In progress

Spec A
  2 / 8 Tasks · Reviewer working on 3 Tasks
```

Opening the row enters Spec A, where the authoritative execution scope can identify the participating
Tasks. The overview does not expose one representative Task.

Historical Session association is insufficient to produce the working summary.

## 7.2 Specification Primary

```text
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
```

Task-level execution markers are projections of the current execution scope, not aliases for
workflow `active`.

## 7.3 Task Secondary

For TASK-03:

```text
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
```

Session access:

```text
Session
  conversation target -> Floating Session where supported
  [Open full session]  -> Full Session directly

Floating Session
  conversation/current activity
  [Open full session]
```

The Task surface does not embed a second full Session surface.

---

# 8. State C — requires human review

## 8.1 Specs overview

```text
Requires attention

Spec A
  5 / 9 Tasks · 3 Tasks require review
```

Opening the row enters Spec A. The Specification surface then exposes which concrete Task(s) require
review and why.

Attention state should say **what requires the human** in aggregate, not merely "action required,"
while keeping Task IDs out of the canonical overview row.

## 8.2 Specification Primary

```text
Spec A
Review

Needs your attention
  TASK-03 requires review

Tasks
  TASK-01   reviewed
  TASK-02   reviewed
  TASK-03   owner review required
```

TASK-03 should be the obvious next context to inspect.

## 8.3 Task Secondary

```text
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
```

The raw review Markdown, full diff, tool output, and operation history remain deeper inspection.

If one shared review report covers multiple Tasks, Task Secondary shows the outcome relevant to this
Task while keeping access to the shared report.

---

# 9. State D — Specification-level human action

The Specification itself can progress through deterministic workflow. A human-required Spec step
must therefore work without inventing a fake Task owner for the action.

## 9.1 Specs overview

```text
Requires attention

Spec A
  Specification approval required
```

Opening the row enters the Specification, where the Specification-level decision context is made
explicit.

## 9.2 Specification Primary

```text
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
```

Task collection remains visible as supporting context but no Task is artificially selected as the
owner of the Spec-level decision.

On narrow layouts this remains a Specification surface; it does not push a Task detail unless the
human explicitly opens one.

---

# 10. Issue / remediation state

This is included because "cannot perform action X" must not become a universal Task-level
`BLOCKED` state.

Example:

```text
TASK-03

Cannot start normal workflow step
Waiting for TASK-02

Available remediation
  Agent may inspect/fix dirty worktree state

[Open remediation / continue]
```

The exact available operation comes from authoritative application/workflow projection.

The UI should tell the user **which operation is blocked** and what legal path remains.

---

# 11. Resume / recovery state

A settled AI Turn is not enough to decide Task state.

## Continue / resume

```text
Execution ended safely
More legal work remains
No ambiguous durable operation requires recovery

[Continue]
```

This may occur:

- before workflow attempt activation during remediation;
- during an active workflow attempt;
- while an unfinished durable operation is safely replayable.

## Recovery required

```text
Execution stopped
Durable operation state requires reconciliation

Recovery required
  reason / affected operation
  authoritative recovery action

[Recover / inspect]
```

Do not present both as generic "stopped" or "blocked."

---

# 12. Mobile / narrow validation

The same information hierarchy must work when Task Secondary replaces Specification Primary.

## Specification

```text
☰  Spec A

Needs your attention
TASK-03 requires review          >

Tasks
...
```

The aggregate attention/ready/current-work state must be visible before opening Task.

## Task

```text
←  TASK-03

Review required
why...

Task intent...

Review...
Handover...
Changes...

Related Sessions
  Reviewer · batch #23            [Open]
  Implementer · earlier           [Open]
  [Show all]

[Review / decide]
```

On Wide, normal Session conversation access may use Floating Session and can also expose Full Session.
On Compact/Narrow, opening the Session goes directly to Full Session.

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
2. Issue/remediation becomes attention only when the human is actually required.
3. Multiple simultaneous attention/ready/current-work signals are preserved rather than collapsed
   into a false single state.
4. The entire Specs-overview row opens the Specification; ordinary status prose is not a competing
   Task/Session navigation target.
5. The overview keeps Task IDs and raw concurrent signal lists out of the canonical row while
   preserving their meaning as bounded aggregate summaries.
6. A Spec-level action is represented without inventing a Task owner.
7. Opening the Specification or Task/context does not mutate workflow.
8. Task Secondary explains the current state before presenting a mutation.
9. Evidence required for a human decision is reachable from Task without leaving the context.
10. Optional evidence such as Handover, Session, or diff is not rendered as a required empty section.
11. Current execution language uses authoritative execution scope, never historical Session binding.
12. Batch execution remains visibly batch-shaped.
13. A settled Turn can produce continue/resume or recovery state without pretending the Task is done.
14. Narrow/mobile preserves discovery of aggregate attention/ready/current-work before Task detail is
    opened.
15. Session access from Task uses Floating Session only on Wide and opens Full Session directly on
    Compact/Narrow.

The equivalent Full Session structure is captured in
[Full Session screen structure](full-session-screen-structure.md).

The broader design-system/component pass is captured in
[Design-system and composition gaps](design-system-component-composition-gaps.md).
