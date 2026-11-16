---
id: ideas.specflow-engine.reusable-workflow.ask-agent-plan
type: engineering
title: Ask agent delivery plan — slices, tests and test budget
status: draft
scope: specflow
areas: [workflow, runtime, ai, ui, cli, testing]
tags: [agent-execution, ask-agent, delivery-plan, test-budget]
read_when:
  - planning or reviewing a PR that delivers part of Ask agent
  - deciding where a dogfood finding about agent execution is fixed
summary: >
  The ordered delivery of the Ask agent contract: seven small slices, each one PR, from Close
  preservation and the agent step context through Runtime-mediated Engine writes, starting and
  finishing an agent attempt, the controlled commit policy, owner confirmation and recovery, each
  with its test strategy within a strict test budget, plus where the remaining dogfood findings go.
related:
  - ideas.specflow-engine.reusable-workflow.agent-execution
  - product.specflow.ui.workflow-execution
  - architecture.workflow.workflow-kernel
  - architecture.runtime.workspace-execution-claims
  - ideas.specflow-engine.plan-06
---

# Ask agent delivery plan

The order in which the [Ask agent contract](agent-assisted-execution.md) is delivered. Each slice
is one PR, a vertical slice through Engine, Runtime, CLI and UI where it needs them, and leaves the
product working. The decisions each slice assumes are the contract's recommendations; a different
owner decision changes only the slices that name it.

## Test budget

The suites are already slow. Every slice:

- tests rules where they are decided: Engine pure functions and use cases with small in-memory or
  temporary-directory fixtures (one Specification, at most three Tasks);
- uses the mock provider driver and mock models for every Runtime test; no real provider, no
  network;
- adds at most one Runtime integration test file, and UI tests as component tests or stories with
  `play` checks, not new browser end-to-end tests;
- runs fault injection only at the journal boundaries the slice adds (slice 4);
- runs targeted test files locally on Windows; full suites run on Linux and CI.

One manual dogfood rerun of the 2026-11-16 flow closes the plan (not in CI).

## Slices

### 1. Close lists uncommitted work

- **Delivers:** the Close preview (UI dialog and `specs close --preview`) adds an **Uncommitted
  changes** group with the paths Close would refuse (`CLOSE_PREFLIGHT`, ledger holds) and the remedy
  per kind; the finish banner after a failed commit no longer says that Close includes paths it will
  refuse (B4 wording).
- **Decisions:** D16.
- **Depends on:** nothing; useful today for manual execution.
- **Tests:** Engine unit for the preview's blocker list from a fixture with one ledger path and one
  foreign path; one UI component test of the group; CLI preview output test.

### 2. Agent step context

- **Delivers:** the step context gains the subject's registered documents, the document types and
  templates, the resolved Task context references with budgets and the attempt digest, and the
  operations and CLI forms of the attempt's scope; `nevo-specflow workflow context` prints it; the
  Runtime renders a brief from it.
- **Decisions:** D13.
- **Depends on:** nothing (read-only).
- **Tests:** `compileStepContext` unit tests for ordering, budgets and a missing required entry; one
  brief-rendering snapshot per subject kind (Specification, Task); no provider.

### 3. Runtime-mediated Engine writes

- **Delivers:** the invocation capability, the Runtime loopback broker, the CLI routing when a
  capability is present, the Engine owned-claim admission for document create, save and classify and
  for Task create and edit with an `AgentActor`, kernel operations that consult claims, and refusals
  that name the real holder (B1) and the accepted reference form (B7). Scope for ad-hoc Turns per
  D11b; attempt scope arrives with slice 4.
- **Decisions:** D11, D11b.
- **Depends on:** nothing beyond the current claims.
- **Tests:** Engine unit: own claim admits, another unsettled claim refuses, a stale or settled
  invocation refuses, out-of-scope operations refuse, a kernel finish refuses during a foreign claim.
  One Runtime integration test with the mock driver: a Turn runs `docs create --type` and succeeds, the
  same command without the capability is refused.

### 4. Ask agent: start and finish one attempt

- **Delivers:** the projection's agent option (available, or unavailable with its reason), the Ask
  agent command (start with the trusted `AgentActor`, Session per D18, association, claim with the
  attempt binding, dispatch of the brief), attempt scope in the broker including origin `produced`
  Task drafts, the finish proposal, finalize-with-settle, the unresolved-attempt state and
  **Continue**; the Now block's split action and the position line's Session and Stop.
- **Decisions:** D12, D18.
- **Depends on:** 2, 3.
- **Tests:** Engine unit for proposal validation and replay; fault injection at the three new
  boundaries (proposal recorded, finish published, claim settled) proving no duplicate finish and no
  gap; one Runtime integration test with the mock driver running start, a document write, a Task draft
  and a finish; Now block stories for each position.

### 5. Controlled commit of an agent attempt

- **Delivers:** clean-baseline admission for Ask agent, the finish checks (unregistered documents,
  Engine files past their post-image, undeclared or clean declared paths), the declared `changes.paths`
  in the finish input, and the attempt commit at finalize with full subjects (B5).
- **Decisions:** D14, D15.
- **Depends on:** 4.
- **Tests:** Engine unit with a temporary Git fixture: a declared path is committed and nothing else;
  an undeclared file, an unclassified document and a direct `task.md` edit each refuse with their
  paths; a failed commit leaves the finish published and the paths listed by Close.

### 6. Owner confirmation of approvals

- **Delivers:** effect authority in the Engine, the `confirmation: owner` transition marker in the
  definition schema, the pending owner confirmation position, Confirm and Reject in the projection,
  API, CLI and Now block.
- **Decisions:** D17.
- **Depends on:** 4.
- **Tests:** kernel unit: an agent proposal with `approve-draft-tasks` waits, the owner confirms and
  the drafts are approved, Reject returns with feedback, a person's finish is direct; definition
  validation for the marker; one story per new Now block state.

### 7. Stop, return and takeover

- **Delivers:** Return cancels an agent attempt's Turn (F13), Take over (F17) once the claim is settled,
  the attempt's partial-work list in the Task and Activity history, and the permission allowlist per
  archetype if the owner chooses D20 (a).
- **Decisions:** D19, D20.
- **Depends on:** 4.
- **Tests:** kernel unit for `taken-over` and a refused late proposal; one Runtime test with the mock
  driver that a return cancels the Turn; history component test.

## Findings outside the slices

| Finding                                                                  | Where                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| B2 Turn lost on a long tool call or a write outside the workspace        | Session driver bug, its own fix PR; slice 4's dogfood check depends on it |
| B8 Session never named, B9 frozen cost                                   | Session UI fixes, independent                                             |
| B10 attach picker titles, B11 `pass`/`fail` labels, B12 Task Now purpose | Workflow UI fixes, independent; B10 also helps slice 4's artifacts        |
| B13 fresh worktree without dependencies                                  | Workspace bootstrap, deferred with the contract's non-goals               |
| Issue link in the brief                                                  | Not modelled on the Specification; the overview carries it until it is    |
