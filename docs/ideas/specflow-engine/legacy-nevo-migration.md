---
id: ideas.specflow-engine.legacy-migration
type: engineering
title: Legacy Nevo migration — modules not yet ported
status: draft
scope: specflow
areas: [docs, workflow, runtime, cli, testing]
tags: [legacy-nevo, migration, architecture, workflow]
read_when:
  - porting gates, finalize, human verification, filesystem watching or batches from the old nevo repository
  - reviewing whether a legacy module may be copied or needs redesign
summary: >
  The legacy Nevo modules that have no SpecFlow owner implementation yet (gates and verify,
  commit-and-push and finalize, approve and verify-human, watcher and SSE invalidation, batches),
  with what to preserve, what to change and the checks a migration needs.
related:
  - ideas.specflow-engine
  - ideas.specflow-engine.ownership
  - ideas.specflow-engine.acceptance
  - ideas.specflow-engine.plan-06
  - ideas.specflow-runtime.ai-adapters
---

# Legacy Nevo migration — modules not yet ported

The migration source is the deterministic Task workflow in legacy `dczerwinskipl/nevo`. Specs
storage, identity, Git adapter, Create/Close, the Runtime Specs HTTP adapter, managed Sessions and
providers, and the workflow kernel (definitions, start/finish, readiness, step context, the finish
journal) already have SpecFlow owners; the kernel's port decisions are recorded in
[plan 06](execution-plans/06-workflow-kernel/README.md) §1. Reinspect the actual legacy source
before porting anything below.

## Modules still to port

| Old path                                                                                                                            | New owner                                                       | What to preserve                                                                     | What to change                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Gate contracts in `tools/specs/workflow/definitions/**`, `contracts.mjs` (command, markdown, human gates; `inspect()` / `verify()`) | Engine Workflow (plan 06 F03)                                   | Declarative gate contracts, the inspect/verify split, `failed` vs `blocked` taxonomy | Attempt-scoped evidence; `planFinish` refuses before any change while a gate is unsatisfied                                            |
| `tools/specs/workflow/actions/commit-and-push.mjs`                                                                                  | Engine Workflow action over the commit capability (plan 06 F04) | Fail-closed Git facts, scoped commit checks                                          | Engine-owned commit policy (ADR 0013/0016/0018), no direct cwd assumptions or implicit finalize checkout; stages in the finish journal |
| `tools/specs/approve/**`, `start/**`, `complete/**`, `verify/**`, `finalize/**`                                                     | Review against deterministic Engine operations                  | Relevant validation/PR evidence and user actions                                     | Do not port legacy lifecycle transitions as a second workflow mode                                                                     |
| `workflow verify-human --confirm` and human-verification file records                                                               | Engine human gate + local actor trust                           | Explicit human confirmation                                                          | Legacy records are **not** strong human identity proof; see [human gates](local-actor-and-human-gates.md)                              |
| `tools/dashboard/server/specs/watcher.mjs`, `events.mjs`                                                                            | Runtime observation/SSE                                         | Scoped filesystem invalidation                                                       | Watch registered roots, handle missing/replaced worktree, no source authority                                                          |
| Batch reservations, sequential continuation, remediation (`ai/orchestration/admission.mjs` and related, ~3 000 lines)               | Runtime orchestrator over Engine claims (plan 06 F01, F12)      | Explicit per-Task scope, staged invocation intent, unknown-outcome semantics         | Redesign, do not port the saga or the giant AgentSessionService                                                                        |

## Special caution: legacy finalize

Old `tools/specs/finalize/operation.mjs` checks out the base branch, commits the archive, merges the
PR and deletes branches. That sequence assumes a single mutable checkout and is not safe in a linked
worktree. Archive propagation and managed-worktree disposal are implemented by Close; a workflow
finalize must reuse them and add only workflow verification and remote PR integration.

## Special caution: batches and handover

One Session can execute an explicit Task batch sequentially, and handover requires an explicit new
execution intent; neither silently advances workflow or spawns an unrequested reviewer. Declared
`continuation: auto` transitions are the exception
([ADR 0019](../../architecture/decisions/0019-workflow-kernel-and-automatic-continuation.md)).

## Migration agent checklist

1. Read current `main` and the current architecture, then this **draft** dossier as candidate guidance.
2. Inspect the legacy implementation and tests; classify each part as domain operation, adapter,
   persistence, observer or provider lifecycle.
3. Identify all ambient `ROOT`, `process.cwd()`, mutable globals and cross-layer imports.
4. Locate the Engine-owned use case and ports; expose the same operation to CLI and HTTP without
   duplicated transition logic.
5. For every mutation, add competing-process tests and failure/restart recovery.
6. Include negative tests for no Runtime, stale claim, missing worktree, wrong actor and commit scope.
7. Label each module **port**, **refactor**, **replace**, **delete** or **defer**, with owner, source
   revision and regression proof.
8. Update normative docs/ADRs **after** the proof and explicit owner approval.
