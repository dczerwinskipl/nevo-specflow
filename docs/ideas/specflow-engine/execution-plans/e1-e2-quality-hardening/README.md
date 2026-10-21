---
id: ideas.specflow-engine.e1e2-hardening
type: hub
title: 'E1/E2 architecture and code-quality hardening'
status: draft
scope: specflow
areas: [workflow, runtime, cli, testing]
tags: [execution-plan, temporary, architecture, hardening]
read_when:
  - planning the audited E1/E2 architecture quality hardening
summary: 'Temporary post-audit implementation plan for structural E1/E2 improvements, with independent checkpoints and exact-sha verification.'
related:
  - ideas.specflow-engine.execution-plans
  - ideas.specflow-engine.plan-02
  - ideas.specflow-engine.test-plan
---

# E1/E2 architecture and code-quality hardening

**Purpose:** address the independent architecture audit of [PR #53](https://github.com/dczerwinskipl/nevo-specflow/pull/53), without extending E2 functionality or re-opening T17 crash/recovery work. The source audit is pinned to [`d3770c575b89a8e27e58e9bd468f9febacde2588`](https://github.com/dczerwinskipl/nevo-specflow/commit/d3770c575b89a8e27e58e9bd468f9febacde2588), prior to the history-only squash to `abada44cd32d78a58cb533c5f815fe1ab8149de0`. The tree of the squash commit is identical to the audited implementation tree. Future implementers **must re-check the actual working HEAD**, because audit links and test results are commit-specific.

**Status:** Q00–Q04 implemented, code-reviewed, and supported by exact-SHA three-OS lifecycle evidence on `9c92e4c4`. The Q00–Q04 Quality formatting fix passed on `f607fd3`. Q05 is implemented as an Engine-owned CLI/HTTP projection candidate (`f0b56dd` / `ca45044`); Q06 has completed the first two process-harness suite ports (`4f0cfaa`) with further launcher consolidation deferred pending real-OS evidence; Q07 permanent policy is a CI-review candidate (`ff09e8c`). **Q05–Q07 are not ACCEPT until exact-final-HEAD Quality, relevant three-OS regressions, and independent review pass.** Owner selects merge blockers. This is a disposable plan, removed before merge; persist unresolved follow-ups such as [P2 Project Home control-lock subprocess](https://github.com/dczerwinskipl/nevo-specflow/issues/73) outside this tree.

## Separate decision gates

- **Functional/T17 acceptance** covers LC01–LC40, real crash/process recovery and exact-HEAD platform evidence; it is a separate ongoing track. Do not mark it accepted or modify T17 tests just to satisfy this plan.
- **Architecture/reference-quality acceptance** resolves Q01–Q07 or documents an independently reviewed equivalent; preserves every known E1/E2 safety invariant and requires a fresh independent architecture/code/test re-review.
- **Merge decision** belongs to the owner. This audit found no independently confirmed new P0/P1 in its reviewed architectural paths. Its P2 findings do not automatically block merge, but **do** block unqualified reuse as the reference implementation.
- **Deferred P3 (Q08)** is not a default merge/reference gate absent concrete measured impact.

## Tasks and dependencies

| Task                                                                                   | Finding(s) | Dependency                     | Risk           | Outcome / gate                 |
| -------------------------------------------------------------------------------------- | ---------- | ------------------------------ | -------------- | ------------------------------ |
| [Q00 Baseline and behavioral characterization](tasks/Q00-baseline-and-contracts.md)    | All        | T17 scope fixed; verified HEAD | Low            | Required input for all changes |
| [Q01 Pure Close journal codec](tasks/Q01-close-journal-codec.md)                       | F02        | Q00                            | Medium         | P2, reference gate             |
| [Q02 Consistent Close CAS checkpoint](tasks/Q02-close-checkpoint-cas.md)               | F03        | Q01                            | High           | P2, reference gate             |
| [Q03 Shared Close integration progression](tasks/Q03-close-integration-progression.md) | F01        | Q02                            | High           | P2, reference gate             |
| [Q04 Registry dependency direction](tasks/Q04-registry-ownership.md)                   | F04        | Q03                            | Medium         | P2, reference gate             |
| [Q05 Stable operation read models](tasks/Q05-public-operation-projections.md)          | F05        | Q04                            | Medium         | P2, reference gate             |
| [Q06 OS process test harness](tasks/Q06-process-test-support.md)                       | F07        | Q05                            | Medium         | P2, reference gate             |
| [Q07 Permanent PR smoke and platform policy](tasks/Q07-ci-test-policy.md)              | F06        | Q06                            | Medium CI risk | P2, reference gate             |

**Default execution:** SOLO checkpoint per task, one implementation slice and one independent review before continuing. Q01–Q04 touch closely coupled Engine state and MUST remain sequential. Q05 changes transport contracts, so review CLI/HTTP together. Q07 comes after Q06 so new harness behavior is validated by permanent gates. No parallel writers to lifecycle, registry, Git, CI workflows or test fixtures.

## Q00 implementation evidence

[Q00 pinned behavioral baseline](Q00-baseline.md) and the associated
`packages/specflow-engine/test/quality-hardening-q00-journals.test.ts`
characterize current Create/Close validation and contract consumers.
Q00–Q04 have independent code review and three-OS full lifecycle evidence on
`9c92e4c4`; previous pending status is superseded. Current Quality must still
be repaired and re-run on a fresh HEAD before the next acceptance checkpoint.

The Engine has not been merged or released. **No backward compatibility,
format migration, old-version aliases, or adapter shims are required.**
Characterization is not approval of accidental parser laxity. An intentional
pre-release tightening must be documented, reviewed and tested, not treated
as a legacy compatibility obligation.

## Scope boundaries and behavior preservation

1. Offline Engine, same canonical `specification.yaml`, same stable Spec/Project Home/workspace identities, no implicit primary fallback.
2. Treat current Create/Close journal formats as a **comparison baseline, not a compatibility contract**. Deliberate, reviewed changes to format, version, stages and internal APIs are permitted without migrations or adapters for unreleased E1/E2. Preserve fail-closed validation, durable intent, CAS, idempotency and safe recovery.
3. Keep durable intent **before** every Git/filesystem effect, and preserve unknown-outcome fencing; do not automatically replay uncertain Git.
4. Preserve Project Home short control lock, journal CAS, shared-resource reservations and protected registry generations. Never run Git subprocesses inside a control lock.
5. Verify physical Git HEAD, index, worktree, immutable branch refs and management identity before successful recovery, integration, rebind or disposal.
6. Preserve project-wide Git integration authorization, CLI/Runtime shared Engine mutation owner, and the distinction between archive-only linked and integrated outcomes.
7. No simulated workflow exit gates, Sessions/Attempts or external writer evidence. No agent/provider runner work.
8. Do not replace real Git, OS process termination or filesystem integration tests with mocks merely to shorten CI.

## Task acceptance report (mandatory per checkpoint)

Capture: **before/after exact SHAs; files and contract impact; architectural rationale; focused tests with command, OS/Node/Git versions and PASS/FAIL/SKIP; resulting durable state/generation/side effects; new risks and deferred follow-ups**. Distinguish independently executed tests from inherited CI. For Q01–Q04 and Q06, include full Engine filesystem/crash regression on relevant OS before independent acceptance, not merely typecheck.

**No work in this track may alter an already accepted behavior solely to make a refactor easier.** On a discovered correctness defect, record it separately and have the owner decide whether it belongs to the existing functional/T17 track.

## Promotion and cleanup

Only after Q00–Q07 are independently accepted (or deliberately waived with rationale), real three-OS regressions pass on an exact final SHA, API snapshots are checked, and the owner signs off may E1/E2 be declared **reference-quality**. A green pipeline alone is not approval. Preserve this backlog outside the temporary tree or resolve it before the existing program cleanup removes `execution-plans/`.

## Follow-up architecture risk — Project Home control lock (P2, separate)

The existing `project/control-lock.ts` calls `assertCurrentProjectHome(context)`
after acquiring the exclusive control-lock file. That revalidation calls
`resolveProjectHome`, which performs Git worktree inspection. The issue
predates Q02 and is **not** a Q02 regression or Q05 contract change.

**Proposed separate fix (not implemented in Q05):** before claiming the lock,
obtain a verified immutable Project Home/Git identity snapshot using Git.
After obtaining the lock, recheck ownership and path/marker/git-instance
identity strictly via bounded filesystem reads (`lstat`, `realpath`,
marker contents and pinned resolved paths), with no Git subprocess. On a
mismatch, fail closed and retain the existing lock recovery/ownership rules.
Confirm separately that worktree membership changes between the pre-lock
snapshot and the guarded mutation cannot bypass the resource/registry CAS;
prove this with race, substituted marker/path and process termination tests.
Do not weaken pre- and post-lock authority checks merely to remove Git cost.

## Deferred Q08, not an implementation mandate

- **F08:** profile resource admission with 0/100/1,000/5,000 historical journals before considering a verified active-claims index; never add a competing durable source of truth speculatively.
- **F09:** keep fault-injection callbacks internal; if a future module needs them, establish one clear convention without weakening actual SIGKILL testing.
- **F10:** retain internal `Error.cause` and context in scratch failure diagnostics while returning sanitized public error codes.

## Immutable evidence

- [A–E audit findings background](https://github.com/dczerwinskipl/nevo-specflow/pull/53) and specific [source evidence](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/packages/specflow-engine/src/specs/lifecycle/journal-store.ts).
- [T17 LC case requirements](../02-specifications-git-workspaces/tasks/T17-lifecycle-recovery-regression.md), [LC test plan](../../test-plan.md) and [program temporary-plan removal gate](../README.md).
