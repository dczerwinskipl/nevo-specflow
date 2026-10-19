---
id: ideas.specflow-engine.e1e2-hardening.q02
type: engineering
title: "Q02 Consistent Close checkpoint CAS"
status: draft
scope: specflow
areas: [workflow, testing]
tags: [execution-task, temporary, hardening, cas]
read_when:
  - implementing or independently reviewing Q02 Consistent Close checkpoint CAS
summary: "Centralize the narrow Close journal CAS publication convention without moving Git effects under the project control lock."
related:
  - ideas.specflow-engine.execution-plans
  - ideas.specflow-engine.plan-02
  - ideas.specflow-engine.test-plan
---

# Q02 — One auditable Close checkpoint publication convention (F03)

**Depends on:** Q01 ACCEPT. **Run mode:** SOLO + independent safety review. **Risk:** HIGH. **Reference gate:** REQUIRED. **Merge gate:** owner decision.

## Evidence

Similar but not identical implementations currently live in:
- [`archive-effects.ts:120–138`](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/packages/specflow-engine/src/specs/lifecycle/archive-effects.ts#L120-L138)
- [`git-publication.ts:50–70`](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/packages/specflow-engine/src/specs/lifecycle/git-publication.ts#L50-L70)
- [`git-scratch.ts:163–191`](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/packages/specflow-engine/src/specs/lifecycle/git-scratch.ts#L163-L191)
- [`worktree-disposal.ts:67–85`](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/packages/specflow-engine/src/specs/lifecycle/worktree-disposal.ts#L67-L85).

## Required change

- Implement one **Close-specific** internal compare-and-publish function for a journal checkpoint: verify pinned expected journal, relevant registry/config revision and caller-provided side-effect proof eligibility; publish atomically under Project Home lock; reread and verify.
- Enumerate which existing per-phase validations occur **before** the lock and which must be repeated inside it. Preserve meaningful stronger checks; never silently weaken a caller.
- Keep physical Git, filesystem mutation and long-running process waits **outside** the lock. A successful CAS does not imply a successful physical effect.
- Do not build a generic transaction engine, expose new public effect callbacks or change journal schema/stages.

## Acceptance/proof

- Every previous stale-CAS, changed policy/registry, substituted checkout, resource contention, readback failure and unknown Git result remains rejected with no unapproved side effect.
- One-winner cross-process publication, lock reentrancy/deadlock checks and deterministic recovery after crash before/after durable intent.
- Existing Close, archive, divergent/conflict, rebind and physical SIGKILL tests pass on relevant platforms.
- Independent reviewer verifies no Git/process calls execute inside the control-lock critical section, and exactly-once effects are not inferred from journal stage alone.
