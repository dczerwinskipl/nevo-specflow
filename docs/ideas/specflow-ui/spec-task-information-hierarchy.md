---
id: ideas.specflow-ui.spec-task-information-hierarchy
type: product
title: Specification and Task information hierarchy
status: draft
scope: specflow
areas:
  - ui
  - product
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
  - designing the Specs overview, Specification workspace, or Task detail
  - deciding which workflow facts deserve immediate human visibility
  - designing review, approval, start, or finalize steering flows
  - migrating Task and workflow projections from legacy Nevo into SpecFlow
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

~~~text
overview
  -> see that something requires attention or is ready
  -> 1 click
context + evidence + why the action exists
  -> 2nd deliberate interaction
deterministic action / human decision
~~~

The first click is for understanding. The second click may mutate workflow state.

The UI should not make the owner reconstruct state from YAML, raw gate output, provider events, or
legacy lifecycle statuses.

---

## 2. Evidence labels

The inventory below uses these labels:

- **Current contract** - authoritative in the new SpecFlow repository.
- **Legacy deterministic evidence** - implemented in legacy Nevo deterministic flow and useful for
  migration analysis, but not automatically part of the new contract.
- **Product direction** - agreed direction for the new UI.
- **Future candidate** - useful direction that should not block MVP.
- **Open question** - semantics are not clear enough to infer safely.

A legacy property can justify a UI need without justifying the same persisted field or enum in the
new implementation.

---

## 3. Information classes

Every UI fact should fit one primary class.

| Class | Human question it answers | Visibility goal |
| --- | --- | --- |
| **Orientation** | What am I looking at? | Always available. |
| **Requires attention** | Is the product waiting for me? Why? | Prominent before drill-down. |
| **Ready** | Is there a safe next action available if I choose to continue? | Visible but calmer than attention. |
| **Current activity** | Is work happening now, and on what? | Visible without opening technical detail. |
| **Context** | What do I need to understand this state? | One interaction away at most. |
| **Evidence / artifact** | What supports the decision I am being asked to make? | Directly reachable from the decision context. |
| **Deep inspection** | What happened technically? | Progressive disclosure. |
| **Action** | What deterministic operation can I perform? | Shown only with its reason/readiness. |

A single backend field can contribute to more than one projection, but the UI should avoid showing
the same fact repeatedly without adding meaning.

---

# 4. Specs overview

## 4.1 Purpose

The Specs overview is not merely a list of specifications. It is the owner's work queue.

Before opening a Specification, the screen should make these categories distinguishable:

~~~text
REQUIRES ATTENTION
Something is waiting on the human.

READY
The system can proceed when the human chooses to start/continue.

IN PROGRESS
Agent/runtime work is currently happening.

BLOCKED / UNAVAILABLE
Progress cannot continue, but this is not necessarily waiting for a human decision.

QUIET / DONE
No immediate action is needed.
~~~

These are product projections, not proposed persisted status values.

## 4.2 Minimum Specification summary

| Information | Class | Evidence | Why it matters |
| --- | --- | --- | --- |
| Specification title / identity | Orientation | Product direction | User must know which change is being discussed. |
| Active vs Archive | Orientation | Legacy deterministic evidence + product direction | Determines whether this belongs to current work or history. |
| Current workflow step | Orientation / Context | Product direction; Task equivalent exists in legacy deterministic flow | Shows where the Spec is in its process. |
| Semantic workflow status | Orientation | Current deterministic architecture concept; legacy implementation evidence for Tasks | More human-readable than raw step/state. |
| Requires-human-attention projection | Requires attention | Product direction | Lets the overview act as a work queue. |
| Reason attention is required | Requires attention | Product direction | "Review TASK-03" is useful; a red dot alone is not. |
| Ready next action | Ready | Legacy deterministic action inspection + product direction | Distinguishes ready-to-start from waiting-on-human. |
| Active/running work summary | Current activity | Current Session semantics + product direction | Shows that work is already happening and on what. |
| Task progress summary | Context | Legacy dashboard evidence | Useful orientation without opening every Task. |
| Blocking/error summary | Context | Deterministic fail-closed model | Explains why progress cannot continue. |
| Last meaningful activity | Context | Candidate | Helps scan stale vs active Specs; not a workflow truth. |

The overview should prefer a small number of meaningful projections over exposing every underlying
status.

## 4.3 Ordering principle

**Product direction**

Default ordering should make human work discoverable.

A candidate priority is:

~~~text
1. requires attention
2. active work with a problem / blocked state
3. ready to start or continue
4. normal in-progress work
5. quiet/completed active Specs
~~~

This is not yet a final sort algorithm. It records the product priority that "I need to do something"
must not be buried below passive status.

---

# 5. Specification workspace

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

| Information | Class | Evidence |
| --- | --- | --- |
| title / stable Spec identity | Orientation | Product direction |
| active/archive context | Orientation | Legacy evidence |
| current Spec workflow step | Orientation | Product direction |
| semantic Spec workflow status | Orientation | Product direction |
| requires-attention summary | Requires attention | Product direction |
| active work summary | Current activity | Product direction |
| primary available next action, if any | Ready / Action | Product direction |

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

~~~text
current step
runtime state
semantic status
readiness
human gate / required decision
available action
transition result/history when useful
~~~

**Open question:** new SpecFlow has not yet frozen the persistence model for Spec workflow. Do not
design UI around a copied Task-specific storage shape.

---

# 6. Task summary inside Specification

A Task summary should support scanning and selection, not become a miniature Task detail.

## 6.1 High-value Task facts

| Information | Class | Evidence | Default visibility |
| --- | --- | --- | --- |
| Task title + id | Orientation | Legacy deterministic evidence | Always in Task row/item |
| Semantic workflow status | Orientation | Legacy deterministic evidence | Always |
| Requires attention + reason | Requires attention | Product direction | Always when true |
| Ready next action | Ready | Legacy action projection | Visible when relevant |
| Active Session/agent work | Current activity | Legacy Session binding + product direction | Visible when active |
| Dependency/blocker summary | Context | Legacy deterministic evidence | Visible when blocking |
| Review outcome requiring owner action | Requires attention / Evidence | Legacy review artifact | Visible when relevant |
| Completion/progress state | Orientation | Candidate derived projection | Compact |
| linked Sessions count/list | Context | Legacy Session binding | Usually secondary information |

Lower-value facts such as attempt number, raw gate type, file path, timestamps, and workflow history
should not compete with the main Task state in the list.

## 6.2 Task selection

**Product direction**

Selecting a Task opens Task detail as the Specification's contextual Secondary on wide layouts and as
focused/pushed detail on narrow layouts.

~~~text
Specification
    -> click Task
Specification | Task detail
~~~

Opening Task is the context step. It should not itself approve, start, review, or finish anything.

---

# 7. Task detail information hierarchy

## 7.1 Level A - decision orientation

The top of Task detail should let the user answer within seconds:

~~~text
What is this?
Where is it in workflow?
Is something waiting for me?
What happens if I act?
~~~

Candidate information:

| Information | Class | Evidence |
| --- | --- | --- |
| Task id/title | Orientation | Legacy deterministic evidence |
| human-readable semantic status | Orientation | Legacy deterministic workflow |
| current step | Context | Legacy deterministic workflow |
| requires-attention reason | Requires attention | Product direction |
| ready action | Ready | Legacy action inspection |
| active work/current Session | Current activity | Legacy Session binding |
| blocking dependency/problem | Context | Legacy deterministic evidence |
| deterministic primary action | Action | Workflow/application projection |

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

**Legacy deterministic evidence:** Task document/file references, dependencies, and semantic-reference
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

~~~text
Ready for review

Why:
- implementation step completed
- required verification passed
- no unresolved blocking gate
- review artifact is current

Action:
Review / approve / continue
~~~

or:

~~~text
Cannot continue

Blocked by:
- TASK-02 is not complete
~~~

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

**Legacy deterministic evidence**

~~~text
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
~~~

The dashboard also derives Spec-level metrics from Tasks.

Migration note:

- id/title/dependency/document-reference clearly carry product meaning;
- ready is useful as a projection, but should be derived from the new deterministic model;
- stage and lifecycle status may overlap with semantic workflow status and need consolidation;
- terminal is likely derivable;
- blockedBy is useful to users, but ownership of the derived blocker projection should remain in
  application/runtime logic.

## 8.2 Workflow progress

**Legacy deterministic evidence**

~~~text
workflow_progress
|-- current_step
|-- current_attempt
|-- state: active | completed
'-- history[]
    |-- step
    |-- attempt
    |-- completed_at
    '-- transitioned_to
~~~

A workflow definition also declares per-step semantic status identifiers for active/completed states.

The useful product concepts are:

- workflow position;
- attempt identity when evidence freshness matters;
- active/completed runtime state;
- semantic status;
- transition/history evidence.

The UI should generally lead with semantic meaning, not the storage representation.

## 8.3 Step behavior contract

**Legacy deterministic evidence**

Workflow steps can declare:

- purpose;
- expectedWork;
- hints referencing docs/skills/files.

These may become useful Context in Task detail, especially when the human asks "what is the agent
supposed to do in this phase?" They should not automatically become primary UI chrome.

## 8.4 Old Task lifecycle vocabulary

Legacy Task lifecycle values include:

~~~text
draft
approved
in-implementation
implemented
verified
archived
abandoned
~~~

This vocabulary predates or coexists with richer deterministic workflow semantics.

**Migration rule for UI work:** do not create new visual variants or navigation rules around these
values until the deterministic migration decides which remain authoritative.

---

# 9. Human attention projection

## 9.1 Attention is not the same as readiness

The UI should expose at least these semantic differences:

### Requires attention

The product cannot make the intended progress without human input/decision.

Examples:

- human workflow gate;
- review waiting for owner decision;
- AI Session interaction requiring response;
- recovery/problem requiring owner intervention.

### Ready

Prerequisites are satisfied and the user may choose to initiate the next operation.

Examples:

- Task ready to start;
- workflow step ready to start;
- finalize available.

### Working

The system/agent is actively progressing the object.

### Blocked / unavailable

Progress cannot continue now, but the object is not necessarily waiting for a human decision.

### Settled

No immediate work is expected.

These should be derived projections, not a second persisted state machine.

## 9.2 Attention item shape - candidate

**Future candidate**

A normalized UI/application projection could conceptually carry:

~~~text
subject            Spec or Task
severity/priority  only if meaningful
reason             human-readable
requiredAction     what kind of owner action is needed
evidenceRefs       what should be read first
availableAction    deterministic operation
~~~

This is not an API proposal yet. It records the information needed to implement the human steering
loop consistently.

---

# 10. Review evidence

## 10.1 What legacy review artifacts prove

**Legacy deterministic evidence**

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

~~~text
AUTO_FIX
OWNER_DECISION
NEEDS_CLARIFICATION
NON_BLOCKING
INFORMATIONAL
~~~

The exact legacy review schema is not automatically the new contract, but it demonstrates important
UI requirements:

- show a concise outcome;
- distinguish "owner must decide" from "agent can fix";
- distinguish blocking from informational findings;
- indicate stale evidence;
- link the report used to justify the next action.

## 10.2 Task review UI consequence

For a Task waiting on human review, Task detail should make this sequence possible:

~~~text
Task requires review
    -> open Task
    -> see current review outcome + relevant findings
    -> inspect changes / handover / session if needed
    -> choose deterministic decision
~~~

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

Legacy Nevo contains handoff/review concepts, but the new deterministic Handover identity and
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

~~~text
MVP
Task -> relevant current change set

Later
Task review/handover -> change set scoped to the evidence boundary handed to the human
~~~

The later model is preferable when provenance becomes trustworthy, because the human should review
the work being handed over rather than unrelated worktree drift.

Diff is **Evidence**, not the Task's primary identity.

---

# 13. Sessions from Task

**Product direction**

Task detail should show linked Sessions as Context.

The primary Task interaction is not to replace Task detail with a nested Session detail.

~~~text
Task detail
    -> click Session
Floating Session
    -> Open full session
Full Session workspace
~~~

Useful Task-level Session summary:

- Session identity/title;
- active/settled status;
- current activity when active;
- requires-attention marker;
- relation to this Task;
- quick open floating Session action.

Detailed conversation and Work stay in Session surfaces.

---

# 14. Concrete human flows

These scenarios should be used later to validate screen structure.

## 14.1 Ready to start

~~~text
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
~~~

Important distinction: this is convenient but not an alert. Nothing is waiting for an owner decision
yet.

## 14.2 Task requires review

~~~text
Specs overview
  Spec A: REQUIRES ATTENTION
  "TASK-03 requires review"

open Spec A
  Task 03 highlighted as attention

open Task 03
  - why review is required
  - task intent / AC
  - review outcome
  - handover/context
  - relevant changes
  - linked Session
  - verification evidence
  [Review / decision action]
~~~

This is the reference "one click for context, second deliberate click for decision" flow.

## 14.3 Agent is working

~~~text
Specs overview
  Spec A: IN PROGRESS
  "Agent working on TASK-03"

open Spec A
  Task 03 shows current activity

open Task 03
  current Session/activity
  no fake human-attention state

click Session
  Floating Session
~~~

Working is not ready and is not requires-attention.

## 14.4 Blocked by dependency

~~~text
Spec A
  Task 03: BLOCKED
  "Waiting for TASK-02"

open Task 03
  dependency context
  no misleading enabled Start action
~~~

If resolving the blocker does not require a human decision, avoid attention styling.

## 14.5 Review has unresolved owner decision

~~~text
Specs overview
  REQUIRES ATTENTION
  "Owner decision required"

open Task
  current review summary
  exact unresolved decision
  relevant evidence
  [decision]
~~~

Do not summarize this merely as "changes required"; the human actor is part of the meaning.

## 14.6 Review has agent-fixable findings

~~~text
Task detail
  Review: changes required
  AUTO_FIX findings exist

show:
  what will be changed
  evidence/report
  explicit batch apply action if supported
~~~

This differs from OWNER_DECISION even if both came from the same review artifact.

## 14.7 Spec-level workflow attention

**Future migration scenario**

~~~text
Specs overview
  Spec A: REQUIRES ATTENTION
  "Specification approval required"

open Spec A
  spec workflow context
  spec review/artifacts
  unresolved findings/decisions
  [approve / workflow-specific action]
~~~

The product model should support this without inventing a second special-purpose status system for
Specifications.

---

# 15. What belongs where

This is an information-depth proposal, not a pixel layout.

## Specs overview

Keep:

- identity;
- attention vs ready vs working;
- short reason;
- compact progress;
- obvious blocker;
- last/high-value activity.

Do not expose:

- raw gates;
- attempt history;
- full review findings;
- tool details;
- raw diffs.

## Specification workspace

Keep:

- Spec orientation and workflow state;
- Tasks;
- high-value attention/ready state;
- current Sessions/work;
- important Spec-level evidence;
- source-control summary when relevant.

## Task detail

Keep:

- decision orientation;
- task intent;
- current workflow context;
- why action is available/blocked;
- evidence needed for current decision;
- linked Sessions;
- changes;
- Handover/review summary.

## Deep inspection

Put behind explicit navigation:

- full review artifact;
- full diff/file preview;
- attempt/history;
- Work/tool details;
- raw verification output;
- low-level source-control/runtime diagnostics.

---

# 16. Data/projection gaps exposed by this hierarchy

The UI should not compensate with heuristics if the application layer cannot answer these questions.

Potential backend/read-model gaps:

1. canonical Spec-level workflow projection;
2. canonical human-attention projection for Spec and Task;
3. ready-next-action projection distinct from attention;
4. concise reason why an action is ready/blocked;
5. relevant evidence references for a human gate/action;
6. canonical Handover contract;
7. artifact ownership/reference model;
8. change/diff provenance beyond whole current worktree;
9. current active Session/work projection at Spec/Task level;
10. stale/fresh review evidence expressed without parsing report prose.

Some of these may already exist partially in legacy Nevo. Migration should preserve the **semantic
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

When one of these becomes necessary for a screen contract, inspect the deterministic implementation
first and ask the owner only if semantics remain ambiguous.

---

# 18. Next design pass

Use this hierarchy to sketch **three states of the same product surface**, not three unrelated pages:

1. Specification with no required human action but work ready to start;
2. Specification with a Task actively being worked by an agent;
3. Specification with a Task requiring human review.

For each state, validate:

- can the owner identify its category from the Specs overview;
- is the relevant Task discoverable immediately;
- does opening Task provide enough evidence to decide;
- is the mutation still a separate deliberate interaction;
- does mobile preserve the same hierarchy when Secondary becomes pushed detail.

Only after those flows work should component inventory and final screen layout be frozen.
