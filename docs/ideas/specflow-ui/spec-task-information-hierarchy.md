---
id: ideas.specflow-ui.spec-task-information-hierarchy
type: product
title: Specification and Task information hierarchy
status: draft
scope: specflow
areas:
  - ui
  - workflow
  - runtime
tags:
  - specification
  - task
  - human-attention
  - deterministic-workflow
  - review
  - artifacts
  - handover
read_when:
  - designing the Specs overview, Specification surface, or Task detail
  - deciding which workflow facts deserve immediate human visibility
  - designing review, approval, start, or finalize steering flows
  - migrating Task and workflow projections from the old `dczerwinskipl/nevo` repository into SpecFlow
summary: >
  Working information hierarchy for Specification and Task. Classifies deterministic facts,
  human-attention signals, evidence, and actions before final screen layout is designed.
related:
  - ideas.specflow-ui
  - ideas.specflow-ui.information-navigation-inventory
  - product.specflow.ui.personas
  - product.specflow.ui.interaction-model
  - architecture.workflow.deterministic-workflow
  - architecture.ai.canonical-session-turn-work
---

# Specification and Task information hierarchy

## 1. Goal

This document answers a product question before wireframes are drawn:

> What does a human need to know, in what order, to understand a Specification or Task and safely
> steer deterministic workflow?

The target steering loop is:

```text
overview
  -> see which Specification needs attention / is ready / is active
  -> open Specification
Specification
  -> see the responsible Task(s), context, evidence, and why the action exists
  -> open Task when Task-specific detail is needed
  -> deliberate deterministic action / human decision
```

Navigation from the overview is for understanding, not mutation. A workflow mutation remains an
explicit deliberate action after sufficient Specification/Task context is visible.

The UI should not make the owner reconstruct state from YAML, raw gate output, provider events, or
legacy lifecycle statuses.

---

## 2. Evidence labels

The inventory below uses these labels:

- **Current contract** - authoritative in the new SpecFlow repository.
- **Old-repo deterministic evidence** - implemented in the deterministic flow of the old
  `dczerwinskipl/nevo` repository and useful for migration analysis, but not automatically part of
  the new contract.
- **Product direction** - agreed direction for the new UI.
- **Future candidate** - useful direction that should not block MVP.
- **Open question** - semantics are not clear enough to infer safely.

A legacy property can justify a UI need without justifying the same persisted field or enum in the
new implementation.

---

## 3. Information classes

Every UI fact should fit one primary class.

| Class                   | Human question it answers                                      | Visibility goal                               |
| ----------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| **Orientation**         | What am I looking at?                                          | Always available.                             |
| **Requires attention**  | Is the product waiting for me? Why?                            | Prominent before drill-down.                  |
| **Ready**               | Is there a safe next action available if I choose to continue? | Visible but calmer than attention.            |
| **Current activity**    | Is work happening now, and on what?                            | Visible without opening technical detail.     |
| **Context**             | What do I need to understand this state?                       | One interaction away at most.                 |
| **Evidence / artifact** | What supports the decision I am being asked to make?           | Directly reachable from the decision context. |
| **Deep inspection**     | What happened technically?                                     | Progressive disclosure.                       |
| **Action**              | What deterministic operation can I perform?                    | Shown only with its reason/readiness.         |

A single backend field can contribute to more than one projection, but the UI should avoid showing
the same fact repeatedly without adding meaning.

---

# 4. Specs overview

## 4.1 Purpose

The Specs overview is not merely a list of specifications. It is the owner's work queue.

Before opening a Specification, the screen should make these categories distinguishable:

```text
REQUIRES ATTENTION
Something is waiting on the human.

IN PROGRESS
Agent/runtime work is currently happening.

READY / IDLE
No work is currently active and no human intervention is required.
Individual rows still say whether a useful operation is Ready or there is No immediate action.
```

Issue/remediation is **not** a fifth top-level category by itself.

- if an issue requires human intervention, project it as Requires attention with the concrete reason;
- if the agent/system is actively remediating without human input, keep it under In progress;
- if remediation is merely available or nothing is progressing, keep it under Ready / idle and
  expose the concise reason in the row summary.

These are product projections, not persisted status values.

## 4.2 Minimum Specification summary

The canonical Specs-overview row has a deliberately small information budget:

- **Specification identity/title**: always visible and primary.
- **Queue/group state**: communicated by the owning semantic group, not repeated as a heavy badge per
  row.
- **Dominant aggregate state reason**: one concise high-level summary with no Task IDs or raw signal
  enumeration.
- **Concurrent qualifier**: optional one bounded lower-priority aggregate only when omitting it would
  materially misrepresent the row.
- **Task progress**: compact `completed / total` summary when known.
- **Linked PR**: optional one compact explicit control when useful.
- **Scope tags**: optional, with at most two visible values.

Current workflow step, raw semantic workflow status, individual Task signals, Session identity,
provider/model/effort, detailed remediation paths, and last-activity detail remain available to the
source projection or deeper surfaces but do not automatically earn space in the canonical row.

The overview should expose a small number of meaningful aggregates rather than mirror every
underlying status. The detailed presentation contract lives in
[Spec steering collection and item UI spec](components/spec-steering-ui-spec.md).

## 4.3 Ordering principle

**Product direction**

Cross-group priority is canonical and matches the steering-row contract:

```text
1. requires attention
2. in progress
3. ready / idle
```

The semantic distinction is:

- **Requires attention**: intended progress needs human input, decision, or intervention.
- **In progress**: the system/agent is actively progressing or remediating without human input.
- **Ready / idle**: no work is currently active and no human intervention is required. The row
  summary still distinguishes Ready from Idle.

Within Ready / idle, Ready rows sort before Idle rows by default because an available useful action is
more actionable than a no-immediate-action state.

A generic problem/blocked condition is not a separate priority tier. It moves into Requires attention
only when authoritative semantics say the human must intervene; otherwise active remediation remains
In progress, while available-but-not-running remediation or a no-progress state remains Ready / idle.

Ordering **inside** a group is a separate concern. For example, within Requires attention an active
Session waiting directly on the human may rank ahead of a passive approval request; within Ready /
idle, Ready ranks ahead of Idle. Intra-group tie-breaks must not redefine the cross-group order above.

---

# 5. Specification

## 5.1 Role

A Specification is a main product workspace.

It should answer:

- what is this change;
- where is it in its workflow;
- what work remains;
- what is happening now;
- what requires my attention;
- what evidence exists;
- what deterministic action is available.

It should not force the user to understand how these facts are persisted.

## 5.2 Always-visible orientation

Candidate baseline:

| Information                           | Class              | Evidence          |
| ------------------------------------- | ------------------ | ----------------- |
| title / stable Spec identity          | Orientation        | Product direction |
| active/archive context                | Orientation        | Legacy evidence   |
| current Spec workflow step            | Orientation        | Product direction |
| semantic Spec workflow status         | Orientation        | Product direction |
| requires-attention summary            | Requires attention | Product direction |
| active work summary                   | Current activity   | Product direction |
| primary available next action, if any | Ready / Action     | Product direction |

The exact layout is deferred. "Always visible" means available in the main Spec surface without
opening a nested detail, not necessarily that every item belongs in the header.

## 5.3 Main local information

Candidate first-level content:

- Task collection and progress;
- Spec workflow progress;
- current human-required item, if any;
- current/running Session summary;
- blockers;
- latest/relevant review or verification outcome;
- source-control/change summary when it affects the decision;
- important artifacts.

These are part of the Specification's own composition. A right-hand local column is not automatically
workspace Secondary.

## 5.4 Spec workflow

**Product direction**

Specification will itself move through deterministic workflow similarly to Task.

The human-facing projection should be generic enough to show:

```text
current step
runtime state
semantic status
readiness
human gate / required decision
available action
transition result/history when useful
```

**Open question:** new SpecFlow has not yet frozen the persistence model for Spec workflow. Do not
design UI around a copied Task-specific storage shape.

---

# 6. Task summary inside Specification

A Task summary should support scanning and selection, not become a miniature Task detail.

## 6.1 High-value Task facts

| Information                           | Class                         | Evidence                                         | Default visibility                                                                                                            |
| ------------------------------------- | ----------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Task title + id                       | Orientation                   | Old-repo deterministic evidence                  | Always in Task row/item                                                                                                       |
| Semantic workflow status              | Orientation                   | Old-repo deterministic evidence                  | Always perceivable from the item or its containing grouping; do not repeat a badge when lane/grouping already communicates it |
| Requires attention + reason           | Requires attention            | Product direction                                | Always when true                                                                                                              |
| Ready next action                     | Ready                         | Legacy action projection                         | Visible when relevant                                                                                                         |
| Active Session/agent work             | Current activity              | Current execution projection + product direction | Visible only when current execution proves this Task is in scope                                                              |
| Dependency/blocker summary            | Context                       | Old-repo deterministic evidence                  | Visible when blocking                                                                                                         |
| Review outcome requiring owner action | Requires attention / Evidence | Legacy review artifact                           | Visible when relevant                                                                                                         |
| Completion/progress state             | Orientation                   | Candidate derived projection                     | Compact                                                                                                                       |
| linked Sessions count/list            | Context                       | Legacy Session binding                           | Usually secondary information                                                                                                 |

Lower-value facts such as attempt number, raw gate type, file path, timestamps, and workflow history
should not compete with the main Task state in the list.

## 6.2 Task selection

**Product direction**

Selecting a Task opens Task detail as the Specification's contextual Secondary on wide layouts and as
focused/pushed detail on narrow layouts.

```text
Specification
    -> click Task
Specification | Task detail
```

Opening Task is the context step. It should not itself approve, start, review, or finish anything.

---

# 7. Task detail information hierarchy

## 7.1 Level A - decision orientation

The top of Task detail should let the user answer within seconds:

```text
What is this?
Where is it in workflow?
Is something waiting for me?
What happens if I act?
```

Candidate information:

| Information                    | Class              | Evidence                               |
| ------------------------------ | ------------------ | -------------------------------------- |
| Task id/title                  | Orientation        | Old-repo deterministic evidence        |
| human-readable semantic status | Orientation        | Legacy deterministic workflow          |
| current step                   | Context            | Legacy deterministic workflow          |
| requires-attention reason      | Requires attention | Product direction                      |
| ready action                   | Ready              | Legacy action inspection               |
| active work/current Session    | Current activity   | Current execution / Runtime projection |
| blocking dependency/problem    | Context            | Old-repo deterministic evidence        |
| deterministic primary action   | Action             | Workflow/application projection        |

Do not present old lifecycle status, runtime step state, semantic status, and stage as four equal
badges. They are implementation facts with overlapping human meaning.

## 7.2 Level B - task intent

The user reviewing or steering a Task needs the task's declared intent close to the decision.

Candidate:

- goal / summary;
- requirements;
- acceptance criteria;
- constraints;
- dependencies;
- relevant semantic references;
- task document.

**Old-repo deterministic evidence:** Task document/file references, dependencies, and semantic-reference
scope exist in legacy workflow.

This information is **Context**, not Deep inspection.

## 7.3 Level C - why this action is available

The UI should expose the deterministic explanation behind an action.

Legacy deterministic action/gate checks already demonstrate useful concepts:

- ready;
- reason/summary;
- required inputs;
- factual context;
- gate results;
- current step;
- attempt;
- workflow state;
- source-control facts.

The new UI does not need to expose these field names literally. It needs a human projection such as:

```text
Ready for review

Why:
- implementation step completed
- required verification passed
- no unresolved blocking gate
- review artifact is current

Action:
Review / approve / continue
```

or:

```text
Cannot continue

Blocked by:
- TASK-02 is not complete
```

The action must not be a mysterious enabled/disabled button.

## 7.4 Level D - evidence for a human decision

When a decision is requested, relevant evidence should be reachable from the same Task detail without
a scavenger hunt.

Candidate evidence:

- current review report;
- Handover;
- relevant code changes/diff;
- verification/gate results;
- linked Session;
- produced files/artifacts;
- relevant PR/source-control state.

A decision surface may summarize evidence inline and link to deeper views.

## 7.5 Level E - technical inspection

Examples:

- workflow attempt history;
- raw gate implementation detail;
- raw command output;
- low-level source-control facts;
- tool Work;
- internal ids;
- operation/recovery records.

These should not be required to make a normal owner decision.

---

# 8. Deterministic Task model: migration evidence

This section records legacy deterministic facts so future UI/backend work can distinguish useful
concepts from legacy representation.

## 8.1 Basic Task properties seen by the legacy dashboard

**Old-repo deterministic evidence**

```text
id
title
order
status
stage
dependsOn[]
blockedBy[]
ready
terminal
file
```

The dashboard also derives Spec-level metrics from Tasks.

Migration note:

- id/title/dependency/document-reference clearly carry product meaning;
- ready is useful as a projection, but should be derived from the new deterministic model;
- stage and lifecycle status may overlap with semantic workflow status and need consolidation;
- terminal is likely derivable;
- blockedBy is useful to users, but ownership of the derived blocker projection should remain in
  application/runtime logic.

## 8.2 Workflow progress

**Old-repo deterministic evidence**

```text
workflow_progress
|-- current_step
|-- current_attempt
|-- state: active | completed
'-- history[]
    |-- step
    |-- attempt
    |-- completed_at
    '-- transitioned_to
```

A workflow definition also declares per-step semantic status identifiers for active/completed states.

The useful product concepts are:

- workflow position;
- attempt identity when evidence freshness matters;
- active/completed runtime state;
- semantic status;
- transition/history evidence.

The UI should generally lead with semantic meaning, not the storage representation.

## 8.3 Step behavior contract

**Old-repo deterministic evidence**

Workflow steps can declare:

- purpose;
- expectedWork;
- hints referencing docs/skills/files.

These may become useful Context in Task detail, especially when the human asks "what is the agent
supposed to do in this phase?" They should not automatically become primary UI chrome.

## 8.4 Old Task lifecycle vocabulary

Legacy Task lifecycle values include:

```text
draft
approved
in-implementation
implemented
verified
archived
abandoned
```

This vocabulary predates or coexists with richer deterministic workflow semantics.

**Migration rule for UI work:** do not create new visual variants or navigation rules around these
values until the deterministic migration decides which remain authoritative.

---

# 9. Human attention projection

## 9.1 Attention is not the same as readiness

The UI should expose these semantic differences:

### Requires attention

The intended flow cannot make useful progress without human intervention.

Examples:

- provider/agent question, permission, or confirmation waiting for response;
- human workflow gate or review waiting for owner decision;
- authoritative execution failure/interruption that requires owner choice.

Provider questions are high urgency because an active Session is directly waiting. A provider
error/limit belongs here only when authoritative runtime state can prove human intervention is needed;
do not invent a switch-agent action from an ambiguous failure.

### Ready

Prerequisites are satisfied for a **specific operation** and the user may choose to initiate it.

Examples:

- Task workflow step ready to start;
- safe continue action available;
- another explicit workflow action available.

Ready is not attention. The user may intentionally leave it idle.

### Working

The system/agent is actively progressing the object.

### Issue / remediation

An issue is only part of Requires attention when the human must intervene. Agent-remediable or
self-recoverable conditions may instead remain an active/current-work signal with their own reason.

### Ready to resume / continue

A prior AI Turn/execution may be settled while legal work remains. This is a product projection, not
a persisted Task lifecycle value.

### Quiet / no immediate action

No immediate human or agent action is expected.

These are derived projections. A terminal Turn does not imply a terminal Task, and an active workflow
attempt does not prove an agent is currently working.

## 9.2 Attention item shape - candidate

**Future candidate**

A normalized UI/application projection could conceptually carry:

```text
subject            Spec or Task
severity/priority  only if meaningful
reason             human-readable
requiredAction     what kind of owner action is needed
evidenceRefs       what should be read first
availableAction    deterministic operation
```

This is not an API proposal yet. It records the information needed to implement the human steering
loop consistently.

---

# 10. Review evidence

## 10.1 What legacy review artifacts prove

**Old-repo deterministic evidence**

Legacy review flow persists current review reports under the Specification, with Task-specific review
files. Reviews include:

- explicit verdict;
- findings classified by who needs to act;
- unresolved required fixes;
- unresolved owner decisions;
- unresolved clarification needs;
- freshness/fingerprint evidence;
- gating vs non-gating verification results.

Actor classifications include concepts such as:

```text
AUTO_FIX
OWNER_DECISION
NEEDS_CLARIFICATION
NON_BLOCKING
INFORMATIONAL
```

The exact legacy review schema is not automatically the new contract, but it demonstrates important
UI requirements:

- show a concise outcome;
- distinguish "owner must decide" from "agent can fix";
- distinguish blocking from informational findings;
- indicate stale evidence;
- link the report used to justify the next action;
- support one shared multi-Task review artifact while preserving separate per-Task outcomes/verdicts.

A shared report must not force the UI to invent one representative Task or collapse all reviewed
Tasks into one status.

## 10.2 Task review UI consequence

For a Task waiting on human review, Task detail should make this sequence possible:

```text
Task requires review
    -> open Task
    -> see current review outcome + relevant findings
    -> inspect changes / handover / session if needed
    -> choose deterministic decision
```

The user should not have to open a raw Markdown review report first just to discover the verdict.

The raw/current report remains valuable evidence and should stay accessible.

---

# 11. Handover

## Current conclusion

**Product direction**

Handover should be treated as decision context/evidence, not merely a technical Work event.

A useful Handover presentation should eventually answer:

- who/what produced the handover;
- recipient/next actor when known;
- what was completed;
- what remains;
- why control is being transferred;
- relevant artifacts;
- relevant changes;
- linked Session(s);
- expected next human/agent action.

## Open contract

The old `dczerwinskipl/nevo` repository contains handoff/review concepts, but the new deterministic Handover identity and
ownership are not yet sufficiently clear to freeze properties here.

Do not invent a persistent Handover entity from the UI.

For MVP Task review, a Handover can be treated as a relevant artifact/context object if the migrated
backend exposes one.

---

# 12. Changes and diff

## MVP direction

When reviewing a Task, start by making **all currently relevant changes** easy to inspect.

Do not block the first UI on perfect attribution of every changed line to a Task, Session, attempt,
or Handover.

Candidate progression:

```text
MVP
Task -> relevant current change set

Later
Task review/handover -> change set scoped to the evidence boundary handed to the human
```

The later model is preferable when provenance becomes trustworthy, because the human should review
the work being handed over rather than unrelated worktree drift.

Diff is **Evidence**, not the Task's primary identity.

---

# 13. Sessions from Task

**Product direction**

Task detail should show Sessions as Context, but it must distinguish **historical/contextual
association** from **current execution scope**.

```text
Session linked to / previously touched TASK-03
!=
current Turn is executing TASK-03
```

For deterministic execution, "Agent working on TASK-03" requires authoritative current execution
identity. Historical `taskIds`, a previous active Task, or opening the Session from TASK-03 are not
sufficient evidence.

A Session may be:

- generic/spec-level;
- contextually associated with one or more Tasks;
- currently executing one Task;
- currently executing a Task batch.

For a batch Session, do not choose one Task as the fake "primary Task". If the current execution
scope is A+B+C, Full Session should expose A+B+C even if the floating Session was opened from A.

The primary Task interaction is not to replace Task detail with a nested Session detail.

A Session reference should expose the quick conversation target and direct Full Session access as
separate intents:

```text
Task detail
    -> conversation target
       -> Floating Session where supported
    -> Open full session
       -> Full Session
```

Useful Task-level Session summary:

- Session identity/title;
- agent role/profile first (for example Reviewer or Implementer);
- active/settled status;
- current execution scope, if this Task is actually part of it;
- current activity when authoritative current execution exists;
- requires-attention marker;
- contextual relation to this Task;
- quick conversation action where supported;
- direct Open full session action.

Provider/model/mode are usually secondary execution detail. They can become contextual start
options when the user creates/starts an execution, but project defaults belong in Settings. Legacy
batch reservation evidence freezes provider, model, mode, and context capacity for the concrete
execution; the UI should present those effective reserved values rather than imply that later default
changes retroactively change them.

`effort` is currently a per-Turn option in the legacy contract and must not be described as part of
that frozen execution snapshot unless the authoritative contract changes.

Detailed conversation and Work stay in Session surfaces.

---

# 14. Concrete human flows

These scenarios should be used later to validate screen structure.

## 14.1 Ready to start

```text
Specs overview
  Spec A: READY

open Spec A
  Task 03: ready to start

open Task 03
  - goal
  - prerequisites satisfied
  - current workflow position
  - what "start" will activate
  [Start]

click Start
  deterministic operation
```

Important distinction: this is convenient but not an alert. Nothing is waiting for an owner decision
yet.

## 14.2 Task requires review

```text
Specs overview
  Spec A: REQUIRES ATTENTION
  "3 Tasks require review"

open Spec A
  responsible Tasks are identified and attention context is visible

open Task 03
  - why review is required
  - task intent / AC
  - review outcome
  - handover/context
  - relevant changes
  - linked Session
  - verification evidence
  [Review / decision action]
```

The overview deliberately stays aggregate. Task-specific context is exposed after entering the
Specification; the final decision remains a separate deliberate interaction.

## 14.3 Agent is working

```text
Specs overview
  Spec A: IN PROGRESS
  "Reviewer working on 3 Tasks"

open Spec A
  authoritative execution scope identifies the participating Tasks

open Task 03
  current Session/execution scope
  no fake human-attention state

open Session conversation
  Floating Session where supported

or Open full session
  Full Session directly
```

The aggregate "Reviewer working on 3 Tasks" summary is allowed only when authoritative current
execution scope proves that work is active. A linked/historical Session alone is insufficient.

Working is not ready and is not requires-attention.

## 14.4 Start blocked by dependency

```text
Spec A
  Task 03: cannot start
  "Waiting for TASK-02"

open Task 03
  dependency context
  Start is unavailable for this reason
  another remediation action may still be legal
```

If resolving the dependency does not require a human decision, avoid attention styling. Do not turn
one blocked operation into a universal Task-level `BLOCKED` state.

## 14.5 Review has unresolved owner decision

```text
Specs overview
  REQUIRES ATTENTION
  "Owner decision required"

open Task
  current review summary
  exact unresolved decision
  relevant evidence
  [decision]
```

Do not summarize this merely as "changes required"; the human actor is part of the meaning.

## 14.6 Review has agent-fixable findings

```text
Task detail
  Review: changes required
  AUTO_FIX findings exist

show:
  what will be changed
  evidence/report
  explicit batch apply action if supported
```

This differs from OWNER_DECISION even if both came from the same review artifact.

## 14.7 Generic Turn after Task-associated work

```text
Task 03
  linked Session S

Session S previously executed TASK-03

user sends an ordinary generic/spec-level message
  -> new Turn has no explicit Task execution identity

UI:
  Session remains contextually related to TASK-03
  but does NOT show "working on TASK-03"
```

This prevents historical Session binding from becoming false current execution state.

## 14.8 Multi-Task review Session

```text
TASK-01
TASK-02
TASK-03
  -> one review execution/session with scope 01+02+03
  -> possibly one shared review artifact
  -> separate per-Task verdict/outcome
```

Opening the Session from TASK-02 may preserve TASK-02 as entry context in the floating surface, but
Full Session must expose the whole current batch scope.

## 14.9 Terminal Turn, more legal work remains

```text
AI Turn/execution settles safely
Task is not complete
more deterministic work is legal
no ambiguous durable operation requires recovery

This may be:
  - before workflow attempt activation during remediation
  - during an active workflow attempt
  - an unfinished finish-operation that is safely replayable

UI:
  not "Agent working"
  not "Task done"
  expose continue/resume only when authoritative readiness allows it
```

"Ready to resume/continue" is a projection, not a new persisted Task status and not a synonym for
`workflow_progress.state === active`.

## 14.10 Recovery required after terminal Turn

```text
AI Turn settles
workflow attempt is not complete
automatic continuation is not safe

UI:
  not "Task done"
  not generic "Blocked"
  show recovery/remediation reason
  expose the authoritative recovery action if one exists
```

Recovery-required and resumable are different projections. Neither should become a new persisted
Task lifecycle status merely for UI convenience.

## 14.11 Spec-level workflow attention

**Future migration scenario**

```text
Specs overview
  Spec A: REQUIRES ATTENTION
  "Specification approval required"

open Spec A
  spec workflow context
  spec review/artifacts
  unresolved findings/decisions
  [approve / workflow-specific action]
```

The product model should support this without inventing a second special-purpose status system for
Specifications.

---

# 15. What belongs where

This is an information-depth proposal, not a pixel layout.

## Specs overview

The canonical row budget is owned by
[Spec steering collection and item UI spec](components/spec-steering-ui-spec.md) and matches
[§4.2](#42-minimum-specification-summary):

- Spec identity/title;
- optional bounded trailing metadata allowed by the steering contract;
- compact Task progress when known;
- one dominant aggregate state summary;
- at most one bounded concurrent qualifier when omitting it would materially misrepresent the row.

One canonical queue row per Specification. The whole row/identity always opens the Specification.
Ordinary status/reason prose in that row is non-interactive. Concrete Task, Session, evidence, and
workflow context becomes explicit after entering the Specification; the overview never invents a
representative Task or deep-links directly from dynamic summary state.

Task IDs, raw signal collections, Session identity, arbitrary current-execution detail, workflow
labels, provider/model data, timestamps/last-activity detail, raw gates, attempt history, full
findings, tool details, and raw diffs do not automatically earn canonical row space.

Activity remains a valid source/read-model and deeper-history concept. It may support future
collection behavior, ordering, or deeper context without becoming part of the current row budget by
default.

## Specification

Keep:

- Spec orientation and workflow state;
- Specification documents with compact/expandable reading;
- Task collection;
- bulk Task selection/actions when the backend supplies legal selection actions;
- high-value attention/ready/current-work signals;
- related Session history;
- important Spec-level evidence;
- relevant links to external/project-level changes, PRs/MRs, deployments/releases, or pipeline facts
  when available.

Specification may reference project-level operational facts without owning deployment/release
semantics.

## Task detail

Keep:

- decision orientation;
- task intent;
- current workflow context;
- why an action is available/blocked;
- evidence needed for the current decision;
- several related Sessions when useful, with active/current Session visually distinct;
- Session metadata that is factual (provider/agent/archetype, batch/scope, workflow association) and
  does not infer a completed role from the Session alone;
- changes/Handover/review summary.

A workflow/history entry that has a Session reference opens that Session. A future turn anchor may
refine the target to the exact Turn without introducing another intermediate "proof" screen.

## Deep inspection

Put behind explicit navigation:

- full review/document artifact;
- future diff/file preview;
- attempt/history;
- Work/tool details;
- raw verification output;
- low-level source-control/runtime diagnostics.

Artifacts remain readable evidence. Approve/reject/edit actions belong to the workflow/Human Step
that consumes the artifact, not to a generic document viewer.

# 16. Data/projection gaps exposed by this hierarchy

The UI should not compensate with heuristics if the application layer cannot answer these questions.

Potential backend/read-model gaps:

1. canonical Spec-level workflow projection;
2. canonical human-attention projection for Spec and Task;
3. per-action readiness projection distinct from attention and from one universal Task.ready;
4. concise reason why each action is ready/blocked/remediation-capable;
5. relevant evidence references for a human gate/action;
6. canonical Handover contract;
7. artifact ownership/reference model, including one artifact referenced by multiple Tasks;
8. change/diff provenance beyond whole current worktree;
9. canonical current ExecutionScope (generic / single Task / Task batch) distinct from Session history;
10. current active Session/work projection at Spec/Task level;
11. "ready to resume/continue" / remediation projection after terminal Turn or interrupted execution;
12. Activity/audit projection for last/recent meaningful actions without making Activity workflow authority;
13. contextual runtime execution configuration (agent profile plus the effective reserved
    provider/model/mode/context-capacity snapshot where applicable, with per-Turn options such as
    effort represented separately);
14. stale/fresh review evidence expressed without parsing report prose.

Some of these may already exist partially in the old `dczerwinskipl/nevo` repository. Migration should preserve the **semantic
capability**, not necessarily its old DTO.

---

# 17. Questions deliberately left open

These are not blockers for the next visual pass unless that pass touches them directly.

1. Which old Task lifecycle statuses survive deterministic migration?
2. Does Specification workflow use the same generic workflow-subject model as Task?
3. What is the canonical Handover identity and ownership?
4. What exactly owns a review artifact in the new model: Spec, Task, step/attempt, Session, or
   multiple references?
5. Which human-gate decisions/outcomes need first-class UI beyond approve/reject?
6. How precisely can current code attribute changes to Task, Session, attempt, or Handover?
7. Which workflow action-check fields will become stable application/UI projections?
8. Should archive remain a storage-backed source distinction or become purely product lifecycle?
9. What stable application contract should expose current single-Task vs Task-batch ExecutionScope?
10. Which execution options are user-selectable per Session/execution versus inherited from project
    defaults, and which remain per-Turn options rather than part of the reserved execution snapshot?
11. Which Activity facts should be projected directly versus kept only in deep audit/history?

When one of these becomes necessary for a screen contract, inspect the deterministic implementation
first and ask the owner only if semantics remain ambiguous.

---

# 18. Next design pass

This hierarchy is now exercised by
[Specification and Task screen structure](spec-task-screen-structure.md), covering ready, current
execution, human review, Specification-level action, remediation, resume, and recovery states.

The equivalent Full Session pass is now captured in
[Full Session screen structure](full-session-screen-structure.md).

That mapping is now captured in
[Design-system and composition gaps](design-system-component-composition-gaps.md).
