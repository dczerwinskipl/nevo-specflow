---
id: ideas.specflow-engine.e1e2-hardening.q04
type: engineering
title: "Q04 Restore registry dependency direction"
status: draft
scope: specflow
areas: [workflow, testing]
tags: [execution-task, temporary, hardening, registry]
read_when:
  - implementing or independently reviewing Q04 Restore registry dependency direction
summary: "Remove specification-specific lifecycle orchestration from generic project registry infrastructure."
related:
  - ideas.specflow-engine.execution-plans
  - ideas.specflow-engine.plan-02
  - ideas.specflow-engine.test-plan
---

# Q04 — Correct Project Registry vs lifecycle ownership (F04)

**Depends on:** Q03 ACCEPT. **Run mode:** SOLO + independent review. **Risk:** MEDIUM. **Reference gate:** REQUIRED. **Merge gate:** owner decision.

## Evidence

[`project/registry-lifecycle.ts:13–112`](https://github.com/dczerwinskipl/nevo-specflow/blob/d3770c575b89a8e27e58e9bd468f9febacde2588/packages/specflow-engine/src/project/registry-lifecycle.ts#L13-L112) imports Specs shared-resource admission and owns Spec binding rebind/worktree retirement. This makes the low-level project layer depend on a business feature.

## Required change

- Move Specification-specific rebind/retire coordination, claim validation and associated proof ownership into `specs/lifecycle/`.
- Keep project-level registry types, strict format validation, physical workspace identity checks, ordinary append-only registration semantics, atomic writes and generic CAS constraints under `project/`.
- Avoid broad generic registry transaction interfaces unless two actual consumers require one. If a narrow low-level guarded write primitive is needed, define it with no Specs imports.
- Preserve source and primary workspace identity, binding generation/revision increments and exclusive resource reservations.

## Acceptance/proof

1. No `project/` file imports from `specs/` and no circular dependency introduced.
2. Real-Git source rebind followed by physical disposal and registry retirement has identical durable snapshots.
3. Stale registry revision, wrong binding generation, non-managed source, conflicting claims, swapped worktree and crash between CAS/removal are rejected without accidental deletion or fallback.
4. Existing Create registration behavior still enforces append-only rules; CLI and Runtime remain offline Engine consumers.
