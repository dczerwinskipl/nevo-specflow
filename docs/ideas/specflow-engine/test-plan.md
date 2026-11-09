---
id: ideas.specflow-engine.test-plan
type: engineering
title: Open Engine workflow and managed execution test matrix
status: draft
scope: specflow
areas: [testing, workflow, runtime, cli, security]
tags: [integration-testing, git, worktree, concurrency, recovery]
read_when:
  - designing tests for offline workflow coordination, writer claims or managed execution
  - investigating crash consistency or cross-process state of workflow steps
summary: >
  Open test matrix (W, L, SC, AG, H07, S, B, R06/R07, MI) using real temporary Git repositories,
  offline child processes, HTTP integration and fault injection; implemented Create, Close,
  Project Home and Session foundation cases are covered by package tests.
related:
  - ideas.specflow-engine
  - ideas.specflow-engine.locking
  - ideas.specflow-engine.recovery
  - ideas.specflow-engine.acceptance
  - ideas.specflow-engine.managed-session-integration
  - ideas.specflow-engine.execution-scopes
---

# Test plan

## Evidence standard

A passing mock repository/DI unit test **does not** prove actual Git worktree behavior or cross-process locking. Use real temporary Git repositories, real CLI child processes and actual Fastify HTTP endpoints. Fake clocks/IDs are appropriate for deterministic unit tests; filesystem and Git must be real in boundary integration tests. Run on Windows and a POSIX CI runner, using paths with spaces and non-ASCII characters. Isolate Git user identity/config and default branch per fixture. Never access or mutate the developer's real Git repo.

For each case capture: setup, command/API, machine-readable result, files/refs/registry state, side-effect count, and cleanup verification. Failure tests must establish _absence_ of unintended effects.

## Layers and explicit gates

Specification Create, Close, Project Home, binding provenance, Git worktrees and the Sessions
foundation (former Foundation A, its LC01–LC40 lifecycle extension, and S01/S02/S06) are implemented
and covered by package tests; their rules live in the current architecture documents. The rows below
are still open.

**Foundation B** owns L03–L06, W01–W10, H07, AG01–AG03 and SC01–SC02; it needs a real workflow step
through a CLI or Runtime surface over the Engine kernel, not a fake acceptance endpoint. **Managed
integration** owns R06 and S03–S08. **Binding lifecycle** owns B01–B04; R07 belongs to the
workflow finish journal with Git stages. OS/platform evidence applies to all stages.

1. **Pure/domain:** transition/idempotency planning, error taxonomy, read projections.
2. **Filesystem+Git integration:** real `git init`, worktrees, branch and dirty state.
3. **Separate-process coordination:** spawn independent Node/CLI processes with barrier synchronization, kill one at injected stage.
4. **Runtime HTTP integration:** authenticate/authorize, invoke the real feature endpoint and Engine; check readable data without frontend fixtures.

## Dirty-baseline admission

| ID   | Stage | Scenario                                      | Expected                                                              |
| ---- | ----- | --------------------------------------------- | --------------------------------------------------------------------- |
| SC01 | B     | Start spec authoring immediately after create | Known Engine scaffold can be admitted for writing under action policy |
| SC02 | B     | Unrelated dirty edits or clean-tree gate      | Correct explicit blocker/remediation; no global dirty bypass          |

## Claims and crash matrix

| ID  | Scenario                                                                          | Expected                                               |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------ |
| L03 | CLI finishes `start`, agent simulated still writing, Runtime tries same workspace | Claim blocks conflicting Engine writer after CLI exits |
| L04 | Separate worktrees concurrently claimed                                           | Independent work can proceed                           |
| L05 | Wrong owner token/identity attempts finish/release                                | Refused; claim unchanged                               |
| L06 | Stale claim with unknown external agent outcome                                   | Recovery-required; no auto-steal                       |
| R06 | Runtime shutdown during managed operation                                         | Own resource settles; external claims not confiscated  |
| R07 | Process restarts with an interrupted workflow finish (later migration)            | No duplicated stage or attempt                         |

## Minimal real workflow and claim recovery (Foundation B)

| ID  | Scenario                                                                                      | Expected                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| W01 | Separate CLI starts actual simple deterministic workflow with Runtime stopped                 | Real attempt identity, not mock or Session                                                                                                          |
| W02 | Separate CLI finishes same step                                                               | Explicit transition/evidence, no implicit next start                                                                                                |
| W03 | Spec Writer scope with no taskId                                                              | Workspace writer claim allowed when effects require it                                                                                              |
| W04 | Enforced read-only analysis                                                                   | No writer claim; if write restriction unproven, fail conservative                                                                                   |
| W05 | Claim survives command termination                                                            | Other competing writer blocked, different worktree may proceed                                                                                      |
| W06 | External execution settles/releases without a Runtime Turn                                    | Release does not finish active workflow attempt                                                                                                     |
| W07 | Proven terminal external execution, valid journal                                             | Inspect then safe reconcile + CAS release; workspace unblocked                                                                                      |
| W08 | Abandoned/unknown external writer                                                             | Actionable inspection, safe owner release or explicit escalation; no TTL/PID theft                                                                  |
| W09 | Wrong owner/role or agent-supplied human review                                               | No forged human approval, even when valid claim exists                                                                                              |
| W10 | Active attempt created under workflow definition v1; workspace definition later changes to v2 | Inspect/resume/finish uses pinned verified v1 evidence or blocks for explicit compatible migration; never silently adopts v2 or Project Home's HEAD |

## Operator identity and human approval policy

| ID   | Scenario                                                            | Expected                                                                             |
| ---- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| AG01 | Agent uses CLI human confirmation without independent trusted actor | No privileged approval under secure policy                                           |
| AG02 | Human gate evidence from previous attempt or another task/gate      | Rejected; no evidence bleed                                                          |
| AG03 | Shared OS-account agent with full file access                       | Threat model explicitly states advisory—not adversarial—security; no false guarantee |

## Runtime observability

| ID  | Scenario                                  | Expected                                              |
| --- | ----------------------------------------- | ----------------------------------------------------- |
| H07 | External agent progresses Engine workflow | Workflow state visible, no fabricated managed Session |

## Managed Sessions integration (mock provider)

| ID  | Scenario                                                   | Expected                                                                               |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| S03 | Turn settles terminal before explicit workflow finish      | Task stays unfinished, no automatic reviewer Session                                   |
| S04 | One Session performs explicit Task batch sequentially      | Per-Task attempt identity and current execution scope, no historical binding ambiguity |
| S05 | Handover creates successor Session                         | Explicit lineage/context; no silent claim transfer/step advance                        |
| S07 | Workspace root moved/rebound/missing then new Turn resumes | Revalidate binding/current cwd/native compatibility; preserve readable history         |
| S08 | Limited HTTP actor reads Session/Task/Specs projections    | Scoped redaction/403/404 without cross-resource leakage                                |

## Binding change and cleanup (later gate)

| ID  | Scenario                                                | Expected                                                         |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| B01 | Merge content into destination, rebind canonical source | Destination verified, CAS binding generation, one canonical spec |
| B02 | Merge claimed but destination files stale               | Explicit rebind conflict, no cleanup                             |
| B03 | Active Turn or unresolved writer during rebind          | Operation blocked/reconciled; history unaffected                 |
| B04 | Worktree manually removed/moved then reattach           | Verify Git membership and identity; no guessed main fallback     |

## Deferred multi-instance user-defined step matrix (future follow-up only)

These **MI** IDs do not alter Foundation B or managed Session acceptance. The Engine does not know a special `review` step: each scenario uses step-defined instructions, effects, typed result schema and aggregation policy. Prove offline Engine aggregation **before** managed provider scheduling; use real independent CLI processes and Git worktrees where applicable.

| ID   | Scenario                                                           | Required evidence                                                                                                     |
| ---- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| MI01 | Single-instance step with current CLI start/finish                 | Legacy behavior retained for a user-defined step, no additional workflow transition                                   |
| MI02 | User-defined N=3, sequential vs concurrent runs                    | Same typed output/declared reducer; one canonical attempt; maxConcurrency only affects scheduling                     |
| MI03 | Racing starts/finishes for one instance                            | Exactly one accepted slot/run and trusted identity; no duplicate contribution                                         |
| MI04 | Provider timeout/quota with 2/3 valid results                      | Keep contributions; independent bounded retry; incomplete if configured minimum not met                               |
| MI05 | Superseded run sends late result                                   | Fence and reject or idempotently recover accepted same-run result                                                     |
| MI06 | Crash after durable contribution before response                   | Idempotent replay; no duplicate count, action or transition                                                           |
| MI07 | Effect-based admission with readers and potential writers          | Readers may coexist only when enforced; writer/side-effectful step isolated or serialized                             |
| MI08 | Step activation changes metadata; dirty Git material changes later | Snapshot captured after activation; same-input policy detects different staged/unstaged/untracked content             |
| MI09 | Two user-defined step output schemas and reducers                  | All/any boolean and explicitly ordered/nominal enum policies resolve exactly as declared; no built-in review severity |
| MI10 | Partial results and configured exception/waiver                    | Audited actor and effective policy; no fabricated missing result or implicit human approval                           |
| MI11 | Two aggregate finalizers, crashing gate/commit transition          | One durable finalization and canonical state change; verify side effects exactly once                                 |
| MI12 | Input independence, provider provenance, rebind and offline CLI    | Declared semantic independence assessed honestly; stale source and unknown effects safe; Engine works without Runtime |

## Running and reporting

No concrete command names are prescribed until tests exist. Proposed categories: `engine:unit`, `engine:git-integration`, `engine:process-integration`, `runtime:integration` or equivalent using Turborepo/package scripts. CI should keep required checks stable and run affected packages. Mark tests explicitly skipped when Git executable/platform is unavailable rather than passing a fake.

Test reports should include OS, Git/Node versions, revision under test, per-ID PASS/FAIL/SKIP, reason for every skip and physical fixture cleanup result. Do not claim acceptance if required L/R/W tests are skipped.

## Exit criteria per stage

- **Foundation B:** L03–L06, W01–W10, H07, SC01–SC02 and AG01–AG03 pass (or owner explicitly approves a documented cooperative-only trust model where strong actor separation is not technically enforced). Demonstrate a **real deterministic step** through the Engine kernel, not a stub coordinator API. H07 tests an external CLI workflow through Runtime read projections, not provider execution. No AI provider required.
- **Managed integration:** S03–S05, S07, S08 and R06 pass with a mock provider and the Engine kernel. **Binding lifecycle** owns B01–B04; the **workflow finish journal** owns R07. Their contracts must still be reviewed before the relevant API is frozen.

A skipped critical required test is **not** success. Report actual PASS/FAIL/SKIP, per-stage counts, OS/Node/Git versions, fault injection checkpoints, artifact links and justified deferrals. See [staged acceptance](acceptance-criteria.md).
