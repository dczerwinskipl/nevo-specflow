---
id: ideas.specflow-engine.e1e2-hardening.q06
type: engineering
title: "Q06 Reusable real-process test support"
status: draft
scope: specflow
areas: [testing]
tags: [execution-task, temporary, hardening, fixtures]
read_when:
  - implementing or independently reviewing Q06 Reusable real-process test support
summary: "Consolidate process launch, barrier, termination and cleanup test plumbing while keeping real OS/Git behavior."
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
