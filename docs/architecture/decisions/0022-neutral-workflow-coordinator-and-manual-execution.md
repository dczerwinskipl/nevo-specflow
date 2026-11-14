---
id: adr.0022-neutral-workflow-coordinator-and-manual-execution
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
  - adr.0023-tasks-are-resources
  - architecture.workflow.workflow-kernel
  - reference.api.specification-workflow
  - reference.api.task-reads
  - product.specflow.ui.workflow-execution
  - product.specflow.ui.specification-overview
---

# 0022 — Neutral workflow coordinator and manual execution

## Status

Current. Owner decisions of PR #137 (D01, D02, D05, D09, D10, D15, D16, rounds 1–5) and of
2026-11-13 (Overview grouping and attention, 1A–7A), implemented. It amends
[ADR 0019](0019-workflow-kernel-and-automatic-continuation.md): decision 1 (the one core is now a
package with a SpecFlow adapter), decision 8 (attention items) and its executor model. The package
boundary is in [ADR 0012](0012-product-package-topology-and-dependency-direction.md); the behaviour in
[Workflow kernel](../workflow/workflow-kernel.md); the HTTP contract in
[Specification workflow](../../reference/api/specification-workflow.md).

## Context

- A person must be able to run a whole Specification and its Tasks in the UI, without any provider
  Session, and later hand single steps to an agent without a second state machine.
- The first kernel tied its progression to SpecFlow (subjects, `wait-for-tasks`, `executor: agent |
human` per step) and allowed only the step's own executor kind, so a person could not do an agent
  step.
- A future second consumer (scheduled automation) must run one definition many times without
  inventing a Specification or a Task.

## Decision

1. **Neutral coordinator.** `@nevo/workflow` holds compiled definitions, runs, pins (sha256 of canonical
   JSON), replay validation and one pure function `decide(definition, run, command)` for `start`,
   `finish`, `event` and `return`. It returns the next run, an intent (`execute`, `ready`,
   `await-event`, `terminal`) and the declared effects. Steps are `work` or `wait`; a wait step
   completes by a named trigger event. Transitions carry neutral fields (target, continuation,
   feedback, result) and opaque host annotations the core never interprets.
2. **SpecFlow adapter.** The Engine maps its YAML (`wait-for-tasks`, `on: tasks-finished |
task-escalated`, `effects`, `session`, `escalate`, `produces`, gates, archetypes) onto the core, owns
   storage, Task effects, the provider/model/Session resolution (`resolveContinuation`), gates and
   attention, and applies a decision and its effects in one store change.
3. **Host-owned Run identity.** The core takes a Run value and never sees a host key. SpecFlow keeps a
   run per Specification and per Task at unchanged locations; another host keys its runs as it likes.
4. **Strict cutover.** One strict schema for definitions, runs and the journal; older records fail
   closed (`WORKFLOW_STATE_CORRUPT`). No compatibility reader, migration or hash preservation.
5. **Executors and actors.** A work step declares `executors: [agent?, human?]`. Every attempt records
   its `actor {class, details}`; the core checks the class against the step and that an active attempt
   is continued only by its own class (a person never finishes an agent's attempt; takeover stays F17).
   The details are host-opaque: an agent's provider, model and Session, or a person's `actorId` and
   `trust`. Every shipped agent step allows `[agent, human]`; human-only steps stay human-only. No
   dispatch preference is stored.
6. **Trusted owner actor.** Owner commands take an `OwnerActor` that only the Runtime (from
   `authz.readContext().subject`, `trust: authenticated`, or the trusted local identity) or the CLI
   (`local:<os-user>`, `trust: local`) constructs, never a request payload. `trust: local` is not proof
   of a human: an agent running as the same OS user looks the same. Task and workflow commands reuse
   `spec.manage`; Abandon needs `spec.close-specification`.
7. **Idempotent finish (F16).** A finish stores the digest of its request (step, attempt, whole input).
   A repeated finish of the run's last finished work attempt with the same digest and actor returns the
   recorded result and changes nothing; when the original change did not finish publishing, the retry
   completes the pending journal first. Anything else naming that attempt is
   `WORKFLOW_ATTEMPT_MISMATCH`.
8. **No Session to reuse (D10).** After a person finishes into a `session: reuse` transition, the agent
   option of the next step is `session-unavailable`. There is no override to a fresh Session and nothing
   is spawned.
9. **Attention is a projection with an actor and actions.** An item carries a reason, the required actor
   (`owner`; `agent` reserved), a primary and an optional secondary action and a display message.
   Besides the continuation reasons it covers a broken Task, a run whose pinned workflow is missing or
   changed (a Task's only while `ready`), and the start blockers of an approved, not-started Task that a
   person fixes: an unresolved required context entry, a dependency that can never complete, a type no
   longer allowed or not defined, and an unmet entry gate once no dependency it waits for can still
   complete. Not attention: waiting for dependencies that can complete, an awaited process artifact,
   being ready to start, and being a draft or on hold. When no open Task can progress, the
   Specification has one `tasks-stuck` item naming each blocking Task and why. Attention is never
   inferred from a status or group name; one list holds every item.
10. **Three concerns stay apart.** Workflow state belongs to the Engine, which exposes neutral Task facts
    (preparation, position, startable, start blockers, dependency wait, definition changed, attention)
    and no presentation concept. Attention belongs to the attention projection. Grouping is
    declarative presentation data of the Runtime (groups, labels, order, a predicate over facts,
    summary prominence, collapse), evaluated once for the Overview and the Tasks page; the CLI and MCP
    read the facts without groups, and the UI renders what it receives.
11. **Gates.** A work step may declare `entryGates` and `exitGates`; an exit gate may apply only to some
    results (`when`). The first type is `document` (a registered document of a type exists, optionally
    with required sections); `command` and `human` gates follow on the same model (F03). Gates are
    SpecFlow annotations, so they are part of the pin, and the core never evaluates them. The action
    projection inspects them read-only; a finish (exit gates) and a start that is not a resume (entry
    gates) evaluate them inside the lock
    before anything is written (`WORKFLOW_GATE_UNSATISFIED`); a replayed finish does not evaluate them
    again.
12. **Step titles.** Every workflow, step, transition label and return label has a one-line title, and
    every projection carries it; surfaces show the title and keep the id as the stable reference.

## Consequences

- One deterministic path serves the UI, the HTTP API and the offline CLI; none of them computes
  legality, groups or attention.
- A person can do any step an agent may do, and history shows who did each attempt.
- A second host can reuse the coordinator, proven by a test host running two independent runs of one
  definition.
- Still open: unattended continuation (F01), agent delegation of single steps (E6), owner takeover of an
  agent step (F17), bounded run history (F19) and typed transition inputs (E5).

## Rejected

- **A host callback that moves the run position.** The core alone chooses steps and transitions.
- **Treating `session: reuse` as `fresh` after a manual step.** It changes the meaning of the definition.
- **An executor class in the request.** The actor comes from trusted context only.
- **Lanes or groups in the Engine.** Presentation is the Runtime's configuration.
