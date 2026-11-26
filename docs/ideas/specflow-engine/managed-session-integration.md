---
id: ideas.specflow-engine.managed-session-integration
type: architecture
title: Managed Sessions and workflow execution integration
status: draft
scope: specflow
areas: [ai, runtime, workflow, security, testing]
tags: [sessions, turns, admission, handover, crash-recovery]
read_when:
  - driving workflow steps from managed Sessions
  - binding a Session or Turn to a workflow attempt
  - designing batch, handover, rebind or multi-instance behaviour for managed execution
  - letting the owner choose or remember the agent of a workflow step
summary: >
  Open proposals for connecting managed Sessions to the workflow kernel: attempt association,
  readiness before dispatch, workflow finish from a Session, batch and handover, native resume
  after rebind (S07), multi-instance runs, and an owner-chosen agent per step. Session storage and
  dispatch claims are implemented.
related:
  - ideas.specflow-engine
  - ideas.specflow-engine.execution-scopes
  - ideas.specflow-engine.workspace-binding-lifecycle
  - ideas.specflow-engine.local-actors
  - ideas.specflow-engine.plan-06
  - architecture.ai.canonical-session-turn-work
  - architecture.ai.session-storage-and-lifecycle
  - architecture.runtime.workspace-execution-claims
---

# Managed Sessions ↔ workflow integration

## What exists

Runtime Sessions owns canonical Session/Turn/Work lifecycle, provider invocation, transport,
interactions, streaming and cancellation
([Session/Turn/Work](../../architecture/ai/canonical-session-turn-work.md),
[storage and lifecycle](../../architecture/ai/session-storage-and-lifecycle.md)). A Session has at
most one home Specification and an append-only set of its Tasks (the association registry). Every
native agent process is admitted through an Engine
[workspace execution claim](../../architecture/runtime/workspace-execution-claims.md): the claim is
published before the Turn is dispatched, marked dispatched before the driver runs, and settled only
with a not-dispatched or native-result receipt. The Engine owns Specs, the workflow kernel and
durable mutation recovery. Neither layer delegates its authority to the other.

Not implemented: a Turn or Session bound to a workflow attempt, readiness checks before dispatch,
a workflow finish from a Session, and the continuation orchestrator (plan 06 F01, F02).

## Association with Specification, Task and attempt

| Identity             | Owner            | Meaning                                                                                      |
| -------------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| `sessionId`          | Runtime Sessions | Durable product conversation identity, independent of the native provider                    |
| `turnId`             | Runtime Sessions | One requested logical invocation                                                             |
| `invocationId`       | Runtime dispatch | One provider dispatch attempt; it is the claim's `operationId`                               |
| `workflowAttemptRef` | Engine Workflow  | Optional `(specId[, taskId], step, attempt)`, never inferred from historical Session binding |

The Session-to-Specification/Task association is context, not current execution: the attempt's
executor (`sessionId` on the attempt, see the kernel's "Executors") stays the only authority for
which Session may resume or finish a step. One Turn may be ad-hoc with no attempt; one attempt may
span several Turns. A Turn ending does not finish or advance the workflow.

## Readiness before dispatch

Before a Turn that works on a step is dispatched, Runtime asks the Engine to start (or resume) the
step with the trusted executor, so a Task that is not ready, a mismatched attempt or another
Session's attempt fails before any provider process runs. The workspace execution claim is then
admitted as today. A crash between the step start and the claim leaves an active attempt without a
process; the next start by the same Session resumes it.

## Workflow finish from a Session

- The agent signals completion through the product CLI or an MCP tool (plan 06 F02); executor
  identity comes from the Runtime environment or Session binding, never from tool arguments.
- `finishStep` is an explicit deterministic action, not a side effect of a terminal Turn or a
  handover. A terminal Turn may leave the attempt active, ready to resume, or waiting for a human.
- After the finish, the continuation decision may start the next step in the same or a new Session
  (ADR 0019); the Runtime records a durable launch intent per `(subject, step, attempt+1)`.
- A return by the owner ends the attempt as `returned`; Runtime must cancel a Session still working
  on it and ignore its late finish (plan 06 F13).

## Batch and handover

- **Batch:** one Session/Turn may own an explicit ordered set of Task attempts, but each Task keeps
  its own workflow identity, gates and evidence. The Engine controls per-Task admission and
  progression and never guesses a 'primary' Task from Session history (plan 06 F12).
- **Handover:** Runtime may create a new Session with predecessor/handoff context on explicit
  request or a declared `session: fresh` continuation. The new Session does not inherit a claim.
- **Cancellation:** cancelling a managed Turn is not proof that every tool side effect stopped; the
  claim stays unsettled while the outcome is ambiguous.

## Workspace rebind and native resume (S07)

Every new Turn resolves the current `workspaceId -> verified root` through the Engine. If the
workspace moved, disappeared or was rebound, the Turn must check provider-native resume
compatibility; never silently reuse the previous native session just because the provider
reference still exists. Today a registry change while a claim is held is already
`EXECUTION_RECOVERY_REQUIRED`.

## Multi-instance runs

The future association is `workflowAttempt -> instance slots -> execution runs -> optional Runtime
Session/Turn`; Sessions are not canonical workflow owners. Slots keep identity across retries, while
invocations have distinct fencing and recovery identity. A terminal Turn does not count as a
contribution. See [multi-instance execution](multi-instance-execution.md).

## Agent per step, chosen by the owner

**Today.** The agent of a step is the `archetype` of that step in the workflow the run is pinned to.
A Task's workflow comes from its task type (`implementation` runs `task-standard`, whose implement
step names `implementer`; `ui-implementation` runs `task-ui`, which names `implementer-ui`). The type
is chosen when the Task is created and does not change, and a Specification's run keeps the task
types its archetype allowed when the run started. In Run with agent the owner can change the
provider, model and effort for one attempt only. The agent itself cannot be changed, and nothing the
owner picks is saved. The Engine can already write a model into an agent archetype file
(`rememberArchetypeModel`), but no Runtime route or UI uses it.

**Gap (dogfood #189).** An Architecture Specification allowed only `implementation`, so its UI Tasks
ran as `implementer` without the frontend rules. The shipped Architecture archetype now also allows
`ui-implementation`. Runs that already started keep their task types, and their Tasks keep their
type.

**Minimal design (not decided).**

1. Run with agent shows the agent as a choice, preselected from the step. The list is the agent
   archetypes the step allows (the step's own `archetype` plus an optional `alternatives` list in the
   workflow step). The start request carries the chosen `archetype`, and the Engine checks it against
   that list.
2. "Remember this choice" in the dialog calls `rememberArchetypeModel` through a Runtime route. The
   provider and model are saved into the agent archetype file, which is project data committed with
   the next definitions commit.
3. A per-step override for the project goes in the workflow definition (the step's `archetype`), not
   in local settings, so every workstation runs the same agent.
4. Changing a Task's type, or a running Specification's allowed task types, is a separate decision.

## Tests

S03 terminal Turn without workflow finish; S04 multi-Task execution scope; S05 handover without
step advance; S07 moved/missing workspace before a new Turn; S08 scoped reads. See the
[test plan](test-plan.md).
