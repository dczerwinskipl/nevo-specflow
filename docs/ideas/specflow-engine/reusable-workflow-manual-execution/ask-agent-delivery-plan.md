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
  The ordered delivery of the Ask agent contract: nine small slices, each one PR, from Close
  preservation and claim-aware kernel operations through Runtime-mediated Engine writes, the owner
  credential, the agent step context, starting and finishing an agent attempt with its boundary
  checks, the attempt commit, owner confirmation and recovery, each with its test strategy within a
  strict test budget, plus where the remaining dogfood findings go and who owns them.
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
product working: no slice opens a path the next slice has to close (an agent approving, an
unregistered document, unattributed changes). The decisions each slice assumes are the contract's
recommendations; a different owner decision changes only the slices that name it.

## Test budget

The suites are already slow. Every slice:

- tests rules where they are decided: Engine pure functions and use cases with small in-memory or
  temporary-directory fixtures (one Specification, at most three Tasks);
- uses the mock provider driver and mock models for every Runtime test; no real provider, no
  network;
- adds at most one Runtime integration test file, and UI tests as component tests or stories with
  `play` checks, not new browser end-to-end tests;
- runs fault injection only at the journal boundaries the slice adds (slice 6);
- runs targeted test files locally on Windows; full suites run on Linux and CI.

One manual dogfood rerun of the 2026-11-16 flow closes the plan (not in CI).

## Slices

### 1. Close lists uncommitted work

- **Delivers:** the Close preview (UI dialog and `specs close --preview`) adds an **Uncommitted
  changes** group with the paths Close would refuse (`CLOSE_PREFLIGHT`, ledger holds) and the remedy
  per kind.
- **Decisions:** D16.
- **Depends on:** nothing. B4 is being fixed in PR #163; if it is not, the manual-path case (the
  `MANUAL_COMMIT_CONFLICT` after a finish and its banner saying Close includes the changes) falls into
  this slice. The plan does not assume B4's cause either way.
- **Tests:** Engine unit for the preview's blocker list from a fixture with one ledger path and one
  foreign path; one UI component test of the group; CLI preview output test.

### 2. Claim-aware kernel operations

- **Delivers:** workflow start, finish and return consult the claims like every other writer (plan 06
  F05), so an offline owner CLI or another writer cannot move a Run while an agent Turn runs, and the
  refusal uses the holder naming of PR #163; an invalid context reference names the field and the
  accepted form (B7). The B1 refusal message (naming the agent Turn instead of Create or Close) is
  done in PR #163 and is not repeated here.
- **Decisions:** none new.
- **Depends on:** PR #163 (the B1 message); useful today.
- **Tests:** Engine unit: a finish and a return refuse during a foreign claim and succeed after it
  settles; the `spec-doc:overview.md` case.

### 3. Runtime-mediated Engine writes

- **Delivers:** the invocation capability, the broker on a per-user named pipe or Unix socket,
  constant-time comparison, redaction from transcripts and logs, operation ids bound to the
  invocation, the CLI routing when a capability is present, and the Engine owned-claim admission for
  document create, save and classify with an `AgentActor`. Scope for ad-hoc Turns per D11b
  (documents only); attempt scope and Task drafts arrive with slice 6.
- **Decisions:** D11, D11b.
- **Depends on:** 2.
- **Tests:** Engine unit: the own claim admits, another unsettled claim refuses, a stale or settled
  invocation refuses, out-of-scope operations refuse. Broker unit: a body carrying an actor or claim
  id is refused, another invocation's capability is refused, a call without a capability is refused,
  a replayed operation id from another invocation is refused, the capability never appears in a
  stored transcript entry. One Runtime integration test with the mock driver: a Turn runs `docs
create --type` and succeeds.

### 4. Owner credential on owner routes

- **Delivers:** the owner credential of D21 on every owner mutation route in every authentication
  mode, the one-time launch token handed only to the launcher and exchanged once for the UI's
  cookie, and a provider environment stripped of any Runtime credential.
- **Decisions:** D21.
- **Depends on:** nothing; it must land before slice 6 makes agent execution reachable.
- **Tests:** Runtime route tests: in mode `none`, Finish, Approve and Return without the credential
  are refused and with it succeed; the launch token is accepted once and refused on reuse, and is
  refused after it expires; the provider launch environment holds neither the token nor the
  credential.

### 5. Agent step context

- **Delivers:** the step context gains the subject's registered documents, the document types and
  templates, and the resolved Task context references with budgets and the attempt digest;
  `nevo-specflow workflow context` prints it; the Runtime renders a brief from it, with the
  operations of the ad-hoc scope from slice 3. The attempt scope's operations are added to the brief
  by slice 6, from the same generator.
- **Decisions:** D13.
- **Depends on:** 3 (the scope the brief lists).
- **Tests:** `compileStepContext` unit tests for ordering, budgets and a missing required entry; one
  brief-rendering snapshot per subject kind (Specification, Task); no provider.

### 6. Ask agent: start and finish one attempt

- **Delivers:**
  - the projection's agent option (available, or unavailable with its reason);
  - the Ask agent command: start with the trusted `AgentActor`, Session per D18 (a fresh Session for
    an independent archetype), association, claim with the attempt binding, dispatch of the brief;
  - attempt scope in the broker, including Task drafts with origin `produced`;
  - the boundary checks: clean-baseline admission, the baseline re-check at every Turn's dispatch,
    and the finish refusals for unregistered documents (D14), Engine files past their post-image and
    undeclared or clean declared `changes.paths`;
  - effect authority: an agent proposal whose transition carries an owner-authority effect or
    `confirmation: owner` is refused (`WORKFLOW_OWNER_DECISION_REQUIRED`);
  - the finish proposal, finalize-with-settle, the unresolved-attempt state and **Continue**;
  - the Now block's split action and the position line's Session and Stop.

  After this slice the agent's work is attributed and visible, but not yet committed: the ledger and
  the declared paths stay uncommitted, Close lists them (slice 1), and the owner commits them by hand.

- **Decisions:** D12, D14, D18.
- **Depends on:** 1 to 5.
- **Tests:** Engine unit for proposal validation and replay, each boundary refusal with its paths
  (an undeclared file, an unclassified document, a direct `task.md` edit, a file changed between
  Turns), and the refused approval effect; fault injection at the three new boundaries (proposal
  recorded, finish published, claim settled) proving no duplicate finish and no gap; one Runtime
  integration test with the mock driver running start, a document write, a Task draft and a finish;
  Now block stories for each position.

### 7. Attempt commit

- **Delivers:** the one attempt commit at finalize of the attempt's ledger entries and declared,
  verified paths, with full subjects (B5), and its retryable post action.
- **Decisions:** D15.
- **Depends on:** 6.
- **Tests:** Engine unit with a temporary Git fixture: exactly the declared path and the ledger
  entries are committed and nothing else; a failed commit leaves the finish published and the paths
  listed by Close; the retry commits once.

### 8. Owner confirmation of approvals

- **Delivers:** the `confirmation: owner` transition marker in the definition schema, the
  `independent` archetype facet and its validation, the pending owner confirmation position, and
  Confirm and Reject in the projection, API, CLI and Now block. Slice 6's refusal becomes a pending
  confirmation.
- **Decisions:** D17.
- **Depends on:** 6.
- **Tests:** kernel unit: an agent proposal with `approve-draft-tasks` waits, the owner confirms and
  the drafts are approved, Reject returns with feedback, a person's finish is direct; definition
  validation for the marker and for `session: reuse` into an independent step; one story per new Now
  block state.

### 9. Stop, return and takeover

- **Delivers:** Return cancels an agent attempt's Turn (F13), Take over (F17) once the claim is
  settled, the attempt's partial-work list and its step events in the Task and Activity history, and
  the permission allowlist per archetype if the owner chooses D20 (a).
- **Decisions:** D19, D20.
- **Depends on:** 6.
- **Tests:** kernel unit for `taken-over` and a refused late proposal; one Runtime test with the mock
  driver that a return cancels the Turn; history component test.

## Findings outside the slices

Outside Ask agent, each with its owner:

| Finding                                                                        | Owner and route                                                                                                                                |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| B2 Turn lost on a long tool call or a write outside the workspace              | Runtime Sessions (provider driver), its own fix PR; slice 6's dogfood check depends on it                                                      |
| B4 `MANUAL_COMMIT_CONFLICT` on the manual path                                 | Engine documents, fixed in PR #163                                                                                                             |
| Step events missing from the Specification Activity history (manual steps too) | Workflow UI ([Specification Overview](../../../product/specflow/ui/specification-overview.md)); slice 9 adds the agent attempt's events on top |
| New task dialog without dependencies, context and body                         | Workflow UI ([Manual workflow execution](../../../product/specflow/ui/workflow-execution.md)), a UX decision first                             |
| Create taking about 85 s (registration about 60 s)                             | Engine Create ([Specification lifecycle](../../../architecture/runtime/specification-lifecycle.md)), a performance investigation               |
| B8 Session never named, B9 frozen cost                                         | Session UI fixes, independent                                                                                                                  |
| B10 attach picker titles, B11 `pass`/`fail` labels, B12 Task Now purpose       | Workflow UI fixes, independent; B10 also helps slice 6's artifacts                                                                             |
| B13 fresh worktree without dependencies                                        | Workspace bootstrap, deferred with the contract's non-goals                                                                                    |
| Issue link in the brief                                                        | Not modelled on the Specification; the overview carries it until it is                                                                         |
