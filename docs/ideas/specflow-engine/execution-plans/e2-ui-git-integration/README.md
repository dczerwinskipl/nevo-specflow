---
id: ideas.specflow-engine.plan-02-ui-git-integration
type: engineering
title: Temporary E2 follow-up — Create options, integration targets, shared worktrees
status: draft
scope: specflow
areas: [workflow, runtime, cli, testing]
tags: [execution-plan, temporary, e2, worktree, integration]
read_when:
  - implementing the three E2 integration follow-up tasks before UI wiring
summary: >
  Three separately reviewed E2 extension tasks for a read-only create-options projection,
  per-worktree integration targets, and safe shared-worktree lifecycle.
related:
  - ideas.specflow-engine.plan-02
  - ideas.specflow-engine.execution-plans
---

# E2 integration follow-up (temporary) — I01–I03

This is a disposable **implementation plan**, not a new normative architecture or a user-facing Specification. Work on the current PR #53 branch `feature/specflow-engine-foundation`; **do not create per-task PRs** or reopen E1/E2 Q00–Q07 refactors. Preserve E2.T01–T17 acceptance/regression evidence by rerunning affected checks after implementation. Like all other execution plans, remove this directory before the final PR #53 merge and promote only reviewed architectural decisions into durable documentation.

## User scenarios and vocabulary

- **Start from / base ref**: a local Git commit/ref used to create a new working branch. Selecting `feature/x` as the base does **not** automatically imply merging back to `feature/x`.
- **Working branch**: branch checked out in a new or existing physical worktree.
- **Integrate into / integration destination**: a separate, explicitly verified **workspace-owned** destination. New worktrees may select it; existing worktrees inherit it. Never let individual Specs silently disagree about the destination of their shared branch.
- **Primary workspace**: the verified Project Home checkout. Creating there never switches its branch.
- **Shared worktree**: multiple canonical Spec IDs may bind to one registered checkout. Creating Specs there is already supported; E2 Close preflight currently blocks even archive-only close when another Spec is bound.

Three mandatory scenarios: (A) create from project default base, integrate to project default; (B) create a new source worktree from `feature/x`, integrate back into a verified `feature/x` checkout, without switching primary; (C) bind three Specs to one linked worktree, archive one without affecting the other two, then integrate/retire the worktree as an explicit workspace-level action.

## Tasks and dispatch

| Task | Scope | Depends on | Dispatch |
| --- | --- | --- | --- |
| [E2.I01 — Create options read API](tasks/I01-create-options.md) | Read-only Engine/Runtime candidate options | E2.T17 + architecture hardening HEAD | Solo; may implement independently of I02's private design |
| [E2.I02 — Workspace-owned integration destination](tasks/I02-workspace-integration-target.md) | Explicit destination for new managed worktrees and safe non-primary integration | I01's agreed selection contract and current Close invariants | Solo, independent architecture/recovery review |
| [E2.I03 — Shared-worktree lifecycle](tasks/I03-shared-worktree-lifecycle.md) | Spec archive independently; whole-workspace integration, multi-binding rebind and removal | I02 accepted implementation | Solo; **not parallel with I02** |

Each task must leave the repository buildable and show tests (PASS/FAIL/SKIP), precise changed contracts, Git/OS versions, known limitations and owner-review questions. The next dependent task starts after the prior task's reviewed invariants are stable, not merely after the last commit.

## Design guardrails

1. Reuse Engine's canonical `createSpecificationFromRequest`, durable Create, verified Project Home, registry, Git capability, shared-resource claims and Close journals; no Runtime/CLI-owned Git mutations or status copies.
2. No raw caller paths, automatic checkout switch, unregistered/unverified destination, speculative remote ref fetch, push/PR creation, destructive cleanup, force checkout/merge or blind stale-claim takeover.
3. Scope permissions correctly: project Create for create-options and Create; project Git Integrate for integration plus relevant authorized Spec/workspace checks. Never disclose unauthorized Specs, filesystem roots or diagnostic journal internals.
4. Preserve idempotency, one original operation intent per `operationId`, CAS, immutable target selection and physical evidence. Existing incomplete journals/retries and current single-Spec operations must be handled explicitly. Unknown Git outcomes fail closed with actionable recovery.
5. Existing worktree selection does **not** create a branch or change the target. A base ref is not the integration destination.
6. Archive-only on a shared linked checkout must keep all bindings and the worktree. A whole-branch integration must be visibly a **workspace** operation, not presented as a one-Spec merge.
7. Do not add Workflow/Task/Session/Turn/E3 gates or depend on Runtime provider state. UI implementation remains a separate follow-up.

## Review gates

- **I01:** authorized HTTP read is accurate, sanitized, non-mutating, and does not promise a future mutation will succeed.
- **I02:** real Git validates feature-to-feature target, locks source and destination, recovers/preserves both on failed/uncertain publication, verifies exact target/ref/bind, retains existing default behavior.
- **I03:** two/three Specs share a worktree, individual archive-only works, integrating/retiring the worktree preserves all IDs/content/status and never deletes a workspace while any binding remains; crash/retry exact-effects tests on Windows + POSIX.

At completion rerun relevant Engine/Runtime/CLI suites, original FA/LC coverage and the existing Q00–Q07 CI transport/harness checks. Cross-OS real-Git lifecycle/crash evidence is mandatory before final acceptance.
