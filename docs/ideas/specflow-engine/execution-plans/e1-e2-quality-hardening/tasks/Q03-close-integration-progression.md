---
id: ideas.specflow-engine.e1e2-hardening.q03
type: engineering
title: "Q03 Shared Close integration progression"
status: draft
scope: specflow
areas: [workflow, testing]
tags: [execution-task, temporary, hardening, lifecycle]
read_when:
  - implementing or independently reviewing Q03 Shared Close integration progression
summary: "Deduplicate common Close integration-phase dispatch while preserving distinct archive and conflict business outcomes."
related:
  - ideas.specflow-engine.execution-plans
  - ideas.specflow-engine.plan-02
  - ideas.specflow-engine.test-plan
---

# Q03 — Share verified Close integration progression (F01)

**Depends on:** Q02 ACCEPT. **Run mode:** SOLO + independent review. **Risk:** HIGH. **Reference gate:** REQUIRED. **Merge gate:** owner decision.

## Evidence

[`close-worktree.ts:36–91`](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/packages/specflow-engine/src/specs/lifecycle/close-worktree.ts#L36-L91) and [`close-specification.ts:114–198`](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/packages/specflow-engine/src/specs/lifecycle/close-specification.ts#L114-L198) repeat integration preparation relationship dispatch, candidate publication, verified integration, rebind and disposal with separate terminal proofs.

## Required change

- Implement a narrow internal `advanceCloseIntegration` / equivalent which accepts validated Close operation context and performs only the shared stages. Keep the flow readable in one place, with exhaustive stage/outcome handling and explicit side effects.
- Leave `closeSpecification` responsible for archive commit, primary/archive-only settlement, post-archive known-conflict disposition and canonical status.
- Leave `closeWorktree` responsible for worktree-specific non-archive result semantics; retain conflict requiring external resolution without falsely completing.
- Reuse current physical-proof helpers rather than weaken physical verification. Do not merge unrelated use cases or introduce a general workflow runtime.
- Maintain operationId idempotency and the rule that uncertain Git mutation is never automatically replayed.

## Acceptance/proof

- Both operations: already-integrated, clean fast-forward, divergent successful candidate, real scratch conflict, stale HEAD/branch, retries, source/target contamination and physical disposal.
- Primary and linked Specification archive-only and archive+integrate paths remain distinct and return the same externally observable outcomes as Q00.
- Physical interruption at each relevant journaled effect retains original ownership and does not double-commit, rebind or delete.
- One new focused test verifies equivalent shared phase/proof behavior for both Close kinds. Independent reviewer approves ownership boundaries and readability, not only green tests.
