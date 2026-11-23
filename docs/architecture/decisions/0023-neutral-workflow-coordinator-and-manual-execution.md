---
id: adr.0023-neutral-workflow-coordinator-and-manual-execution
type: adr
title: Neutral workflow coordinator, SpecFlow adapter and manual execution by a person
status: current
date: 2026-11-14
summary: >
  The workflow kernel is split into a product-neutral coordinator (@nevo/workflow) and the SpecFlow
  adapter in the Engine, which owns Run identity, storage, Task effects, continuation, gates and
  attention. A step declares the executor classes it allows (executors: [agent, human]); every attempt
  records its actor, and owner commands take a trusted OwnerActor from the Runtime or CLI. A repeated
  finish is idempotent. Attention is a projection with an actor and actions; dashboard grouping is
  presentation owned by the Runtime. Gates are SpecFlow annotations evaluated by the Engine.
related:
  - adr.0019-workflow-kernel-and-automatic-continuation
  - adr.0012-product-package-topology-and-dependency-direction
  - adr.0024-tasks-are-resources
  - architecture.workflow.workflow-kernel
  - reference.api.specification-workflow
  - reference.api.task-reads
  - product.specflow.ui.workflow-execution
  - product.specflow.ui.specification-overview
---

# 0023 — Neutral workflow coordinator and manual execution

## Status

Current. Owner decisions of PR #137 (D01, D02, D05, D09, D10, D15, D16, rounds 1–5) and of
2026-11-13 (Overview grouping and attention, 1A–7A), implemented. Amends
[ADR 0019](0019-workflow-kernel-and-automatic-continuation.md) decision 1 (the core becomes a package
with a SpecFlow adapter) and decision 8 (attention items), and replaces its one-executor-per-step
model. Package boundary: [ADR 0012](0012-product-package-topology-and-dependency-direction.md).
Behaviour: [Workflow kernel](../workflow/workflow-kernel.md). HTTP:
[Specification workflow](../../reference/api/specification-workflow.md).

## Context

- A person must be able to run a Specification and its Tasks in the UI without any Session, and later
  hand single steps to an agent without a second state machine.
- The first kernel was tied to SpecFlow and allowed one executor kind per step, so a person could not
  do an agent step.
- A future consumer (scheduled automation) must run one definition many times without a
  Specification or Task.

## Decision

1. **Neutral coordinator.** `@nevo/workflow` holds compiled definitions, runs, pins and replay, and one
   pure function `decide(definition, run, command)` that returns the next run, an intent and the
   declared effects. Steps are `work` or `wait`; transitions carry neutral fields plus host annotations
   the core never interprets.
2. **SpecFlow adapter.** The Engine compiles its YAML onto the core and owns storage, Task effects,
   provider/model/Session resolution, gates and attention. It applies a decision and its effects in
   one store change.
3. **Host-owned Run identity.** The core takes a Run value and never sees a host key.
4. **Strict cutover.** One strict format for definitions, runs and the journal; older records fail
   closed. No compatibility reader or migration.
5. **Executors and actors.** A work step declares `executors: [agent, human]` (one or both). Every
   attempt records its actor; an active attempt is continued only by its own class, so a person never
   finishes an agent's attempt (takeover is F17). Shipped agent steps allow both classes.
6. **Trusted owner actor.** Owner commands take an `OwnerActor` built only by the Runtime (from the
   authenticated subject) or the CLI (`local:<os-user>`, `trust: local`), never from a payload.
   `trust: local` is not proof of a human.
7. **Idempotent finish (F16).** Repeating the last finish with the same request digest and actor
   returns the recorded result and completes a pending journal; anything else is
   `WORKFLOW_ATTEMPT_MISMATCH`.
8. **No Session to reuse (D10).** After a person finishes into `session: reuse`, the agent option is
   `session-unavailable`; nothing falls back to a fresh Session.
9. **Attention is a projection with an actor and actions.** It also covers broken Tasks, changed
   definitions and the start blockers a person fixes; waiting, being ready, a draft or on hold are not
   attention, and a stuck Specification gets one `tasks-stuck` item. (Amended on 2026-11-16 by the
   owner: being on hold alone is still not attention, but a Task on hold that the user must resume or
   cancel is: escalated with no Specification step deciding it, waited on directly by an open Task,
   or keeping the active step from finishing to `completed`; see "Held Tasks" in the kernel.) The
   rules are in [Workflow kernel](../workflow/workflow-continuation-and-attention.md#continuation-and-attention).
10. **Three concerns stay apart.** The Engine owns workflow state and exposes neutral Task facts; the
    attention projection owns attention; grouping is declarative presentation data of the Runtime. The
    CLI and MCP read facts without groups, and the UI renders what it receives.
11. **Gates.** A work step may declare entry and exit gates (first type `document`; `command` and
    `human` later, F03). They are SpecFlow annotations, covered by the pin, inspected read-only by the
    projection and enforced inside the lock before any write
    ([Workflow kernel, Gates](../workflow/workflow-definitions-and-gates.md#gates)).
12. **Step titles.** Every workflow, step, transition and return has a one-line title; surfaces show it
    and keep the id as the reference.

## Consequences

- The UI, the HTTP API and the offline CLI share one deterministic path; none computes legality,
  groups or attention.
- A person can do any step an agent may do, and history shows who did each attempt.
- A second host can reuse the coordinator, proven by a test host with two independent runs.
- Still open: F01, E6 agent delegation, F17, F19 and E5 typed inputs.

## Rejected

- **A host callback that moves the run position.** The core alone chooses steps and transitions.
- **Treating `session: reuse` as `fresh` after a manual step.** It changes the definition's meaning.
- **An executor class in the request.** The actor comes from trusted context only.
- **Lanes or groups in the Engine.** Presentation is the Runtime's configuration.
