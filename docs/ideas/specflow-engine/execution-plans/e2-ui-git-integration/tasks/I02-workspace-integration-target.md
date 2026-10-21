---
id: ideas.specflow-engine.plan-02-ui-git-integration.I02
type: engineering
title: E2.I02 — Per-worktree integration destination and safe Git publication
status: draft
scope: specflow
areas: [workflow, runtime, cli, security, testing]
tags: [execution-task, temporary, e2, solo-review]
read_when:
  - implementing E2.I02 after I01
summary: >
  Allow a new managed worktree to select and durably retain a verified integration
  destination other than the Project Home checkout, with same-level Git safety and recovery.
related:
  - ideas.specflow-engine.plan-02-ui-git-integration
---

# E2.I02 — Workspace-owned integration destination

**Mode:** SOLO, mandatory architecture review after implementation. **Dependency:** I01 selection contract. **Do NOT parallelize with I03** (same Close/Git/registry/recovery owners). Existing PR #53, no new PR.

## Problem and fixed semantics

Today `baseRef` chooses where a new worktree branch **starts**; `git.integrationTargetBranch` in Project Home config chooses the **sole close destination**, and the current Close preflight requires primary to be checked out there. User needs a new `spec/y` source worktree *from* `feature/x` to be integrated *into* `feature/x`, even if `feature/x` is checked out in another **registered, verified** linked worktree.

Keep **three distinct concepts**: base ref, working branch, integration destination. Destination is **workspace-owned**; Specs later added to that source worktree inherit it. Selecting an existing source worktree cannot silently override it.

## Scope and design gates

1. **Before mutation**, review source and record explicit choice of durable storage/contract for a worktree's integration destination (e.g. verified target workspace ID + pinned branch identity and a registry revision/generation). Do **not** attach competing mutable targets to each Spec manifest. Owner-review any breaking registry/journal/API change; keep old in-flight Create and Close retries safe.
2. Extend the `new-worktree` Create intent/contract with an optional *integration destination selector*, **distinct from** `baseRef` and `branch`. A missing selector MUST preserve existing project-default behavior and current test fixtures; no retroactive interpretation of old operation IDs. An explicit selector is validated/resolved under current Project Home authority and pinned with immutable operation intent; retries with changed destination fail as intent conflict.
3. MVP destinations: verified primary checkout on the project's configured integration branch, or another **registered, available, local** worktree on a validated attached local branch in the **same Git instance**. Support an existing managed linked feature worktree as the destination; for unsupported/foreign/unregistered/absent targets return actionable typed refusal, not auto-register or auto-switch checkout. Reject source=destination and unsafe cycles/aliasing.
4. Reuse the existing Engine Close operation for **exclusive** source worktrees. Close must resolve the originally selected destination, revalidate exact physical checkout/incarnation, local branch, Git instance, cleanliness, ancestry, registry revisions and destination ownership. Do not use the current primary-only checks under a different field name.
5. Before Git mutations, reserve shared resources for **both** physical checkouts, their refs and relevant worktree admin/Git metadata. Never spawn Git under the Project Home control lock. Preserve the installed no-force, hooks-disabled, real-Git evidence and conflict/scratch handling. Don't fetch remotes, checkout another branch or silently change target.
6. Pin target identity, branch and pre-publication HEAD in a Close journal before any effects; account for fast-forward, already-integrated, clean divergent integration, conflict/unknown effect, operation retries and source/target mutations between stages. Resume only when effect ownership is positively proven; return typed `requires-resolution`/`recovery-required` otherwise. Do not delete source before verified target publication and registry transition.
7. After integration, rebind exclusive Spec to the **actual verified target workspace**, not unconditionally primary; ensure its active/archive identity and content there. Only then, subject to ignored/local data and operation evidence, dispose the managed source checkout, preserving branch ref per current policy. Keep old single-Spec primary-target behavior equivalent.
8. Expose destination choices in the I01 read projection, and safe read details for post-Create display; extend CLI/HTTP **through the same Engine use case**, preserving project Git Integrate permission and all relevant scope checks. Add no UI and no new workflow/Session dependency.
9. Explicitly distinguish **baseRef=feature/x** from **destination=feature/x**. Do not implicitly choose destination from baseRef. New working branch name is independently auto-generated or caller supplied.

## Mandatory end-to-end examples

- Project Home on `develop`, `feature/x` registered and checked out in linked workspace X; Create `spec/y` with `baseRef: feature/x`, destination X; commit source changes; Close integrates to `feature/x` in X, primary remains on `develop` and untouched; Spec binds to X afterward; source worktree is removed only on verified success.
- Same source base but destination omitted => old project-default semantics (when configured). No explicit destination or project target configured => retain current Create permissiveness, and Close refuses until a safe target exists.
- Destination branch moves, target worktree is dirty/disappears/is detached/replaced, wrong Git instance, ambiguous merge, or concurrent Git mutation => no wrong-branch write, no premature rebind/disposal; clear typed outcome and recovery path.
- Repeated identical operation ID has exactly-once Git and registry effects; changed requested target under same Create operation ID => conflict. Existing/legacy single-branch test suite stays green.

## Acceptance and verification

Add real Git integration tests (not mock-only), independent-process collision and kill-point tests before/after publication, registry CAS and worktree removal; exercise Windows and POSIX. Include local Git/Node/OS versions, before/after refs/HEAD/index/tree/registry evidence and evidence for retained source on failures. Re-run existing E2.T11–T17/LC01–LC40, original Create/Close transport tests, Q05/Q06/Q07 smoke and any relevant CodeQL/quality checks. Independent security/recovery review required before I03 starts.

**Out of scope:** multiple source Specs in the same worktree (I03); arbitrary Git refs with no verified target checkout; GitHub PR automation; automatically switching primary; per-Spec target overrides; branch-only Create.
