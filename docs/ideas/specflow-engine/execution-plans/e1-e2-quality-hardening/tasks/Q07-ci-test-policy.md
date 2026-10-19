---
id: ideas.specflow-engine.e1e2-hardening.q07
type: engineering
title: 'Q07 Permanent Engine CI smoke and full-regression policy'
status: draft
scope: specflow
areas: [testing, release]
tags: [execution-task, temporary, hardening, ci]
read_when:
  - implementing or independently reviewing Q07 Permanent Engine CI smoke and full-regression policy
summary: 'Make real-Git Engine and CLI/HTTP smoke a reliable recurring PR signal, preserving full cross-platform crash gates.'
related:
  - ideas.specflow-engine.execution-plans
  - ideas.specflow-engine.plan-02
  - ideas.specflow-engine.test-plan
---

# Q07 — Permanent, sustainable Engine test gates (F06)

**Depends on:** Q06 ACCEPT. **Run mode:** SOLO + CI review. **Risk:** MEDIUM CI/platform. **Reference gate:** REQUIRED. **Merge gate:** owner decision.

## Evidence

[`ci.yml:65–120`](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/.github/workflows/ci.yml#L65-L120) runs only three Engine unit-test files on ordinary PRs and defers CLI/Runtime; [`engine-filesystem.yml`](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/.github/workflows/engine-filesystem.yml) runs full platform tests after merge/nightly/manual. A temporary branch-specific T17 gate currently compensates; this must not be the long-term standard.

## Required change

- Permanent PR lane for affected Engine/lifecycle changes: pure unit + selected **real-Git/filesystem** smoke on Linux, plus targeted CLI/HTTP Engine composition and contract smoke. Jobs must be represented by stable required checks and not silently skipped on relevant changes.
- Preserve full Windows/macOS/Linux crash/concurrency integration in schedule/on-demand and as an explicit exact-SHA **promotion/premerge verification** for sensitive lifecycle, registry, Git subprocess and state-contract changes. Do not run all SIGKILL tests on unrelated UI PRs.
- Bound process worker count, discoverability and failure diagnostics; ensure test scripts/filenames are explicit. Record Node, Git, OS versions and exact commit SHA in platform proof.
- Only remove `temporary-t17-platform-gate.yml` after replacement has proven equivalent coverage and the still-active T17 work is coordinated with its owner. Do not weaken an in-progress T17 verification gate.
- No removal of real crash tests, fixture-only substitution or optimistic PASS based on previous HEAD.

## Acceptance/proof

- A representative Engine PR triggers required real FS/Git smoke; an intentional failing case fails the aggregate gate. CLI/Runtime adapters trigger contract smoke when affected.
- Full workflow is invocable by SHA or documented pinned checkout; confirm success and skips with separate results on Windows, macOS and Linux.
- Positive and negative CI routing tests show main/nightly/full are not accidentally cancelled or treated as PR unit-only substitutes.
- Final independent reviewer verifies coverage (not merely green checks), runtime cost, and that T17 remains independently gated.
