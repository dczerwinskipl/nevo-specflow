---
id: ideas.specflow-engine.e1e2-hardening.q06
type: engineering
title: 'Q06 Reusable real-process test support'
status: draft
scope: specflow
areas: [testing]
tags: [execution-task, temporary, hardening, fixtures]
read_when:
  - implementing or independently reviewing Q06 Reusable real-process test support
summary: 'Consolidate process launch, barrier, termination and cleanup test plumbing while keeping real OS/Git behavior.'
related:
  - ideas.specflow-engine.execution-plans
  - ideas.specflow-engine.plan-02
  - ideas.specflow-engine.test-plan
---

# Q06 — Shared process/crash test harness (F07)

**Depends on:** Q05 ACCEPT. **Run mode:** SOLO + test-design review. **Risk:** MEDIUM. **Reference gate:** REQUIRED. **Merge gate:** owner decision.

## Evidence

- [`close-sigkill.test.ts:135–214`](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/packages/specflow-engine/test/close-sigkill.test.ts#L135-L214) launches a child Vitest, polls a signal marker, kills PID and collects diagnostics.
- [`close-process-contention.test.ts:100–240`](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/packages/specflow-engine/test/close-process-contention.test.ts#L100-L240) repeats launcher/barrier logic.
- [`create-crash-recovery.test.ts:80–172`](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/packages/specflow-engine/test/create-crash-recovery.test.ts#L80-L172) carries another variant.
- [`test/support/git-project.ts`](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/packages/specflow-engine/test/support/git-project.ts) currently provides only minimal real-Git fixture creation.

## Required change

- Add focused `test/support/` helpers for spawning an independently identified process, PID/assertable checkpoint, ready/release barrier, bounded wait, abrupt OS termination, stdout/stderr capture, await/reap and deterministic cleanup.
- Port **two suites first**, verify unchanged scenario semantics and diagnostics, then migrate the other duplicated launchers in a separate sub-checkpoint within Q06.
- Keep each suite's actual Git topology, journal checkpoints, expectations and failure consequences local. Do not hide semantic scenarios behind one monolithic helper or weaken negative assertions.
- Make Windows termination behavior explicit and physically observable, not a simulated exception. Avoid timing sleeps as the sole signal of success; use causal barriers where possible.

## Acceptance/proof

- Same OS-process contention and actual abrupt termination evidence on Linux/macOS/Windows before/after; prove PID differs, checkpoint is reached, killed worker did not produce success and no unintended Git/rebind/disposal effects occur.
- Deliberate child hang, exit failure and invalid marker produce actionable failure logs and no orphan child/worktree. Cleanup does not silently mask a failed test.
- Compare number and meaning of independently covered scenarios against Q00; no mandatory LC coverage disappears.

## Implementation checkpoint — first two real-process suites

The new `test/support/process-worker.ts` owns OS child launching, bounded
marker waits, merged stdout/stderr diagnostics, real PID-directed `SIGKILL`,
nonzero termination verification and deterministic supervisor cleanup.

`close-sigkill.test.ts` now uses these helpers for the durable checkpoint
kill-and-reap path. `close-process-contention.test.ts` uses the same real
child launcher for both Close and paused Create workers, and the same causal
file-marker barrier. The suites still own their Git topology, control file
signals, registry/lock assertions, and exact recovery proof cases. No mock Git
or simulated exception replaces an OS process.

The other pre-existing launcher variants are deferred to the second Q06
sub-checkpoint, after the first two suites pass in three-OS real-process CI.
There is no release/merge claim before those results. Check negative cases
(invalid marker, abnormal child exit, timeout, cleanup without orphan process)
as part of independent test review; no scenario is removed to shorten CI.

## Independent-review follow-up: process failure hardening

The shared worker helper now races each causal checkpoint against a _real_
early child exit, validates the marker's stage/operation/PID, and supports
bounded OS termination **and reap**, rather than an unobserved kill alone.
Negative tests use actual child OS processes for premature exit, orphan cleanup,
and explicit timeout, plus malformed/forged checkpoint file evidence.
`create-crash-recovery` and `create-multiprocess` now use the common launcher
in addition to Close SIGKILL/contention. The low-level Git filter/child test
remains scenario-specific (actual Git smudge child and independent PID), not
silently converted to a mocked fixture. Physical crash/recovery expectations
remain local to each existing suite and mandatory in final three-OS evidence.
