---
id: architecture.workflow.workflow-continuation-and-attention
type: architecture
title: Workflow continuation and owner attention
status: current
scope: specflow
areas: [workflow, runtime]
read_when:
  - changing automatic continuation and agent launch selection
  - reviewing Tasks-stuck, escalation, owner attention or no-continuation outcomes
summary: >-
  Pure continuation decisions, session reuse/fresh launch, Task attention and human handoff outcomes.
related:
  - architecture.workflow.workflow-kernel
  - architecture.workflow.workflow-definitions-and-gates
  - architecture.workflow.workflow-runs-and-handoffs
  - architecture.workflow.workflow-tasks
---

# Workflow continuation and attention

## Continuation and attention

After every finish or return, `resolveContinuation` (a pure function) decides one of:

- `continue {step, launch}`, where `launch` is `{archetype, provider, model, effort?, session: fresh |
reuse(sessionId)}`;
- `attention {step, reason, …}`;
- `none` (the run is terminal, waiting for Tasks, or the Task is not `ready` after its finish:
  `on-hold`).

How a launch is resolved:

- **`session: reuse`.** The provider is the provider of the finishing Session, taken from trusted
  executor context. The model is the archetype's model for that provider.
- **`session: fresh`.** The provider is the archetype's `preferredProvider`, with its model.

Only an `auto` transition whose launch resolves gives `continue`. Otherwise the result is attention.
An unresolved launch is reported under its own reason (`model-missing`, …) only when an agent
finished the previous attempt; after a person's attempt (always the case while agent Sessions are
off) agent configuration is not the owner's problem, so it is `owner-action` with that reason as its
`blocker`. The reasons are:

| Reason                | When                                                                          |
| --------------------- | ----------------------------------------------------------------------------- |
| `owner-action`        | The transition is `owner-action`. Also adds `suggestion` and/or `blocker`.    |
| `human-step`          | The next step is done by a person.                                            |
| `model-missing`       | The provider to use has no model in the archetype.                            |
| `provider-not-chosen` | A fresh Session is needed and the archetype has no preferred provider.        |
| `session-unavailable` | The transition reuses the Session, but the finishing agent reported none.     |
| `archetype-missing`   | The step's archetype is not defined, or its file is invalid.                  |
| `tasks-stuck`         | The Specification waits, but no open Task can progress without the owner.     |
| `task-escalated`      | Tasks escalated, no declared transition (`taskIds`). Wins over `tasks-stuck`. |

`tasks-stuck` always names the Tasks to resolve (`taskIds`, with `blocking: [{taskId, cause}]`,
`blockingTasks` in `tasks/tasks.ts`): each draft, each Task on hold, each broken Task, and each
`ready` Task with a direct dependency that was cancelled or ended without completing. A Task that
only waits for other open Tasks is not named, nor one whose only unsatisfiable dependencies are
broken (the broken Task is named). Reads derive the list from the current state. When every Task is
closed and the wait is still active, inspection offers `reevaluate-wait` for the current attempt.

Attention is never a question to the agent. The agent's finish succeeds, and the finish (or return)
returns its `ContinuationDecision`.

**Attention items.** Besides the continuation reasons, an attention item (`AttentionItem`,
`attention/model.ts`) can come from the state of a subject:

| Reason                     | When                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `task-broken`              | A broken Task (see "The Task set").                                                                |
| `definition-changed`       | A run that has not ended (a Task's only while `ready`) is pinned to a missing or changed workflow. |
| `on-hold-blocking`         | A Task on hold (not escalated) that an open Task waits on, or that keeps the step from finishing.  |
| `task-escalated` (Task)    | An escalated Task that no Specification item names nor work step decides (see "Held Tasks").       |
| `context-unresolved`       | An approved Task that has not started has a required entry that is stale.                          |
| `dependency-unsatisfiable` | It depends on a Task that was cancelled, ended otherwise or is broken.                             |
| `type-not-allowed`         | Its task type is not allowed by the effective policy any more.                                     |
| `definition-missing`       | Its task type or that type's workflow is not defined.                                              |
| `entry-gate-unsatisfied`   | An entry gate of its first step does not hold, and no dependency it waits for can still complete.  |

Every item carries the required `actor` (`owner`: neither the steps nor the gates the Engine
derives items from name another actor; `agent` is reserved), the primary `action` it offers and an
optional `secondaryAction` (`start-step`, `return-to-step`, `configure-archetype`, `review-tasks`,
`restore-task`, `confirm-definition`, `edit-context`, `edit-dependencies`,
`open-project-settings`, `cancel-task`, `resume-task`, `satisfy-gate`, `reevaluate-wait`), the step and its title where one
resolves, and a display-only English `message`. A type no longer allowed or not defined offers
`open-project-settings` or `cancel-task`; an unsatisfiable dependency `edit-dependencies` or
`cancel-task`, and `restore-task` (or `edit-dependencies`) when a dependency is broken. An unmet
entry gate is attention only once no dependency the Task waits for can still complete, since a
dependency may deliver the document. The start blockers that are **not** attention : a draft or a
Task on hold (`status`; the Specification's `tasks-stuck` covers them when nothing else can
progress, and a hold that holds up progress has its own item, see "Held Tasks"), dependencies that
can all still complete, an awaited process artifact (`context-awaited`), and a Task that can start.
Attention is never inferred from a status name.

**Held Tasks.** Requires attention means the user must act; being on
hold alone is never enough. A Task on hold gets an item only while the user has to resume or
cancel it, decided by `heldTaskAttention` (`operations/attention.ts`), at most one per Task, in this
order:

1. A Specification item already names it (`task-escalated` on the wait step, or `tasks-stuck` where
   it is the bottleneck): no Task item.
2. It escalated (`statusChange.source: escalation`): no Task item while the Specification is at a
   work step (`ready` or `active`). That step decides it: its context lists every Task
   (`existingTasks`) and its finish takes `taskDecisions`, as after the seed's `task-escalated`
   transition back to `breakdown` (the Specification's own item then asks the owner to start it).
   Someone else acts there, and a Task item would invite a race between a Resume and the step's
   decision. Otherwise (the Specification has not started, or its pinned workflow changed)
   `task-escalated` on the Task; the escalation feedback is its hold reason.
3. Otherwise `on-hold-blocking` with `blocks` (never empty: `taskIds` with at least one id, or
   `finish`, or both): `taskIds`, the open Tasks that wait
   on it directly (their readiness names it in `waitingFor`, the `dependencyWait` fact), in id
   order; `finish`, the Specification's active work step whose transition to `terminal completed`
   it refuses (`tasksOpenAtCompletion`, the projection's `unavailable: tasks-open` with cause
   `on-hold`), with that step as the item's `step` and `stepTitle`. Close needs the completed
   outcome, so this also covers Close.
4. Otherwise, a hold that nothing waits on and that blocks no finish while other work can move: no
   item (the Now wait line still counts it as on hold).

On a wait step an escalation wins (`waitDecision` in `operations/advance.ts`): while any Task is
escalated the Specification's item is `task-escalated` naming only the escalated Tasks, never
`tasks-stuck`. So a person's hold that is the bottleneck but has no dependents gets no item (rule 1
needs `tasks-stuck` to name it, rule 3 finds nothing it holds up) until the escalation is resolved;
then `tasks-stuck` names it again.

Each of these items offers `resume-task` (`on-hold → ready`) and `cancel-task` as the alternative.
The surfaces render the item; they never decide from the status whether a hold is attention.

**Attention is derived, never stored.** `inspectExecution` computes the attention items
(`deriveAttention` in `operations/attention.ts`) from the canonical runs, the pinned definitions and
the current archetypes, with the same functions the operations use for their results
(`continuationOf`, `waitDecision` in `operations/advance.ts`):

- a broken Task gets `task-broken` (broken Tasks come first, then the Specification, then its
  Tasks in id order);
- a subject `ready` on a step gets what its latest event decides: after a finished attempt, the
  recorded transition (from that attempt's step) with the executor that finished it (`finishedBy`,
  the Session a `reuse` continues); after an owner return, an owner action;
- a Specification active on its wait step gets `task-escalated` or `tasks-stuck` when Tasks block it.
  When all Tasks are closed, it gets `wait-ready-to-settle` with its wait attempt, or
  `wait-transition-missing` if the workflow has no `tasks-finished` transition;
- a Task on hold that the user has to resume or cancel gets `task-escalated` or `on-hold-blocking`
  (see "Held Tasks");
- a run that has not ended whose pinned workflow is missing or changed gets `definition-changed`
  (its inspection entry carries `definitionChanged: true`; re-pinning is F07);
- nothing is derived for a subject that is active (being worked on), not started or terminal, or
  for a Task that is neither `ready` nor such a hold.

The start blockers of a Task that has not started are read with the documents (context, gates), so
the action projection classifies them (`startBlockerAttention`). There is one list:
`inspectExecution` (and `readExecution`'s inspection, whichever Tasks it projects) projects every
approved Task that has not started and returns the derived items with those start-blocker items as
`attention`; `inspectActions` carries the subject's own item as `attention`.

**Neutral Task facts.** `readExecution` also returns the `TaskFacts` of each projected Task:
`preparation`, `escalated`, the run `position`, `startable` (the projection finds no start
blocker), `startBlockers`, `dependencyWait` (`waitingFor`, `unsatisfiable`), `definitionChanged`
and `attention`. They hold no presentation concept (no group, label, order or lane): a dashboard
grouping is a presentation of these facts owned by a surface (the Runtime's is described in
[Task reads](../runtime/task-read-pagination-and-grouping.md#task-list-and-runtime-grouping)), and the CLI and MCP read them
without any grouping. A broken Task has `BrokenTaskFacts` (`broken`: its id, its manifest's title
when readable, the broken reason). `TaskProgress` counts `completed` of `total` (cancelled Tasks
and those ended without completing left out; broken and on hold ones counted) and names
`cancelled`, `ended` (abandoned by its own workflow, not cancelled) and `onHold` apart.

So there is at most one item per subject, and **any start removes it** by construction, whether the
start comes from a quick screen, a manual start or an automatic continuation. Whatever changes the
runs (an operation, a branch switch, a pull), inspection shows the attention of the current
position, and a model chosen in an archetype afterwards changes it too. `inspectExecution` runs
inside the same serialization as the mutations, so it never sees a change half-applied.

"Remember my choice" is `rememberArchetypeModel`: it writes the model, and optionally the preferred
provider, into the agent archetype file, keeping its comments. Its read-edit-write runs under the
project control lock. `openWorkflow` returns a snapshot of the
definition catalogue: after a definition edit, including `rememberArchetypeModel`, call `openWorkflow`
again to see it.

The Engine only decides. Starting or continuing a Session from a `continue` decision is the Runtime's
job (plan 06, F01).

### Tasks are started by the owner

A Task has no previous step, so no transition decides how it continues. A Task never starts and never
gets attention just because it is ready: a continuation is derived for a Task only once one of its
own steps finished or returned, and before its first start only a start blocker a person has to fix
is attention (above). The owner starts Tasks. The intended model (plan 06,
"Run selected Tasks") is that the owner selects Tasks and presses "run", and the Runtime orchestrator
runs that selection with agents in dependency order, recording attention only when the run cannot
proceed.
