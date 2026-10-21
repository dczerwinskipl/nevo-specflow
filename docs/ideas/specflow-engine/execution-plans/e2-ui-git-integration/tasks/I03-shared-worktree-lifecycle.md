---
id: ideas.specflow-engine.plan-02-ui-git-integration.I03
type: engineering
title: E2.I03 — Independent Specification close and shared-worktree integration
status: draft
scope: specflow
areas: [workflow, runtime, cli, security, testing]
tags: [execution-task, temporary, e2, solo-review]
read_when:
  - implementing E2.I03 after I02 has been reviewed
summary: >
  Make several canonical Specs in one managed linked worktree safe to archive
  individually and integrate/retire together without losing any bindings or files.
related:
  - ideas.specflow-engine.plan-02-ui-git-integration
---

# E2.I03 — Shared-worktree lifecycle

**Mode:** SOLO, independent architecture/data-loss review. **Depends on:** I02 accepted. **Do NOT parallelize with I02.** Work on PR #53, not a per-task PR.

## Existing blocker

`packages/specflow-engine/src/specs/lifecycle/preflight.ts` requires `registry.specBindings.filter(x => x.workspaceId === source.workspaceId)` to contain **exactly the requested Spec**, even for `specification-close` with `integrateToTargetBranch: false`. The current `rebindLifecycleSpec` / `retireLifecycleWorkspace` assume exclusive source and destination primary. Yet existing Create permits `target: {kind:'existing', workspaceId}` and more than one Spec in the same linked checkout.

Correct two separate lifecycles, not just loosen the occupant count check:
- **Close Specification:** archive exactly one Spec in its current checkout, preserving its `specId`, sibling Specs and workspace binding. No hidden whole-branch merge/worktree removal.
- **Close Workspace:** explicitly integrate the **whole working branch** with all bound Specs, atomically rebind every affected canonical Spec to the destination verified by I02, then retire the old worktree when safe. Active Specs stay active; archived Specs stay archived.

## Required behavior

1. Reuse current `specification-close` in a shared managed linked worktree **only when integrating is false**. Archive/move/commit just the selected Spec's own files using current Engine-owned scoped archive action; preserve all sibling manifests, statuses and bindings. Repeat is idempotent. Retain the worktree and branch.
2. A request to `specification-close` **with integration=true** while multiple Specs occupy source MUST NOT silently merge/remove that workspace. Return explicit typed block with human-readable remedy: archive-only now, or request an explicitly workspace-scoped Close. Preserve current one-Spec integrated Close semantics for compatibility where safe.
3. Design a **workspace-scoped** Close intent/transport identified by `workspaceId` (or equivalent verified resource identity), not a cosmetically renamed `specId`. Include a preview of source worktree, destination branch/workspace, **all** canonical occupant Spec IDs and counts, and that this is **whole-branch integration**. Do not expose unauthorized occupant identifiers; authorization must cover workspace/project Git integration AND all affected Spec bindings (or enforce a stricter project-wide workspace-close grant). Do not accept a caller-provided occupant list as authority.
4. Validate source as managed linked with verified physical identity and stable registry revision; ensure destination is the workspace-owned target from I02. Validate every occupant's manifest, immutable ID/slug and active/archive location; distinguish inherited source files from **bound** canonical Specs. Reject other modified Specs or unowned branch changes that violate integration policy, and any unclear duplicate/stale source. Explicitly account for three siblings and any unrelated changes before doing a whole-branch merge.
5. Durable workspace-level journal and full shared-resource reservation: source/destination workspaces and Git refs, all occupant Spec identities/binding generations, Git admin/scratch as applicable. CAS/fencing must reject concurrent Create/Close/rebind/Writer on the same source or destination, including one targeting an occupant not named in a user request. No Git subprocess inside control lock.
6. After verified source publication in target, perform a **single atomic registry transition** that rebinds **all** affected occupants (do not publish a partially moved set or rely on separate spec closes). Persist immutable occupant snapshot and before/after revision evidence so crash/retry reconciles the whole set. Verify source/destination canonical content and statuses; never use stale primary fallback. A workspace remains registered/physical until **zero** bindings point to it and prior effects are safe.
7. Cleanup requires no unknown ignored/user files, no unresolved mutations/claims and verified source+target identity; do not auto-delete branch refs or force-prune. Return actionable `requires-resolution` or `recovery-required` when outcome is ambiguous. Worktree close must not mean terminal Task, finished workflow or archived Specification.
8. Extend CLI and Runtime to preview/execute/inspect a workspace-scoped Close with safe authorization and schema contracts. Keep prior `specs/:specId/worktree/close` behavior for an **exclusive** source (either delegate compatibly or explicitly deprecate it with tests); do not silently change semantics for existing clients. No UI screens, workflow/session gates or PR merges.

## Required test scenarios

1. Create A/B/C in one managed linked workspace via actual Engine and HTTP/CLI. Archive **B only** with `integrateToTargetBranch:false`. Prove A/C still active and all three remain bound to the same source; B is archived there; source branch/worktree remains.
2. Request integrated Close Specification for A while B/C also bound => typed no-side-effect refusal; no unexpected commit/merge and no registry change.
3. Preview Close Workspace lists all affected authorized Specs and actual selected destination. Integrate branch once; verify A/C active, B archived, **all** IDs/content/locations present in target, all bindings moved **together**, no dangling source and no unowned deletions. Destination can be linked feature workspace, not just primary.
4. Two-process Create/Spec-Close/Workspace-Close races cannot cross resource owners, overwrite another Spec or remove a checkout in use.
5. Kill before/after archive commit, Git publish, multi-binding CAS, Git worktree remove and registry retirement; retry proves exactly-once or stops as recovery-required with source preserved. Exercise fast-forward/divergent/conflict + false target/identity/dirty/ignored/unknown-process cases on Windows and POSIX.
6. Existing exclusive Close Worktree, primary Close Spec, current LC01–LC40, API authorization and CLI compatibility remain passing; no regression to Q00–Q07/public API boundaries.

## Handover and review

Report exact new HTTP/CLI contracts, permanent architecture decisions, safe migration of any updated journal/registry schema, process/OS/Git regression matrix and explicit limitations for co-operating vs out-of-band filesystem writers. Independent data-loss and authorization review is mandatory before declaring I03 accepted.

**Out of scope:** spec-specific cherry-pick from an arbitrarily shared Git branch; independently choosing different integration targets for Spec A and B sharing one worktree; auto-merge pull requests, native provider Sessions or Workflow/Task gates.
