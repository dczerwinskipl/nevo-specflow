---
id: ideas.specflow-ui.information-navigation-inventory
type: product
title: SpecFlow UI information and navigation inventory
status: draft
scope: specflow
areas:
  - ui
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
  - migrating deterministic task/session/workflow data from the old `dczerwinskipl/nevo` repository
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
- **Old-repo deterministic evidence** - implemented in the deterministic flow of the old
  `dczerwinskipl/nevo` repository and worth evaluating during migration.
- **Product direction** - agreed direction for the new UI.
- **Future candidate** - preserve the idea, do not implement yet.
- **Open question** - ask instead of guessing.

The old `dczerwinskipl/nevo` repository contains both the pre-deterministic legacy flow and the
newer deterministic flow. Nevo SpecFlow migrates **only the deterministic workflow model**.

Generic old-repository infrastructure may still be useful migration evidence, but the old legacy
flow/lifecycle is not a product mode to preserve. The new UI must not expose a Legacy/Deterministic
toggle or treat workflow mode as a user-selectable Specification property.

A field/status from the old repository is therefore evidence only when its semantics still fit the
deterministic target model.

---

## 2. Top-level product scope

### Project

**Product direction**

Project is the scope above normal product screens.

Candidate persistent navigation:

```text
Nevo SpecFlow

[ Current project v ]

Specs

----------------

Project settings
```

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

The first distinction is semantic:

1. **Requires attention** — intended progress is waiting for human input/decision/intervention.
2. **Ready** — an operation is available if the human chooses to start it, but nothing is waiting on
   the human yet.
3. **Working / other active** — useful progress/state without demanding a decision.

A Specification should appear once in the canonical work queue. One dominant semantic group owns the
row. If meaningful concurrent state exists, the row may show at most one bounded aggregate qualifier
when omitting it would materially misrepresent what is happening; it does not expose raw signal
collections or duplicate the same Spec across stacked groups. Summary counters/tiles may count the
same Spec in several categories because they are aggregates, not navigation lists.

The canonical Specification row always opens the owning Specification. Ordinary status/reason prose
inside the overview row is non-interactive. Concrete Task/Session/evidence context becomes explicit
after entering the Specification, and an aggregate such as "3 Tasks require review" never guesses a
representative Task.

Candidate collection views remain Active and Archive.

Useful projections include identity/title, workflow meaning, attention, ready actions, current work,
progress, errors requiring intervention, last meaningful activity, and relevant external
change/release references.

### Create Specification

Creation is a required product flow, not merely a future placeholder.

Minimum flow:

- **title is the only required user field**; the application derives the slug/technical identity
  input rather than asking the user to type it;
- optional initial description/goal may be available through progressive disclosure and can stay
  collapsed by default;
- creating without AI produces the empty/scaffolded Specification and opens/returns to normal Spec
  context;
- the user may instead choose to create and immediately start an agent Session to initialize the
  Specification.

The "create + start agent" path must reuse the common Session-start interaction rather than own a
second prompt/composer implementation.

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

```text
PRIMARY
Specification

SECONDARY
Task details
```

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

The old `dczerwinskipl/nevo` repository exposes useful migration evidence such as Task id/title/order, document reference,
dependencies, workflow progress, semantic status, and Session associations, but also carries older
lifecycle/stage fields that must not be treated as the new UI contract by default.

The detailed property classification, review flows, per-action readiness, Session execution semantics,
and Task evidence hierarchy are owned by
[Specification and Task information hierarchy](spec-task-information-hierarchy.md).

---

## 6. Ready vs requires attention

### Requires attention

Use this only when intended progress is waiting for a human intervention.

High-value examples:

- a provider/agent question, permission, or confirmation waiting for response;
- review/approval/human workflow step waiting for a decision;
- a stopped/failed execution where authoritative state says the human must choose how to proceed;
- a deterministic condition that cannot make intended progress until owner resolution.

A live provider question is normally among the most urgent signals because an active Session is
waiting directly on the human.

A provider error/limit may qualify when authoritative runtime state can say that progress requires a
human choice. Do not invent a specific "switch agent" remedy unless the runtime actually supports and
classifies it.

### Ready

A specific operation is available and prerequisites are satisfied, but the system is **not** waiting
for the human.

Examples:

- workflow step ready to start;
- Task ready for execution;
- explicit continue action available.

The user may intentionally leave Ready work untouched. Ready is convenient/actionable, not an alert.

### Deterministic evidence

Readiness remains operation-specific. Agent admission, workflow activation, remediation, human
decision, continuation, and finalize can have different authoritative results at the same time.

The application may expose a concise Spec/Task summary, but it must preserve the authoritative
readiness/reason for each concrete action. A Task must not become globally "blocked" because one
operation is blocked while another legal operation can remediate or continue it.

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

```text
Project settings
'-- Workflows
    |-- definitions
    |-- steps
    |-- semantic statuses
    |-- gates
    |-- actions
    '-- transitions/source-control behavior
```

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

Sessions remain contextual to product work rather than earning top-level navigation by default, but
**New session** is a supported human-initiated action.

Opening an existing Session:

```text
Wide
  conversation target -> Floating Session
  Open full session    -> Full Session

Compact / Narrow
  conversation target -> Full Session
```

There is no floating/mobile substitute on Compact/Narrow.

Starting a Session uses one shared interaction regardless of whether the entry is generic New session,
Specification initialization, or a deterministic workflow action:

- choose agent/provider when choice is required;
- optionally expose additional execution choices without duplicating the composer;
- allocate canonical Nevo Session identity independently of provider-native identity;
- use backend/workflow-owned bootstrap/default prompts when the action defines them;
- use the normal Session composer for user-authored conversation.

### Current canonical model

```text
Session
'-- Turn
    '-- ordered Work
        '-- ToolAction
```

Runtime owns semantic projections such as current activity, requires-attention, summarized status,
and readiness. UI consumes those projections instead of deriving them from provider events.

Session summaries may expose provider, provider-native identity, role/archetype, batch/scope,
creation/last activity, status/readiness, and related Tasks when those facts exist. Role/archetype is
useful metadata, not proof that a particular workflow transition was completed.

### Session association is not current execution

Historical/contextual Task association must never be treated as current Turn execution identity.
Current work language comes only from authoritative execution scope.

### Multi-task execution

One Session may execute a single Task or a Task batch. Never invent one representative "primary
Task" for a batch.

### Task history

A Task can expose several related Sessions directly. Normal cases are expected to be small enough to
show multiple entries; the UI should show a useful bounded set (for example several recent/relevant
Sessions) and provide **Show all** when history becomes pathological.

Highlight an active/current Session independently of chronological ordering.

Where workflow/history evidence references the Session that performed a step/attempt, clicking that
Session reference opens the Session. A future additive turn anchor may open the exact Turn without
changing the surrounding UX.

### Terminal Turn is not terminal Task

A Turn/provider operation can be terminal while more legal deterministic work remains. Keep
"working", "continue/resume", Task completion, and recovery-required separate.

### Usage, cost, capacity, and limits — future candidate

Do not implement this in the first UI pass, but leave the Session information model extensible enough
to add it without redesigning the shell.

Possible future facts include:

- token/context usage and remaining capacity;
- provider/model usage or monetary cost when authoritative data exists;
- provider quota/limit state and reset information;
- per-Turn versus Session/project aggregate usage.

Default presentation should be low-emphasis Session metadata, most naturally in Context or a compact
header/detail disclosure. It becomes a Primary attention signal only when authoritative state says a
human decision is required to continue.

Project-wide usage/history may later earn its own operational/settings surface; do not reserve an
empty top-level screen now.

---

## 9. Floating Session and Full Session

### Floating Session

Floating Session is **Wide-only** quick conversation access. It contains recent conversation, current
activity, pending interaction, composer/response controls, and Open full session.

Do not fit complete Work history, Task detail, file tooling, or large evidence surfaces inside it.

### Full Session primary

The main Session surface is the human-readable work stream: user/assistant content, Commentary,
compact Work summaries, current activity, pending interaction, and composer.

Pending human interaction belongs in Primary so it works on every breakpoint. Prefer a clear inline
interaction plus persistent cue near the active conversation/composer over auto-switching Secondary.

### Full Session Secondary

Context is the default split-capable inspector. Explicit user clicks may replace it with Task,
Handover, artifact/review/verification, expanded Work/ToolAction, or future File preview.

There is no required permanent Context/Work tab pair. Normal agent activity never auto-navigates
Secondary.

On Narrow the same inspector/detail model becomes a pushed local stack.

---

## 10. Work information levels

Existing Session UX already defines:

- L1 Summary / Now;
- L2 Expanded Work;
- L3 Work details;
- L4 Action details.

Candidate mapping:

```text
Primary Session stream
|-- L1 current activity
|-- Commentary
|-- compact chronological Work summaries
'-- final answer

Secondary: Work
|-- L2 expanded history
|-- L3 work details
'-- L4 action/tool details
```

Raw tool input/output, command details, internal ids, and low-level diagnostics remain deep
inspection.

---

## 11. Files

File preview and Open in IDE are future capabilities. They are useful enough that references should
preserve stable file identity now, but the current product must not pretend the preview/editor exists.

When file inspection lands:

- clicking a file reference opens preview/detail in the same Secondary/local inspector slot;
- a separate Open in IDE action may escalate from preview;
- no third simultaneous pane is introduced.

Until then, omit unavailable actions rather than rendering dead affordances.

---

## 12. Artifacts and evidence

Artifacts/documents are primarily **readable evidence/resources**, not generic action-owning widgets.

The backend may return different document/artifact kinds without requiring a hard-coded frontend
registry for every business meaning. The UI needs stable identity, title/kind when meaningful,
producer/source, owning context/references, time/status/relevance, and a readable target.

If a document requires approval, rejection, or another decision, that mutation belongs to the
relevant Human Step/workflow action. The document is input/evidence for that action; it does not gain
generic Approve/Reject/Edit buttons merely because of its type.

Do not flatten every resource into one unstructured Attachments bucket.

### Review artifacts

One review artifact may relate to several Tasks while Task outcomes remain distinct. Preserve shared
references rather than cloning reports into fake one-to-one ownership.

### Handover

For normal deterministic workflow transitions, legacy behavior provides a concrete migration model:

- completing an agent-owned step transitions workflow state and the agent stops;
- no autonomous agent-to-agent continuation occurs;
- UI exposes the next ready operator action such as Start review / Start implementation;
- the operator may choose a new provider/Session or reuse a suitable existing conversation;
- previous transition data such as result/feedback/artifacts is supplied deterministically to the
  next StepContext.

UI handover/evidence therefore needs to make the transition context readable and make the next
workflow-owned action discoverable. It does not need to synthesize a full conversation handoff.

**Deferred:** ad-hoc handover after provider limit/error. Current failure classification and context
summarization are not sufficient to define a trustworthy "continue with another agent" UX, so do not
design that action yet.

### Changes/diffs

"Changes" is a product concept that may aggregate multiple sources: unstaged/uncommitted worktree
changes, diff to a base branch, and one or more linked pull/merge requests from GitHub/GitLab or other
integrations.

The UI should not bake the provider/source into the concept. A Task/Session/Spec can link to relevant
change sets while the underlying source remains explicit metadata.

Initial inspection may show all relevant current changes when precise attribution is unavailable.

---

## 13. Project settings

Candidate read-only-first sections:

### General

Project identity, workspace/repository root facts, future project-switch metadata.

### Configuration

Project/local/effective configuration and source-of-value where useful.

### AI / agents

Defaults/policy such as provider/model/mode, provider availability, archetypes/profiles and execution
policy. User customizations such as default prompts belong here when exposed; normal flows consume
backend-owned defaults rather than embedding editable prompt fields everywhere.

Provider/model/effort details remain secondary unless the user is choosing or diagnosing them.

### Workflows

Definitions, steps, semantic statuses, gates, actions, transitions, source-control behavior.

### Repository / Git

Repository/remotes/path/default branch and source-control configuration.

Operational branch/worktree/PR/change state is project/work context, not Settings-only data.

### Integrations

GitHub, GitLab, and future integrations.

### Tools / operations - future

Commands, tests/builds, terminal, deployments/releases, pipeline history, worktrees, and similar
capabilities are **project-level operational capabilities**, not owned by one Specification.

A Specification may still show relationships to those facts — for example linked PRs, merge/release
evidence, deployment status, or pipeline links — when they are relevant to that Spec.

Do not hard-code what "release" means. A project's workflow/integration may define it as a deployment,
pipeline result, merge to a branch, or another custom action.

The extension pattern is:

```text
contextual link/action from Spec/Task/Session
  -> project-level operational surface when deeper exploration is needed
```

Do not reserve empty top-level nav entries now. Promote a Runs/Deployments/Tools area only when the
capability becomes a real independent human task.

---

## 14. Activity / audit trail

**Old-repo deterministic evidence**

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

```text
CONFIGURATION
How should it work?
-> Project settings

RUNTIME STATE
What is happening / where are we now?
-> Spec / Task / Session / current work context

ACTION
What can I do now?
-> contextual button/menu/command
```

Examples:

```text
Workflow definition            -> Settings
Current workflow step          -> Spec/Task
Start / approve / finish       -> Action

GitHub integration/repo URL    -> Settings
Current branch/current diff    -> work context
Commit/push                    -> Action

Test command configuration     -> Settings
Tests currently running        -> Work/current activity
Run tests                      -> Action
```

---

## 16. Candidate navigation depth

This is product hierarchy, not a final router definition.

```text
Project
|
|-- Specs collection
|   '-- Specification
|       |-- Task                         local Secondary / pushed detail
|       |-- Sessions                     contextual references
|       |   '-- existing conversation    Floating only on Wide; otherwise Full Session
|       |-- workflow runtime             inline/local Spec state
|       '-- artifacts/evidence           context-dependent
|
|-- Full Session                         routable Primary
|   '-- local inspector
|       |-- Context                      default on split-capable entry
|       '-- Task / Handover / Work / future File / other detail
|
|-- future project operations            only when independently useful
|   '-- commands / deployments / pipelines / worktrees / terminal / ...
|
'-- Project settings
    |-- Configuration
    |-- AI / agents
    |-- Workflows
    |-- Repository / Git
    '-- Integrations
```

---

## 17. Human-attention interaction target

Preferred steering loop:

```text
Specs Overview
  -> scan one canonical Spec row per Spec
  -> row click opens Specification
  -> optional explicit issue/Task target can jump deeper
  -> inspect context/evidence
  -> deliberate workflow action
```

Do not silently redirect the neutral Spec row to a changing "most important" issue.

A Task waiting for review should expose goal/requirements, reason, relevant evidence, related Session
access, and deterministic review action once the user opens that Task context.

A live Session interaction is different: the question/permission/confirmation must be visible in the
Session conversation itself because it is time-sensitive and must work on Narrow. Additional detail
may open from an explicit action, but the UI should not automatically steal Secondary focus.

---

## 18. Open questions before screen layout

Do not guess these during implementation:

1. Specification workflow persistence shape.
2. Which legacy Task lifecycle values remain meaningful after migration.
3. Canonical new Runtime references for artifacts/review reports.
4. Exact new Runtime handover reference shape; normal transition behavior is known, ad-hoc
   provider-failure transfer remains deferred.
5. Exact human decisions each configured Human Step can request.
6. Diff/change provenance across worktree/base branch/PR/MR sources.
7. Active vs Archive persistence semantics.
8. Configuration precedence/source-of-effective-value.
9. Canonical current single/batch execution projection.
10. Stable application projection for continue/remediation/recovery.
11. Exact cost/usage/provider-limit presentation. Reserve extensible low-emphasis Session metadata /
    Context capacity so adding it later does not require redesigning the shell.
12. Exact future project-level Operations information architecture after commands/deployments/pipelines
    become implemented capabilities.

---

## 19. Next pass

The Specification + Task information hierarchy and first screen-structure pass are now captured under
this idea package.

Full Session is now exercised separately in
[Full Session screen structure](full-session-screen-structure.md), covering conversation/Commentary,
current activity, floating Session, Context/Work/File Secondary modes, batch execution, and deep
technical inspection.

That mapping is now captured in
[Design-system and composition gaps](design-system-component-composition-gaps.md).
