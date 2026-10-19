---
id: ideas.specflow-engine.plan-02.task-17
type: engineering
title: 'E2.T17 — Plan 02 lifecycle crash, platform and security gate'
status: draft
scope: specflow
areas: [workflow, cli, runtime, testing]
tags: [execution-task, temporary, lifecycle-closure]
read_when:
  - implementing or reviewing E2.T17
summary: >
  Temporary Plan 02 task: Plan 02 lifecycle crash, platform and security gate.
related:
  - ideas.specflow-engine.plan-02
  - ideas.specflow-engine.specification-worktree-closure
  - ideas.specflow-engine.test-plan
---

# E2.T17 — Plan 02 lifecycle crash, platform and security gate

**Temporary task, documentation only.** Branch feature/specflow-engine-foundation / existing PR #53. No product implementation exists merely because this plan is present. This file must be removed with the entire temporary execution-plans tree before PR merge.

## Executable prerequisites

- E2.T10–E2.T16 accepted individually
- Independent architecture review of all close operations

Run mode: **SOLO / final independent gate**. No parallel writes to shared Git refs, registry schemas, journal/state files, authentication capability lists or runtime composition. Re-check HEAD and approved decisions DC01–DC18 before editing code.

## Modules and ownership

Engine test lifecycle real Git fixtures, OS-process SIGKILL workers; Runtime HTTP authorization/refresh; CLI separate-process suites; .github/workflows/engine-filesystem.yml only if platform coverage needs extending; docs test-plan and closure decisions evidence.

## Required behavior / exact acceptance

1. Execute mandatory LC01–LC40 (see test-plan) on Windows and POSIX as appropriate, reporting per platform Git/Node/OS versions, commit SHA, crash checkpoint, PASS/FAIL/SKIP and actual evidence. Do not substitute mocked Git for real Git or forcible OS-process termination for simulated exceptions: use SIGKILL on POSIX and an equivalent demonstrably abrupt OS termination on Windows.
2. Include OS-process concurrency on different Spec IDs attempting simultaneous PRIMARY archive/index commits, two linked sources targeting one development ref, and new Create versus overlapping Close; hold/release durable resource claims across crash. SIGKILL during primary candidate fast-forward must check partial HEAD, index and physical worktree rather than relying on ancestry. Verify each journal stage crash/unknown process, repeat same operationId and competing IDs, source/destination drift, archive commit recovery, integrate-before-CAS, CAS-before-remove, removal-before-retirement, and no accidental primary branch switch.
3. Verify primary/linked worktree close chains, stable specId, single canonical manifest, correct runtime refresh, correct authorization, automatic exactly-once SCOPED Engine archive commit (and no arbitrary user-data commits), no unmanaged/shared deletion. Verify that public schemas and journals do NOT invent exit-gate pass, fake no-evaluator acknowledgement, registry or external-writer proof.
4. Original FA01–FA12 remain independently satisfied; LC gate is an ADDITIONAL Plan 02 lifecycle gate and must be green before calling lifecycle complete. Future W/S/MI tests remain deferred.

## Required evidence

- Positive: cross-process end-to-end and OS-specific proof of all completed close outcomes
- Negative/no unintended effects: fault injections and unauthorized operations do not produce false success/duplicate effects; no mandatory skipped tests
- Report LC test IDs, test files, OS/Node/Git version for real filesystem/process work, PASS/FAIL/SKIP, modified public contracts, and an independent code-quality/recovery review. Mock-only tests do not satisfy Git/process cases.
- Checkpoint for this task: Final independent acceptance report, not self-review, and owner sign-off; temporary docs remain until final PR cleanup.
- Preserve completed E2.T01–T08; avoid unrelated refactors. No Plan 03 or Session dependency.


## E2.T17 evidence register (candidate links, not test PASS)

The acceptance criteria are LC01–LC40 in [test-plan](../../../test-plan.md).
Each link below identifies committed test code that a reviewer must inspect.
A test title or code link is NOT proof that it passed on the required OS.
The matrix is provisionally mapped against the 2026-10-19 candidate at
`72a2c326cb9f6fcb191c6195d3fa1050e4d89e53` plus the positive LC33
test being added in the same commit as this register.

### Code-level evidence by required case

- **LC01 (Both)**: [close-worktree-lifecycle.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-worktree-lifecycle.test.ts). managed worktree integration and disposal.
- **LC02 (Both)**: [close-worktree-lifecycle.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-worktree-lifecycle.test.ts). worktree close followed by primary spec close.
- **LC03 (Both)**: [close-specification-lifecycle.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-specification-lifecycle.test.ts). linked archive, integrate, rebind, remove.
- **LC04 (Both)**: [close-specification-lifecycle.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-specification-lifecycle.test.ts). primary archive and scoped commit.
- **LC05 (Both)**: [close-worktree-lifecycle.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-worktree-lifecycle.test.ts). canonical identity and binding across close.
- **LC06 (One)**: [create-cross-transport.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow/test/create-cross-transport.test.ts). warm Runtime reads after independent CLI close.
- **LC07 (Both)**: [git-integration-proof.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/git-integration-proof.test.ts), [close-worktree-lifecycle.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-worktree-lifecycle.test.ts). checked-out fast-forward and branch stability.
- **LC08 (Both)**: [git-integration-proof.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/git-integration-proof.test.ts). already-integrated ancestry plus physical checks.
- **LC09 (Both)**: [git-integration-proof.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/git-integration-proof.test.ts). conflicted scratch keeps primary clean.
- **LC10 (Both)**: [git-integration-proof.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/git-integration-proof.test.ts), [lifecycle-admission.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/lifecycle-admission.test.ts). wrong branch and source/target HEAD drift.
- **LC11 (Both)**: [lifecycle-admission.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/lifecycle-admission.test.ts). modified, staged and untracked linked source.
- **LC12 (Both)**: [lifecycle-admission.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/lifecycle-admission.test.ts). modified, staged and untracked primary.
- **LC13 (Both)**: [lifecycle-admission.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/lifecycle-admission.test.ts), [close-worktree-lifecycle.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-worktree-lifecycle.test.ts). primary/unmanaged/foreign worktree protections.
- **LC14 (Both)**: [lifecycle-admission.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/lifecycle-admission.test.ts). second canonical linked occupant.
- **LC15 (Both)**: [lifecycle-admission.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/lifecycle-admission.test.ts). missing/invalid/duplicate/symlinked manifest.
- **LC16 (Both)**: [close-worktree-lifecycle.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-worktree-lifecycle.test.ts). instance marker and path substitution.
- **LC17 (Both)**: [close-process-contention.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-process-contention.test.ts). distinct-spec OS-process and Create vs Close races.
- **LC18 (Both)**: [lifecycle-admission.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/lifecycle-admission.test.ts), [close-specification-lifecycle.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-specification-lifecycle.test.ts). operationId idempotency and changed intent.
- **LC19 (Both)**: [close-sigkill.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-sigkill.test.ts), [archive-close.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/archive-close.test.ts). OS kill before/after atomic move and recovery.
- **LC20 (Both)**: [close-sigkill.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-sigkill.test.ts). OS kill after actual archive commit.
- **LC21 (Both)**: [close-sigkill.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-sigkill.test.ts), [git-integration-proof.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/git-integration-proof.test.ts). live Git process kill, torn HEAD/index, completed publication.
- **LC22 (Both)**: [close-sigkill.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-sigkill.test.ts), [close-worktree-lifecycle.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-worktree-lifecycle.test.ts). OS kill after CAS, after intent and after Git removal.
- **LC23 (Both)**: [close-sigkill.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-sigkill.test.ts), [git-integration-proof.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/git-integration-proof.test.ts). uncertain actual Git subprocess and no blind replay.
- **LC24 (One)**: [close.http.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-runtime/test/specs/close.http.test.ts), [close-specification-lifecycle.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-specification-lifecycle.test.ts). reject nonexistent gate/process fields; authorized close.
- **LC25 (One)**: [close.http.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-runtime/test/specs/close.http.test.ts), [git-integration-proof.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/git-integration-proof.test.ts). separate project Git permission and protected configuration.
- **LC26 (Both)**: [close-worktree-lifecycle.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-worktree-lifecycle.test.ts), [archive-close.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/archive-close.test.ts). spaced, Unicode and literal Git path handling.
- **LC27 (Both)**: [close-specification-lifecycle.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-specification-lifecycle.test.ts). archived retry without duplicate commit.
- **LC28 (One)**: [create-cross-transport.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow/test/create-cross-transport.test.ts), [close.http.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-runtime/test/specs/close.http.test.ts). same CLI/HTTP operation ID and read freshness.
- **LC29 (Both)**: [close-worktree-lifecycle.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-worktree-lifecycle.test.ts). ignored files block disposal.
- **LC30 (Both)**: [create-journal-contract.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/create-journal-contract.test.ts), [create-crash-recovery.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/create-crash-recovery.test.ts). current Create journal and crash recovery.
- **LC31 (Both)**: [git-integration-proof.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/git-integration-proof.test.ts). other Specification source diff is rejected.
- **LC32 (Both)**: [archive-close.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/archive-close.test.ts), [close-specification-lifecycle.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-specification-lifecycle.test.ts). pre-archive versus integrated archive SHA.
- **LC33 (Both)**: [close-sigkill.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-sigkill.test.ts). killed stage, alien index rejection and exact operator settlement.
- **LC34 (One)**: [create-journal-contract.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/create-journal-contract.test.ts), [durable-create.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/durable-create.test.ts). canonical scaffold and no workflow-mode alternate.
- **LC35 (Both)**: [create-journal-contract.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/create-journal-contract.test.ts), [lifecycle-admission.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/lifecycle-admission.test.ts). single canonical manifest; symlink/alias rejection.
- **LC36 (Both)**: [create-journal-contract.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/create-journal-contract.test.ts), [create-crash-recovery.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/create-crash-recovery.test.ts), [durable-create.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/durable-create.test.ts). single-format journal, tamper checks and SIGKILL.
- **LC37 (Both)**: [close-specification-lifecycle.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-specification-lifecycle.test.ts), [lifecycle-admission.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/lifecycle-admission.test.ts). configured target and primary branch check.
- **LC38 (Both)**: [close-specification-lifecycle.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-specification-lifecycle.test.ts). archive-only linked and later explicit worktree close.
- **LC39 (Both)**: [close-process-contention.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-process-contention.test.ts), [git-integration-proof.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/git-integration-proof.test.ts), [close-sigkill.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/close-sigkill.test.ts). two target contenders, owner SIGKILL, physical publication.
- **LC40 (Both)**: [archive-close.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/archive-close.test.ts), [git-integration-proof.test.ts](https://github.com/dczerwinskipl/nevo-specflow/blob/feature/specflow-engine-foundation/packages/specflow-engine/test/git-integration-proof.test.ts). post-archive conflict, retained binding and recovery.

### Execution evidence required before independent review

- **Status:** NOT VERIFIED on the latest commit. Do not promote any row to
  PASS based solely on its test implementation or an older green run.
- **Full filesystem/lifecycle matrix:** [Temporary T17 Platform Gate](https://github.com/dczerwinskipl/nevo-specflow/actions/workflows/temporary-t17-platform-gate.yml),
  with real Git, real OS processes and Runtime/CLI suites on Linux, macOS,
  and Windows. Record exact commit SHA and OS/Node/Git versions from the
  `Toolchain` step for each platform and link the matching successful run.
- **Standard quality:** [CI](https://github.com/dczerwinskipl/nevo-specflow/actions/workflows/ci.yml),
  CodeQL and format check must all finish green on that same exact HEAD.
  The earlier Quality run on `4d69b2c` failed on a syntax error in LC33 and
  formatting in separate test files; its result does not establish gate status.
- **Required assertions:** no mandatory skipped tests, no duplicate Git effects,
  exact HEAD/index/physical files after publication, registry CAS at most once,
  durable ownership retained after unknown process outcomes, and correct
  canonical binding for each successful close.
- **Crash checkpoint interpretation:** LC19 tests both sides of an atomic
  filesystem rename; no externally observable mid-rename barrier exists.
  LC22 explicitly requires kill after CAS and after worktree deletion; it
  does not mandate an artificial pause inside `git worktree remove`.
  LC21 separately kills a real running Git child. These distinctions are not
  waivers for missing mandatory cases.
- **LC33 scope:** after killing at exact scoped staging, an incomplete Git
  commit remains uncertain. No automatic replay is authorized. The new
  positive case reconciles only after deliberate, independently verifiable
  exact scoped operator settlement; the existing negative case rejects an
  alien staged entry. Both require green cross-platform execution.
- **Independent review:** only after completed results with per-case PASS/FAIL/
  SKIP and logs may a separate reviewer decide ACCEPT or REQUEST CHANGES.
  Keep this task provisional, PR open, and the execution-plans tree intact.

## Sources

- [Plan 02](../README.md)
- [Close architecture](../../../specification-and-worktree-close-design.md)
- [Decisions needing approval](../../../specification-close-decisions.md)
- [Lifecycle test matrix](../../../test-plan.md)

- LC17 covers inter-spec/ref/index/Create-close conflicts, not just same-spec operation IDs; LC39 covers two source integrations racing for one primary target and SIGKILL during candidate publication. LC21 checks HEAD+index+physical tree concordance following a crash after Git publication initiation. Platform evidence required.
