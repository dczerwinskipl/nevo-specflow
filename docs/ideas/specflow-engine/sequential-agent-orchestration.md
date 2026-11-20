---
id: ideas.specflow-engine.sequential-agent-orchestration
type: engineering
title: Explicit sequential agent automation after single-step delegation
status: draft
scope: specflow
areas: [workflow, runtime, ai, security, testing]
tags: [automation, continuation, batch, review, handoff, scheduler]
read_when:
  - planning "execute the whole Specification" after E6 is working
  - connecting automatic continuation and Task batches without another workflow engine
  - designing retry, model availability, quotas and owner-stop boundaries
summary: >
  Candidate orchestration layer after E6: optional automatic continuation between
  permitted steps and dependency-ordered Tasks, with fresh independent review,
  durable dispatch intents, budget controls and explicit human decision boundaries.
related:
  - ideas.specflow-engine
  - ideas.specflow-engine.agent-workflow-entrypoints
  - ideas.specflow-engine.reusable-workflow.agent-execution
  - ideas.specflow-engine.managed-session-integration
  - ideas.specflow-engine.plan-06
  - ideas.roadmap
---

# Sequential agent orchestration after E6

## Boundary

This is **not** another proposal to implement E6. E6 owns one explicitly
authorized agent attempt: context, trustworthy write/read tools, a finish
proposal, confirmed native stop, Engine transition and recovery.

Automation should only decide **whether and when to request another such
attempt**. The Engine remains the only authority for legal transitions,
Task readiness, dependencies, gates and human decisions. A Session/Turn
finishing is not evidence that a Workflow step finished.

Current roadmap mapping: P103/F01 automatic continuation; P104/F12
selected Task batches; P105/F03 executable verification and human gates;
future GitHub delivery remains T101/T102. This idea supplies the combined
user journey and acceptance, without changing those scopes or release targets.

## Two explicit automation modes

1. **Continue this subject:** after a successfully finished agent step,
   follow a declared `continuation: auto` transition only when the Engine
   resolves the next eligible step and the owner enabled this mode.
2. **Run selected Tasks:** process an explicit bounded set of approved/
   ready Tasks in dependency order, using each Task's own workflow and
   evidence. Wait on unresolved dependencies, review decisions and
   resource limits rather than guessing a next Task.

Neither mode starts from a vague "find useful work" prompt. Future scheduled
or recurring runs need a separate approval and policy, not a timer buried
inside a workflow definition.

## Example journey

`TASK-03 Implement` -> verified Finish -> independent `Review` in a fresh
Session -> `fail` with required feedback -> fresh eligible `Implement`
attempt with the exact handoff -> `Review` -> `pass` -> Task completed ->
next eligible Task. An owner-controlled Specification acceptance step remains
a real stop, not an agent self-approval.

## Orchestrator responsibilities

- Persist an idempotent launch intent for `subject + step + attempt` before
  native dispatch. Re-evaluate readiness and definition revision before each
  attempt, including after restart.
- Resolve `session: reuse|fresh` through the existing policy. Independent
  review always uses a **fresh Session**; a reuse preference cannot silently
  defeat that rule. Do not imply that a new Session requires a different model
  unless the configured policy demands one.
- Ask Engine for ready Tasks and dependency order. Do not maintain a second
  mutable queue of Task statuses or duplicate the Task DAG in Runtime.
- Stop when a human decision, unsatisfied gate, missing provider/model,
  exhausted budget/quota, uncertain native outcome, conflicting claim or
  material Specification change needs attention.
- Distinguish a transient provider error from a subscription/quota limit;
  unsupported recovery cannot re-dispatch a possibly executed Turn.
- Surface owner controls: start/stop after this attempt, current execution,
  queued eligible work, remaining scope, failure and recovery reason.
- Bound attempts, review/rework loops, execution count, context bytes and
  authorized cost or capacity policy. Never spin indefinitely after `fail`.

The orchestration layer may run inside Runtime but must use E6's authorized
single-attempt API, not reach into the Engine store or call ordinary owner
CLI mutations under a provider process.

## Delivery slices and acceptance

**Slice A: opt-in single-subject continuation.** One eligible transition,
start/resume/retry, fresh review, durable intent and restart tests. Stop at
the first owner-only step. Verify zero duplicate Turns after lost ACK.

**Slice B: bounded dependency-ordered Task selection.** Owner picks Tasks;
Engine determines legal order. Test linear chain, fork, dependency failure,
escalation, cancellation, pause, restart and a Task already completed
outside the orchestrator.

**Slice C: operational policy and evidence.** Status UI, safe stop,
capacity/limit outcomes and bounded loops. Keep provider-specific account
selection and quota classification explicit where unavailable.

At least one E2E needs: Specification with three dependent Tasks, a
review `fail` -> implement rework -> review `pass` loop, a human approval
pause, restart during an unknown dispatch and final owner acceptance.
No provider process is started twice on the same uncertain invocation.

**Real .NET project cutover proof:** the stronger
[NEvo full-feature retirement DoD](legacy-nevo-migration.md#project-cutover-definition-of-done)
requires an entirely new Specification-to-merged-PR feature in the actual
`dczerwinskipl/nevo` repository **after** its legacy Node/JS/TS tools have been
removed. E6 single-step acceptance, P103/P104 automated execution, P105
verification, L131 agent Create, T101/T102 GitHub delivery and NEvo-specific
instructions/docs must all work together. This is a separate project migration
gate; do **not** silently promote it to SpecFlow 1.0 or count a successful
single step as full Specification delivery.

## Explicit non-goals

No new Workflow DSL, no parallel per-Task worktrees, no auto-created PR,
no implicit GitHub merge, no generic recurring scheduler, and no transfer
of owner approvals to agents. Those changes each need their own contract
and acceptance boundary. This automation is independently deployable
**after** the single-step protocol is accepted.
