---
id: architecture.workflow.workflow-kernel
type: architecture
title: 'Workflow kernel: Specification and Task execution'
status: current
scope: specflow
areas: [workflow, runtime]
read_when:
  - choosing the authoritative workflow contract for a Specification or Task
  - changing neutral workflow extension points or host integration
summary: >-
  Entry point to the neutral workflow coordinator and Engine-owned definitions, Runs, Task resources, agent attempts, continuation and durable storage.
related:
  - architecture.workflow.workflow-definitions-and-gates
  - architecture.workflow.workflow-runs-and-handoffs
  - architecture.workflow.workflow-tasks
  - architecture.workflow.workflow-continuation-and-attention
  - architecture.workflow.workflow-storage-and-recovery
  - architecture.workflow.workflow-agent-attempts
  - architecture.workflow.deterministic-workflow
  - adr.0023-neutral-workflow-coordinator-and-manual-execution
---

# Workflow kernel

The neutral `@nevo/workflow` coordinator decides transitions. The Engine's SpecFlow adapter owns definitions, authority, effects, persistence and recovery. Runtime/CLI/UI invoke those operations; they are not alternative workflow engines.

| Question                                      | Authoritative contract                                               |
| --------------------------------------------- | -------------------------------------------------------------------- |
| Definitions, executor trust, entry/exit gates | [Definitions and gates](workflow-definitions-and-gates.md)           |
| Run position, attempt, owner return or wait   | [Runs and handoffs](workflow-runs-and-handoffs.md)                   |
| Task identity, preparation or completion      | [Task resources](workflow-tasks.md)                                  |
| Automatic continuation and attention          | [Continuation and attention](workflow-continuation-and-attention.md) |
| Persisted Run, journals and crash replay      | [Storage and recovery](workflow-storage-and-recovery.md)             |
| Agent attempts, owner confirmation, commit    | [Agent attempts](workflow-agent-attempts.md)                         |

## One core, two entry points

The core is subject-neutral. A **subject** is either the Specification or one of its Tasks:

```text
startSpecificationExecution(specId, archetype, actor) ─┐
startTaskExecution(specId, taskId, actor)              ─┴─▶ start(subject) ─▶ decide(start)
finishStep(subject, step, attempt, input, actor)         ─▶ decide(finish) ─▶ Tasks, decisions, effects, escalation ─▶ continuation
returnToStep(subject, step, feedback, owner)             ─▶ decide(return) ─▶ effects ─▶ continuation
setTaskStatus(specId, taskId, status, reason, owner)     ─▶ decision ─▶ settle the Specification (decide(event))
createTask / editTask / removeTask (owner)               ─▶ Task resource change
abandonSpecification(specId, reason, owner)              ─▶ every open run abandoned, open Tasks cancelled
inspectExecution(specId) / readExecution / inspectActions ─▶ read-only views, broken Tasks, facts, derived attention
```

`decide(definition, run, command)` is the coordinator: for `start`, `finish`, `event` (a wait step's
trigger) and `return` it checks the pin and the replayed history, chooses the legal step or
transition, and returns the next run, an intent (`execute`, `ready` with its continuation,
`await-event` with the triggers, `terminal`) and the declared effects with their host annotations. The
core never sees whose run it is: the adapter keeps a run per Specification and per Task and hands the
core the run value.

The entry points differ in only two ways:

- **Starting a Specification** creates the Specification run the first time. It reads the execution
  binding of the Specification archetype, pins that workflow and snapshots its `taskTypes`.
- **Starting a Task** checks that the Task is ready: its status is `ready`, and every dependency
  completed (see "Tasks"). Its first start creates its run record (see "First start").

Everything else is shared.

## Extension points

| To add                        | Change                                                                                                                                                                                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Task effect                 | Add a value to `WORKFLOW_EFFECTS` (contracts), a case to `applyTaskEffects` and its authority to `EFFECT_AUTHORITY` (`definitions/effect-authority.ts`).                                                                                                                                     |
| A Task status change          | Extend `ALLOWED_DECISIONS` in `tasks/tasks.ts`; the store invariants for statuses live in `state/validate.ts`.                                                                                                                                                                               |
| An attention reason           | A continuation reason: add it to `ATTENTION_REASONS` and give `resolveAgentLaunch` / `resolveContinuation` (or `waitDecision`) the rule that produces it. A state reason: add it to `ATTENTION_ITEM_REASONS` with its action, and derive it in `deriveAttention` or `startBlockerAttention`. |
| A step kind (e.g. gate)       | Add a union member in the contracts schema and in `definitions/model.ts`, then a rule in `workflow-rules.ts` and handling in `progression` and `advance`.                                                                                                                                    |
| A gate type (`command`, …)    | Add a variant to the gate schemas (contracts), a type to `DocumentGate`'s union and an evaluator in `workflow/gates/` (F03); the check points stay.                                                                                                                                          |
| A post action                 | Add it to `operations/post-actions.ts`; post actions run after a finish is recorded (also on a replay).                                                                                                                                                                                      |
| A store                       | Implement the `WorkflowStore` port (`state/store.ts`).                                                                                                                                                                                                                                       |
| A host other than SpecFlow    | Use `@nevo/workflow` directly: keep runs under your own keys, call `decide`, store `nextRun` with your effects.                                                                                                                                                                              |
| A surface (Runtime, CLI, MCP) | Call the operations with `openWorkflow(engine)`. Never reimplement progression.                                                                                                                                                                                                              |
