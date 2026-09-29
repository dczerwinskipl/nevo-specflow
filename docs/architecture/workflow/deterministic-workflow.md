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
  - architecture.principles.normative-language
---

# Deterministic workflow

Nevo SpecFlow owns workflow progression. An AI agent MAY perform work inside a step, but it MUST
NOT decide or mutate the canonical current step/state by narration or direct state editing.

## Authoritative model

A workflow definition declares:

- steps;
- semantic purpose and expected work;
- entry and exit gates;
- finalize actions;
- transitions;
- terminal outcomes.

A task/runtime record stores the minimal canonical position needed to resume progression.
Any status/readiness fact derivable from canonical workflow position and the workflow definition
MUST be derived. It MUST NOT be persisted as a second mutable source of truth unless a separate
current architecture decision explicitly makes that field authoritative.

## Execution identity and admission

Workflow mutation always has one authoritative execution identity:

```text
(change, task, step, attempt)
```

An AI session MAY carry wider context and a batch MAY coordinate multiple tasks, but that context
MUST NOT replace the per-task identity whose state, gates, evidence, and transition are being
mutated.

Executor/session identity used for admission MUST come from trusted Runtime/application context.
It MUST NOT be accepted from an agent-authored command parameter or prompt.

Before mutating work begins, the application MUST admit the execution against the current workspace
and workflow state. Conflicting active ownership, an unsafe dirty baseline, an unsettled prior
operation, or a stale claim that cannot be reconciled causes an explicit stop rather than concurrent
best-effort execution.

Workspace claims/locks are implementation mechanisms for this invariant, not the invariant itself.
Recovery MUST reconcile stale/dead ownership before admitting conflicting work.

## Start and finish have different meanings

**Start** activates work.

- Fresh workflow: activate the entry step.
- Active step: resume the same step idempotently.
- Completed step with a non-terminal transition: activate the declared target.
- Completed terminal workflow: report completion; do not invent more work.

**Finish** completes the currently active attempt.

Finish MUST NOT silently start the next step. The checkpoint between "step A completed" and "step B
started" is observable and recoverable.

This separation prevents one command from hiding multiple lifecycle transitions and makes crash
recovery unambiguous.

## Explicit transitions

A transition target is discriminated:

- another workflow step; or
- a terminal outcome/status.

Conditional transitions MUST require an explicit result matching exactly one declared branch. Missing, unknown,
or ambiguous results fail closed.

The engine MUST NOT let an agent infer the next step from prose.

## Attempts

Re-entering a step creates a new monotonic **attempt**.

Attempt identity scopes runtime evidence such as:

- verification results;
- human sign-off;
- finalize operation records;
- generated review artifacts.

Evidence from attempt N MUST NOT satisfy gates for attempt N+1.

History preserves completed attempts and transition results without becoming a second mutable
current-state model.

## Inspect versus verify

Planning and readiness checks are non-mutating.

A gate/action contract separates:

- **inspect/check** — safe fact gathering and readiness/blocker reporting;
- **verify/execute** — authoritative verification or side effects.

Compiling context for an agent/UI MUST NOT run tests, mutate Git, record a human sign-off, or
perform finalize actions.

## Finish planning before mutation

Before creating a durable mutation operation, finish computes a non-mutating plan:

- required inputs;
- current blockers;
- current workflow/attempt identity;
- relevant source-control facts;
- intended transition.

If inputs are incomplete or a gate is authoritatively blocked, a durable finish operation MUST NOT
be created.

## Durable resumable mutation

Once mutation begins, multi-stage effects are represented by a durable operation record.

A finish/finalize path may include stages such as:

```text
verify gates
→ update canonical task/workflow state
→ source-control effects
→ publish/transition bookkeeping
```

The exact stages MAY evolve, but the invariant does not: a retry MUST resume the same logical
operation and MUST NOT duplicate a stage already proven complete.

Runtime operation bookkeeping MUST live in local execution storage and MUST NOT be persisted in
Git-tracked specification/domain documents.

## Gates and human decisions

Human verification is represented as an explicit gate/operation result, not an implicit "agent
thinks owner approved" string.

Automated and human gates share the same deterministic progression model while keeping their
evidence sources distinct.

A surface MAY request or record a human decision, but only the workflow operation MUST decide
whether that evidence satisfies progression.

## Fail closed on contradictory state

Examples:

- workflow definition missing or invalid;
- referenced action or gate unknown;
- attempt history incoherent;
- active state conflicts with an unsettled prior finalize operation;
- requested transition result is undeclared;
- authoritative verification unavailable.

Such conditions MUST produce explicit machine-readable failures and MUST NOT trigger a best-effort
transition.

## Surface neutrality

CLI, Runtime, UI, and agents consume the same workflow application operations.

No surface MAY own an independent progression algorithm. UI lanes/statuses are projections; agent
prompts are context; neither is authoritative state.
