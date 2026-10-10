---
id: ideas.specflow-engine.test-plan
type: engineering
title: Engine workspace integration test plan
status: draft
scope: specflow
areas: [testing, workflow, runtime, cli, security]
tags: [integration-testing, git, worktree, concurrency, recovery]
read_when:
  - designing a proof-of-concept test suite for offline CLI and worktree Specs
  - investigating crash consistency or cross-process state
summary: >
  Executable matrix using real temporary Git repositories, offline child processes,
  HTTP integration and fault injection to validate Engine/Runtime/worktree boundaries.
related:
  - ideas.specflow-engine
  - ideas.specflow-engine.spec-creation
  - ideas.specflow-engine.locking
  - ideas.specflow-engine.recovery
  - ideas.specflow-engine.acceptance
---

# Test plan

## Evidence standard

A passing mock repository/DI unit test **does not** prove actual Git worktree behavior or cross-process locking. Use real temporary Git repositories, real CLI child processes and actual Fastify HTTP endpoints. Fake clocks/IDs are appropriate for deterministic unit tests; filesystem and Git must be real in boundary integration tests. Run on Windows and a POSIX CI runner, using paths with spaces and non-ASCII characters. Isolate Git user identity/config and default branch per fixture. Never access or mutate the developer's real Git repo.

For each case capture: setup, command/API, machine-readable result, files/refs/registry state, side-effect count, and cleanup verification. Failure tests must establish *absence* of unintended effects.

## Layers

1. **Pure/domain:** validation, id/slug collision rules, read projections, location binding precedence, error taxonomy, transition/idempotency planning.
2. **Filesystem+Git integration:** real `git init`, initial commit, `git worktree add/list/remove`, inspect membership, branch and dirty state.
3. **Separate-process coordination:** spawn independent Node/CLI processes with barrier synchronization, kill one at injected stage.
4. **Runtime HTTP integration:** authenticate/authorize, invoke real feature endpoint and Engine-backed repository; check readable data without frontend fixtures.
5. **Optional UI smoke:** feature API + create form, title-only, capability-conditioned worktree switch, refresh of Overview/Workspace.

## Creation and discovery matrix

| ID | Scenario | Expected |
| --- | --- | --- |
| C01 | CLI create in primary with Runtime off | One valid manifest; returned specId resolves |
| C02 | CLI create new worktree with Git enabled | Exactly one branch, linked worktree, registry binding, valid manifest |
| C03 | Git integration disabled + `new-worktree` | Structured capability failure; no branch, path or registry write |
| C04 | Only title given | Generated slug and identity, valid default scaffold |
| C05 | Repeat same operation ID | Exact same resource/result; no duplicate |
| C06 | Two specs in separate worktrees | Distinct roots; isolated uncommitted edits |
| C07 | Same specId manifest in main and bound worktree | One visible spec; bound worktree wins |
| C08 | Bound worktree removed out-of-band | Explicit unavailable/repair state; no silent primary fallback |
| C09 | Duplicate/conflicting binding or corrupt registry | Fail closed; no overwrite |
| C10 | CLI invoked from linked worktree | Resolves same project home and local registry |
| C11 | Another clone shares remote URL | Not implicitly adopted into same local project |
| C12 | Space/non-ASCII paths, branch exists, symlink substitution | Correct handling/explicit conflict; no wrong directory mutation |

## Concurrency and crash matrix

| ID | Scenario | Expected |
| --- | --- | --- |
| L01 | Two OS processes create same slug/branch simultaneously | One success and one explicit conflict; unique registry |
| L02 | Concurrent creates with distinct specs | Both persist; no lost JSON update |
| L03 | CLI finishes `start`, agent simulated still writing, Runtime tries same workspace | Claim blocks conflicting Engine writer after CLI exits |
| L04 | Separate worktrees concurrently claimed | Independent work can proceed |
| L05 | Wrong owner token/identity attempts finish/release | Refused; claim unchanged |
| L06 | Stale claim with unknown external agent outcome | Recovery-required; no auto-steal |
| L07 | Corrupt lock file | Fail closed and provide diagnostic |
| R01 | Kill after intent/reservation | Retry recovers or unwinds without duplicate |
| R02 | Kill after Git worktree create | Retry verifies and resumes; no second worktree |
| R03 | Kill after manifest before registry | Verified re-link to original spec ID |
| R04 | Kill after registry before response | Same result returned on retry |
| R05 | External file changes during recovery | Explicit conflict; no delete/overwrite |
| R06 | Runtime shutdown during managed operation | Own resource settles; external claims not confiscated |
| R07 | Process restarts with an interrupted workflow finish (later migration) | No duplicated stage or attempt |

## HTTP/observability and security

| ID | Scenario | Expected |
| --- | --- | --- |
| H01 | Offline CLI create then start Runtime and GET Overview/Workspace | Same canonical spec, correct root |
| H02 | HTTP create then stop Runtime and invoke CLI | Same manifest and registry visible |
| H03 | CLI modifies spec while Runtime runs | Backend refresh/invalidation exposes change without restart |
| H04 | Missing production source | Honest 503/unavailable, never demo fallback |
| H05 | Demo mode | No writes to production Git/registry |
| H06 | Unauthorized create/worktree request | 401/403 as relevant, zero side effects |
| H07 | External agent progresses Engine workflow | Workflow state visible, no fabricated managed Session |
| H08 | Invalid file/document ID or target path escapes workspace | Rejected without path disclosure/read/write |
| H09 | Scope-limited user accesses Session references in spec projection | Unauthorized Session data redacted/forbidden |

## Finalization/cleanup probes (later slice, design must accommodate)

| ID | Scenario | Expected |
| --- | --- | --- |
| F01 | Spec worktree integrated, clean, no active execution | Eligible for explicit cleanup |
| F02 | Dirty/unpushed/ambiguous operation | Cleanup blocked |
| F03 | Unmanaged/user-owned worktree | Never auto-deleted |
| F04 | Main branch checked out in primary | Finalize does not checkout same branch in linked worktree |
| F05 | Only archived spec copy remains in linked worktree | Cleanup refused until destination integration proven |

## Running and reporting

No concrete command names are prescribed until tests exist. Proposed categories: `engine:unit`, `engine:git-integration`, `engine:process-integration`, `runtime:integration` or equivalent using Turborepo/package scripts. CI should keep required checks stable and run affected packages. Mark tests explicitly skipped when Git executable/platform is unavailable rather than passing a fake.

Test reports should include OS, Git/Node versions, revision under test, per-ID PASS/FAIL/SKIP, reason for every skip and physical fixture cleanup result. Do not claim acceptance if required L/R/H tests are skipped.

## Exit criterion

All **foundation** tests C01–C12, L01–L07, R01–R06, H01–H08 must pass on the agreed supported OSes, with any scope exception explicitly approved. H09 and F01–F05 may be deferred only if their security/cleanup behavior is not exposed by the PoC. Later workflow R07 must pass before claiming workflow migration readiness.

Use [acceptance criteria](acceptance-criteria.md) for human-readable review gate and definition of done.
