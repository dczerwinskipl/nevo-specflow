---
id: architecture.workflow.deterministic-workflow
type: architecture
title: Deterministic workflow
status: current
read_when:
  - designing workflow steps, transitions, gates, or actions
  - implementing start, finish, retry, or recovery behavior
  - deciding which workflow state is authoritative versus derived
  - exposing workflow state to CLI, Runtime, agents, or UI
summary: >
  Workflow progression is driven by authoritative declarative state and deterministic
  operations, not agent-authored orchestration. Step start activates, step finish
  completes, transitions are explicit, gates inspect separately from verify, attempts
  scope evidence, and durable effects resume instead of duplicating.
related:
  - architecture.principles.enforceable-invariants
  - architecture.runtime.ownership-and-lifecycle
  - engineering.shared.effects-and-io
  - engineering.shared.testing
---

# Deterministic workflow

Nevo SpecFlow owns workflow progression. An AI agent may perform work inside a step, but it does
not decide what the canonical current step/state is by narrating or editing state directly.

## Authoritative model

A workflow definition declares:

- steps;
- semantic purpose and expected work;
- entry and exit gates;
- finalize actions;
- transitions;
- terminal outcomes.

A task/runtime record stores the minimal canonical position needed to resume progression.
User-facing statuses and readiness are derived from canonical workflow position and the definition
where possible rather than persisted as competing mutable truths.

## Start and finish have different meanings

**Start** activates work.

- Fresh workflow: activate the entry step.
- Active step: resume the same step idempotently.
- Completed step with a non-terminal transition: activate the declared target.
- Completed terminal workflow: report completion; do not invent more work.

**Finish** completes the currently active attempt.

Finish does not silently start the next step. The checkpoint between "step A completed" and "step B
started" is observable and recoverable.

This separation prevents one command from hiding multiple lifecycle transitions and makes crash
recovery unambiguous.

## Explicit transitions

A transition target is discriminated:

- another workflow step; or
- a terminal outcome/status.

Conditional transitions require an explicit result matching one declared branch. Missing, unknown,
or ambiguous results fail closed.

The engine does not let an agent infer the next step from prose.

## Attempts

Re-entering a step creates a new monotonic **attempt**.

Attempt identity scopes runtime evidence such as:

- verification results;
- human sign-off;
- finalize operation records;
- generated review artifacts.

Evidence from attempt N must never accidentally satisfy gates for attempt N+1.

History preserves completed attempts and transition results without becoming a second mutable
current-state model.

## Inspect versus verify

Planning and readiness checks are non-mutating.

A gate/action contract separates:

- **inspect/check** — safe fact gathering and readiness/blocker reporting;
- **verify/execute** — authoritative verification or side effects.

Compiling context for an agent/UI must not accidentally run tests, mutate Git, record a human
sign-off, or perform finalize actions.

## Finish planning before mutation

Before creating a durable mutation operation, finish computes a non-mutating plan:

- required inputs;
- current blockers;
- current workflow/attempt identity;
- relevant source-control facts;
- intended transition.

If inputs are incomplete or a gate is authoritatively blocked, no durable finish operation is
created.

## Durable resumable mutation

Once mutation begins, multi-stage effects are represented by a durable operation record.

A finish/finalize path may include stages such as:

```text
verify gates
→ update canonical task/workflow state
→ source-control effects
→ publish/transition bookkeeping
```

The exact stages may evolve, but the invariant does not: a retry resumes the same logical operation
and never duplicates a stage already proven complete.

Runtime operation bookkeeping belongs in local execution storage, not in Git-tracked
specification/domain documents.

## Gates and human decisions

Human verification is represented as an explicit gate/operation result, not an implicit "agent
thinks owner approved" string.

Automated and human gates share the same deterministic progression model while keeping their
evidence sources distinct.

A surface may request or record a human decision, but only the workflow operation decides whether
that evidence satisfies progression.

## Fail closed on contradictory state

Examples:

- workflow definition missing or invalid;
- referenced action or gate unknown;
- attempt history incoherent;
- active state conflicts with an unsettled prior finalize operation;
- requested transition result is undeclared;
- authoritative verification unavailable.

Such conditions produce explicit machine-readable failures. They do not trigger a best-effort
transition.

## Surface neutrality

CLI, Runtime, UI, and agents consume the same workflow application operations.

No surface owns an independent progression algorithm. UI lanes/statuses are projections; agent
prompts are context; neither is authoritative state.
