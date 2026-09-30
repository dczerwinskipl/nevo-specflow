---
id: ideas.specflow-ui.information-navigation-inventory
type: product
title: SpecFlow UI information and navigation inventory
status: draft
scope: specflow
areas:
  - ui
  - product
  - workflow
  - runtime
  - configuration
tags:
  - information-architecture
  - specifications
  - tasks
  - sessions
  - workflow
  - human-attention
  - artifacts
  - handover
read_when:
  - planning real SpecFlow UI screens after the design-system migration
  - deciding whether a concept is a route, workspace secondary, floating surface, inline detail, or action
  - deciding which workflow facts are primary information for a human
  - migrating deterministic task/session/workflow data from legacy Nevo
summary: >
  Working inventory of SpecFlow UI concepts, ownership, deterministic properties, human-attention
  semantics, artifacts, and candidate navigation depth. It intentionally precedes screen layout.
related:
  - ideas.specflow-ui
  - product.specflow.ui.interaction-model
  - product.specflow.ui.ai-session-ux
  - product.specflow.ui.personas
  - architecture.workflow.deterministic-workflow
  - architecture.ai.canonical-session-turn-work
  - ideas.developer-workspace.code-inspection-and-editing
---

# SpecFlow UI information and navigation inventory

## 1. Intent

This is a non-authoritative working inventory, intentionally earlier than wireframes.

The UI is a tool for a human owner/reviewer. It should optimize for:

- seeing what needs attention without opening every specification;
- distinguishing **requires my attention** from **ready if I want to start/continue**;
- reaching the relevant context with one interaction;
- making the actual decision with the next deliberate interaction;
- showing deterministic evidence without forcing the human to understand backend storage or provider protocols.

Use these evidence labels while this document evolves:

- **Current contract** - already authoritative in the new SpecFlow repository.
- **Legacy deterministic evidence** - implemented in legacy Nevo deterministic flow and worth evaluating during migration.
- **Product direction** - agreed direction for the new UI.
- **Future candidate** - preserve the idea, do not implement yet.
- **Open question** - ask instead of guessing.

Legacy Nevo mixes old lifecycle concepts with deterministic flow. A legacy field or status is not
automatically a new SpecFlow requirement.

---

## 2. Top-level product scope

### Project

**Product direction**

Project is the scope above normal product screens.

Candidate persistent navigation:

~~~text
Nevo SpecFlow

[ Current project v ]

Specs

----------------

Project settings
~~~

Changing project should reload all project-scoped product context. Selected spec/task, floating
session, contextual inspector, action state, and file preview should not silently leak across
projects.

Multi-project selection is not implemented yet, but the navigation model should reserve this place.

### Keep the sidebar small

Do not promote Session, Workflow, Gate, Tool, Handover, or another backend noun into top-level
navigation without an independent human use case.

For MVP the candidate top-level areas are:

- **Specs**
- **Project settings**

A full Session may have a route without having a sidebar entry.

---

## 3. Specs collection

**Product direction**

Specs are the primary work inventory.

The collection should answer, before drill-down:

1. **What requires my attention?**
2. **What is ready for me to start or continue, but does not currently require me?**

These are separate categories.

Candidate collection views:

- Active
- Archive

Whether those are tabs, filters, or route segments is a later screen decision.

Useful human-facing projections may include:

- spec identity/title;
- active/archive collection;
- workflow position and semantic phase;
- requires-attention state;
- ready action;
- running AI work;
- task progress;
- blocker/error;
- review/approval state;
- last activity;
- relevant change/source-control summary.

The UI should consume canonical Runtime/application projections for readiness and attention rather
than infer them independently.

---

## 4. Specification

**Product direction**

Specification is a main workspace context.

It owns or contextualizes:

- specification documents;
- tasks;
- specification-level workflow state;
- sessions associated with the spec;
- reviews/verification;
- source-control/change context;
- artifacts/evidence produced while progressing the specification.

### Specification workflow

A Specification is expected to progress through deterministic workflow in a way similar to Tasks.

This is a product/migration requirement, not yet a frozen persistence contract.

The UI eventually needs to project:

- current step;
- runtime step state;
- semantic status;
- readiness/blockers;
- human-required gate/decision;
- available next action;
- useful transition/history evidence.

Do not assume spec workflow persistence must copy legacy Task workflow_progress byte-for-byte.

### Workspace relationship

Candidate:

~~~text
PRIMARY
Specification

SECONDARY
Task details
~~~

A Task is normally inspected without abandoning the Specification context.

An internal right-hand column that is always part of the Specification composition is not
automatically workspace Secondary.

---

## 5. Task

**Product direction**

Task is the primary contextual detail opened from a Specification, normally as workspace Secondary
on wide layouts and pushed detail on narrow layouts.

At this broad inventory level, Task needs to expose:

- identity and human-readable workflow meaning;
- requires-attention vs ready-to-act vs current-work distinctions;
- dependencies/blockers;
- current execution only when authoritative execution scope proves the Task is part of the current execution scope;
- contextual/historical Sessions separately from current execution;
- evidence such as review, Handover, changes, and verification;
- deterministic actions with their own readiness/reason.

Legacy Nevo exposes useful migration evidence such as Task id/title/order, document reference,
dependencies, workflow progress, semantic status, and Session associations, but also carries older
lifecycle/stage fields that must not be treated as the new UI contract by default.

The detailed property classification, review flows, per-action readiness, Session execution semantics,
and Task evidence hierarchy are owned by
[Specification and Task information hierarchy](spec-task-information-hierarchy.md).

---

## 6. Ready vs requires attention

### Requires attention

The product is waiting for a human input/decision or there is a condition the human must resolve.

Examples:

- spec/task waiting for review or approval;
- AI interaction/question waiting for response;
- workflow human gate;
- deterministic operation blocked until owner resolution.

This deserves strong visibility in overview/navigation summaries.

### Ready

An action is available and prerequisites are satisfied, but the system is not blocked waiting for
the human.

Examples:

- workflow step ready to start;
- task ready for execution;
- finalize/start action available after checks pass.

Ready should be convenient and visible, but should not look like an alert.

### Deterministic evidence

Current Session architecture already requires Runtime-owned readiness/attention projections.

Legacy deterministic workflow action inspection exposes concepts such as:

- ready;
- requiredInputs;
- factual context;
- human-readable summary;
- details.

Readiness is **operation-specific**, not one universal boolean attached to a Task. Agent admission,
workflow-step activation, a human decision, remediation, and finalize may legitimately have different
readiness/blocker results at the same moment.

The application may expose a concise Task/Spec summary, but it must preserve the authoritative
readiness of each concrete action. A Task must not become globally "blocked" merely because one
operation is blocked while another valid operation can remediate or continue the work.

Detailed Spec/Task action hierarchy belongs in
[Specification and Task information hierarchy](spec-task-information-hierarchy.md).

---

## 7. Workflow configuration vs runtime

### Configuration

Workflow definitions include concepts such as:

- steps;
- step purpose;
- expected work;
- hints;
- entry/exit gates;
- actions/finalize actions;
- transitions;
- terminal outcomes;
- source-control behavior.

**Product direction:** workflow configuration belongs under Project settings, not as top-level
Workflows navigation.

Candidate:

~~~text
Project settings
'-- Workflows
    |-- definitions
    |-- steps
    |-- semantic statuses
    |-- gates
    |-- actions
    '-- transitions/source-control behavior
~~~

Initial UI may be read-only.

### Runtime

Concrete workflow execution belongs to the object being progressed:

- Specification workflow -> Specification;
- Task workflow -> Task.

Current deterministic gate types observed in legacy deterministic flow include command, markdown,
and human. The normal UI should present the gate meaning/result, not force users to understand the
implementation type unless they inspect configuration/technical detail.

---

## 8. AI Session

### Ownership and navigation

**Product direction**

Today Sessions are spec-driven and attached to a Specification. There is no proven MVP use case for
top-level Sessions navigation.

Session is reachable from Spec/Task context and may have a full route/full-screen workspace.

Clicking a Session from a Task should open a floating conversation:

~~~text
Task
  -> Floating Session
      -> Open full session
          -> Full Session workspace
~~~

Do not make the same Session a nested Task Secondary and then again the same layout as a full
primary screen.

Independent/ad-hoc Sessions remain a future candidate.

### Current canonical model

Current SpecFlow architecture defines:

~~~text
Session
'-- Turn
    '-- ordered Work
        '-- ToolAction
~~~

Runtime owns semantic projections such as current activity, requires-attention, summarized status,
and readiness. UI should consume those projections, not derive them from raw provider events.

Legacy canonical Session payloads also provide migration evidence for:

- application Session identity;
- provider/provider Session identity;
- status/readiness;
- mode/capabilities;
- specId;
- taskId/taskIds;
- execution scope;
- agent role/profile;
- title;
- creation/last activity;
- Turns;
- current Work summary.

The exact legacy DTO is not a target contract.

### Session association is not current execution

**Legacy deterministic evidence / migration invariant**

A Session can retain contextual/history relationships with Tasks without executing any of them in
the current Turn.

~~~text
Session association / taskIds / history
!=
current Turn execution identity
~~~

For deterministic execution, current Task execution must come from explicit current execution intent.
A generic/spec-level Turn may legally happen in a Session that previously touched one or more Tasks.

Consequences for UI:

- do not show "Agent working on TASK-03" merely because TASK-03 is linked in Session history;
- use a canonical live/current execution projection for "working on" language;
- moving a Task to a human-owned workflow step does not make the whole Session unusable for generic
  conversation or unrelated allowed work.

### Multi-task execution

**Legacy deterministic evidence**

One Session may execute a single Task or a Task batch. The UI must not invent a representative
"primary Task" for a batch merely to simplify presentation.

A useful relationship inventory is:

~~~text
spec-level / generic Session
contextually related to one or more Tasks
current single-Task execution
current Task-batch execution
~~~

If a Session is opened from Task A but its current execution scope is A+B+C, the floating surface may
preserve A as entry context while the Full Session must clearly expose the complete execution scope.

### Terminal Turn is not terminal Task

**Legacy deterministic evidence / product direction**

A Turn or provider operation can be terminal while more legal deterministic work remains. This can
happen while a workflow attempt is active, before an attempt is activated during safe remediation,
or while an unfinished durable operation is safely replayable.

~~~text
Turn / execution settled
+ legal work remains
+ no ambiguous durable operation requires recovery
=> can continue / resume
~~~

This is different from both Task completion and recovery-required state.

~~~text
Turn settled
!=
Task completed
!=
workflow attempt completed
~~~

The UI therefore needs to distinguish "agent currently working", "can continue/resume", and
"recovery required". These are derived product projections, not new persisted workflow statuses.

---

## 9. Floating Session and Full Session

### Floating Session

Purpose: quick conversation access without abandoning current work.

Candidate content:

- recent conversation;
- current activity;
- pending human interaction;
- composer when allowed;
- explicit Open full session action.

Do not fit complete Work history, every task action, raw tool detail, or file browser into the
floating surface.

### Full Session primary

The main Session surface is a human-readable work stream:

- user messages;
- assistant/final answers;
- Commentary;
- compact semantic Work summaries in chronology;
- current activity;
- pending interactions;
- composer.

Commentary is especially useful because it gives the human narrative. It cannot be assumed to exist
for every provider/agent, so the fallback is canonical current-activity/Work summaries, never
fabricated Commentary.

### Full Session Secondary

Secondary is a contextual inspector, not a permanently hard-wired Work panel.

Candidate modes:

- **Context** - spec/task relationships, current/related tasks, human actions, handovers, artifacts;
- **Work** - chronological Work history and technical inspection;
- **File** - code/file preview;
- another selected product detail that directly supports the Session.

Current activity belongs in the primary experience. Full historical/technical Work is inspection.

On narrow/mobile Secondary is not visible side-by-side, so important inspector capabilities require
explicit actions from Primary. Critical "what do I need to do?" information must never exist only in
a desktop default Secondary.

---

## 10. Work information levels

Existing Session UX already defines:

- L1 Summary / Now;
- L2 Expanded Work;
- L3 Work details;
- L4 Action details.

Candidate mapping:

~~~text
Primary Session stream
|-- L1 current activity
|-- Commentary
|-- compact chronological Work summaries
'-- final answer

Secondary: Work
|-- L2 expanded history
|-- L3 work details
'-- L4 action/tool details
~~~

Raw tool input/output, command details, internal ids, and low-level diagnostics remain deep
inspection.

---

## 11. Files

Clicking a file reference from Session, Work, Task, review, or artifact should open the compact file
surface already described by the Developer Workspace idea.

A file inspector can require different geometry from a normal Context inspector:

- Context may be primary-dominant;
- File may be balanced or file-dominant;
- Full IDE is a separate page/tab/tool.

This is evidence that Secondary may eventually need a presentation/sizing hint instead of one fixed
split for every inspector kind.

On mobile the file surface becomes focused/pushed detail.

---

## 12. Artifacts and evidence

Human decisions can depend on evidence produced at different scopes:

- specification-authored artifacts;
- task artifacts;
- session/turn artifacts;
- workflow step/attempt artifacts;
- review reports;
- handovers;
- verification/gate evidence;
- source changes/diffs;
- future build/test/deploy artifacts.

Do not immediately flatten all of these into one generic Attachments bucket.

Candidate artifact presentation may eventually need:

- stable identity;
- kind/type;
- title;
- producer/source;
- owning context: spec/task/session/step/attempt where applicable;
- created time;
- current relevance;
- file/reference target;
- relation to a human decision/gate/transition;
- durable evidence vs transient runtime output.

This does **not** yet define a persistent Artifact entity.

### Review artifacts

**Legacy deterministic evidence + open migration question**

Legacy multi-task review proves that one review artifact may be relevant to multiple Tasks while
individual Task outcomes/verdicts remain distinct. The new model must therefore not assume a strict
one-report-to-one-Task ownership shape.

Still determine the canonical new-model references: Spec, one or more Tasks, workflow step/attempt,
AI Session, or multiple references.

### Handover

**Open question / product direction:** Handover is useful human context, not merely a low-level Work
event.

The product should eventually answer:

- who/what is handing work over;
- what was completed;
- what remains;
- what evidence/context was passed;
- what the recipient is expected to do.

Canonical handover storage/properties still need explicit inventory.

### Changes/diffs

For initial Task review, showing all relevant current changes is acceptable when precise attribution
does not exist.

Future refinement can scope the default diff to the handover/review boundary presented to the human.

Do not block first UI on perfect provenance, but preserve enough identity to improve it later.

---

## 13. Project settings

Candidate read-only-first sections:

### General

- project identity;
- workspace/repository root facts;
- future project-switch metadata.

### Configuration

- project configuration YAML;
- local configuration YAML;
- resolved/effective configuration when available;
- future source-of-effective-value indication.

### AI / agents

Project settings own **defaults and policy**, for example:

- default provider/model/mode where the project defines them;
- provider availability/configuration;
- agent/profile definitions;
- execution policy/capability defaults.

Runtime execution choice is separate. Legacy batch reservation evidence freezes an effective
execution snapshot including provider, model, mode, and context capacity for that concrete
execution. Those choices belong to the contextual start flow (possibly under advanced options), not
only to Settings.

`effort` is currently a per-Turn option in the legacy contract and is not assumed to be part of the
frozen execution snapshot. The UI should present the effective execution configuration that the
authoritative runtime actually reserved, rather than generalizing all Turn options into frozen
execution policy.

For human-facing context, prefer the agent role/profile (for example Implementer, UI Implementer,
Reviewer, Spec Writer) over provider/model identity. Provider/model and per-Turn options such as
effort are usually execution details unless the user is choosing or diagnosing them.

### Workflows

- definitions;
- steps;
- semantic statuses;
- gates;
- actions;
- transitions;
- source-control behavior.

### Repository / Git

Configuration:

- repository URL/remotes;
- local path/worktree root;
- default branch;
- source-control settings.

Operational state such as current branch, dirty state, changes, or active PR belongs in the current
work context too, not only Settings.

### Integrations

- GitHub;
- GitLab;
- future integrations.

### Tools - future

Possible future tools:

- run tests;
- run build;
- start/stop server;
- lint/format;
- deployment;
- custom actions.

Tool **configuration** may belong in Settings. Tool **execution** is an action from relevant work
context.

A top-level Runs/Deployments area should appear only if execution history/logs/artifacts become an
independent human task.

---

## 14. Activity / audit trail

**Legacy deterministic evidence**

Activity is a cross-cutting evidence/history concept rather than workflow authority.

Useful Activity facts include:

- actor (user, agent-session, system);
- Spec scope;
- optional Task scope;
- causal/initiating context;
- occurrence time.

Potential UI uses:

- last meaningful activity on Specs overview;
- recent "who changed what" context in Specification/Task;
- deeper audit/history;
- causal context around resume/handover.

Activity must not become a second workflow state machine or a top-level navigation area merely because
it exists as a runtime/domain record.

---

## 15. Configuration, runtime state, and action are separate

~~~text
CONFIGURATION
How should it work?
-> Project settings

RUNTIME STATE
What is happening / where are we now?
-> Spec / Task / Session / current work context

ACTION
What can I do now?
-> contextual button/menu/command
~~~

Examples:

~~~text
Workflow definition            -> Settings
Current workflow step          -> Spec/Task
Start / approve / finish       -> Action

GitHub integration/repo URL    -> Settings
Current branch/current diff    -> work context
Commit/push                    -> Action

Test command configuration     -> Settings
Tests currently running        -> Work/current activity
Run tests                      -> Action
~~~

---

## 16. Candidate navigation depth

This is product hierarchy, not a final router definition.

~~~text
Project
|
|-- Specs collection
|   '-- Specification
|       |-- Task                         workspace Secondary
|       |   '-- Session                  floating conversation
|       |       '-- Open full session    main Session workspace
|       |
|       |-- Sessions                     inline/local list; not top-level nav
|       |-- workflow runtime             inline/local spec state
|       '-- artifacts/evidence           context-dependent
|
|-- Full Session
|   |-- Context                          Secondary/inspector
|   |-- Work                             Secondary/inspector
|   '-- File                             Secondary/inspector, file-dominant
|
'-- Project settings
    |-- Configuration
    |-- AI / agents
    |-- Workflows
    |-- Repository / Git
    '-- Integrations
~~~

---

## 17. Human-attention interaction target

Preferred steering loop:

~~~text
Project / Specs overview
    |
    v
I can immediately distinguish:
  A. requires my attention
  B. ready to start/continue
    |
    v
1 click on the item
    |
    v
context + evidence + why this action exists
    |
    v
2nd deliberate interaction
    |
    v
deterministic decision/action
~~~

A Task waiting for review should let the user open Task detail and immediately see:

- goal/requirements;
- current workflow step;
- transition/gate reason;
- relevant review/handover artifact;
- linked Session access;
- relevant changes;
- blockers/verification;
- deterministic review action.

The overview must not require multiple screens just to discover which object is waiting for the
owner.

---

## 18. Open questions before screen layout

Do not guess these during visual design:

1. **Specification workflow persistence** - generic workflow subject shared with Task, or separate shape?
2. **Task lifecycle migration** - which legacy Task status values remain meaningful?
3. **Artifact ownership** - canonical links for review reports and generated artifacts?
4. **Handover contract** - identity, ownership, properties, relation to workflow/session/task?
5. **Human actions/outcomes** - exact decisions each human gate can request?
6. **Diff provenance** - what can currently be attributed to Task/Session/Handover vs only worktree/change?
7. **Active vs Archive** - product state, storage detail, or both after migration?
8. **Configuration precedence** - exact project/local/default precedence for effective values?
9. **Session independence** - keep spec-owned for MVP unless a concrete ad-hoc use case appears.
10. **Execution projections** - decide the new canonical shape for current single/batch execution
    scope without confusing it with historical Session associations.
11. **Resume/remediation** - define the stable application projection for "ready to resume/continue"
    across pre-attempt remediation, active attempts, and safely replayable unfinished operations,
    while keeping recovery-required distinct and avoiding invented lifecycle statuses.
12. **Tools/runs** - defer top-level navigation until execution history is a real product need.

---

## 19. Next pass

The Specification + Task information hierarchy and first screen-structure pass are now captured under
this idea package.

Next, apply the same information-depth and screen-structure analysis to **Full Session**, because it
exercises the other major interaction family: conversation/Commentary, current activity, floating
Session, Context/Work/File Secondary modes, batch execution, and deep technical inspection.

Do not freeze a global component inventory until both Specification/Task and Full Session structures
have been exercised.
