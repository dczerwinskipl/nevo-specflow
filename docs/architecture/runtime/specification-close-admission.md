---
id: architecture.runtime.specification-close-admission
type: architecture
title: Specification and workspace Close admission and refusal semantics
status: current
scope: specflow
areas: [runtime, cli, security, git]
tags: [specification, close, worktree, workspace, authorization, recovery]
read_when:
  - reviewing Specification Close versus Worktree and Workspace Close
  - explaining Close preview blockers or external merge outcomes
  - changing Git-off Close, local config protection or Session occupancy
summary: >-
  Scope-specific Close admission, Git-off archive-only mode, preview and refusal semantics,
  integration branch candidates, Session occupancy and externally merged worktree disposal.
related:
  - architecture.runtime.specflow-lifecycle
  - reference.api.specflow-specification-operations
  - architecture.runtime.specification-documents
  - reference.api.sessions
  - reference.configuration.specflow-git-worktrees
---

# Close admission, previews and refusals

The Engine's [Specification lifecycle](specification-lifecycle.md) owns durable journal claims,
proof of integration, compare-and-swap rebind and physical worktree disposal. The HTTP schemas
and errors are generated in [OpenAPI](../../reference/api/openapi.md) from
`@nevo/specflow-contracts/specs`. This page describes **which Close the caller requested and
how admission/refusals are interpreted**; it is not an endpoint catalogue.

## Three distinct intents

1. **Specification Close** archives one Specification; it may integrate a linked branch into
   the target if requested and allowed. An optional `integrateToTargetBranch:false` means
   archive-only, not disposal. It never accepts `finishAfterExternalMerge`.
2. **Worktree Close** closes a linked worktree associated with the Specification. It is
   exclusive when required. `finishAfterExternalMerge:true` is an explicit owner assertion
   that the destination already contains the entire branch's changes. Preview reports the
   selected mode; **only the mutation** proves content equivalence before disposal.
3. **Workspace Close** retires one registered whole linked workspace containing potentially
   **multiple** Specifications. Preview shows **every canonical occupant**; the mutation
   integrates the whole branch and rebinds the group atomically. It requires project-wide
   Git `close-workspace` **and** `integrate` before exposing occupants or journals.
   Spec-scoped integration of a shared checkout is rejected with
   `409 CLOSE_SHARED_WORKTREE`.

Mutating Close requests carry an `operationId` (UUID). A completed outcome answers 200;
an unsettled operation answers 202. Retry the **same** id and unchanged request; changing the
requested mode under that id answers `409 CLOSE_CONFLICT`. An operation inspection is a
read-only projection, never a request to repeat uncertain Git side effects.

## Git off: archive only

- With `git.enabled:false` or no project `git:` block, Specification Close moves
  `specs/active/<slug>` into `specs/archive/<slug>` in its own checkout (primary or linked),
  without Git commit, integration, branch checking or requiring a clean repository.
- An omitted or false `integrateToTargetBranch` archives; `true` is rejected with
  `400 CLOSE_INVALID` **before** the workflow gate. Preview reports
  `integrationRequired:false` and
  `merge:{status:"not-integrated",reason:"git-off",checkout}`; result is
  `outcome:"archived-without-git"`. The archive remains uncommitted.
- The workflow exit gate, active Session Turns, document commits and conflicts still apply.
  Worktree/Workspace Close requires integration via Git and refuses `400 CLOSE_INVALID`
  while Git is off, including previews; archive the Specification instead or turn Git on.
- The mode is pinned in the reserved operation. A changed Git mode/config revision before
  reservation produces `409 CLOSE_CONFLICT`; an unreadable policy is never treated as Git
  off and instead fails closed with `503 GIT_POLICY_INVALID`.
- A stopped archive intent can still be `recovery-required` and retain claims until
  [operator recovery](../../engineering/shared/specflow-git-recovery.md).
  A later Git-enabled Worktree Close can refuse the previously uncommitted archive.

## Previews, document commits and running Sessions

- Previews are read-only; they do not flush the document commit queue. Close mutations first
  flush relevant checkouts, then refuse `409 DOCUMENT_COMMITS_PENDING` if commits still
  need attention, with a typed cause (`commit-pending`, `commit-failed` or
  `commit-uncommitted`). A preview that would otherwise report a dirty checkout due to
  files owned by pending document commits reports that same pending-documents blocker instead
  of instructing a manual Git commit.
- A workflow exit gate that blocks completion returns `409 CLOSE_BLOCKED` with grouped
  blockers (`kind`, `subjectIds`, display-only `message`). Close never silently finishes
  Tasks, invents Session state or retries unknown Git effects.
- A live Session Turn in a linked checkout scheduled for disposal is another
  `CLOSE_BLOCKED` `session-turn-running` blocker, with Session ids. An occupancy read
  exposes this independently of Close planning so the UI can show workflow and Session
  blockers together. No worktree disposal occurs while a Turn owns it; new write Turns are
  refused while Close holds the workspace.
- Cross-process and CLI Close must also honor live or unsettled Turn occupancy even if the
  executing process does not own that Session store. A primary checkout does not yield an
  eviction blocker for a Spec-scoped Close that does not remove it.

## Repository preflight and branch discovery

- Ordinary Git preconditions answer `422 CLOSE_PREFLIGHT` with a bounded array of
  `repository` blockers: `uncommitted-changes`, `integration-target-missing`,
  `integration-target-branch`, `git-operation-in-progress`, `branch-detached`.
  The preview and mutation report the same known blockers, never the first one alone.
- For `uncommitted-changes`, the response identifies the **registered workspaceId** holding
  dirty files, the total `count`, the `specificationCount` and up to **10** checkout-relative
  paths with `scope:"specification"|"other"`. Specification paths are under its own active
  folder and are listed first; a destination checkout's paths are always `other`. The
  absolute path is **not** in the refusal and is obtained only via separately authorized
  `GET /api/workspaces`. Specification Close may include its own Task/`.execution` changes
  in the archive commit, but will not absorb/stash/discard foreign repository changes.
- If `git.integrationTargetBranch` is unset, no default such as `main` is guessed. The
  `integration-target-missing` blocker includes at most **50** branch candidates and
  **200** other branches (plus `otherBranchCount`). Candidates represent local refs and
  are ordered by first matching fact: `remote-default` from local
  `refs/remotes/<remote>/HEAD` (no network fetch); `started-from` recorded by Create; or
  `primary-checkout`. A candidate may carry more than one fact. The linked source branch
  and branches matching the Specification branch pattern are excluded from other branches.
  Nothing is written to project config by preview.
- Merge previews distinguish `integrates` (source, target, commitsAhead) from
  `not-integrated`: `archive-only`, `primary-checkout`,
  `already-merged-externally` or `git-off`. `commitsAhead:0` means nothing to merge;
  Specification Close may still add its archive commit.

## Externally merged branches and local config

- `finishAfterExternalMerge:true` is accepted **only** by Worktree Close and its preview
  (query value is literal string `true`, unlike the JSON boolean in the mutation). It
  means the caller asserts the branch was externally merged (for example, a GitHub squash),
  not that a preview already verified it. Mutation compares the complete source branch
  merge-base diff **by content**, including every affected path, with the destination.
  On failure return `409 CLOSE_EXTERNAL_MERGE_MISMATCH` and up to **10** divergent paths;
  on success retire the bound worktree without creating a second merge commit.
- Specification Close refuses the flag at the HTTP schema boundary with 400. The Engine
  additionally refuses bypassing callers with
  `400 CLOSE_EXTERNAL_MERGE_UNSUPPORTED`: this mode cannot prove that the canonical
  Specification ended archived on the destination, so reporting Specification Close success
  would be false.
- Worktree Close treats `.nevo/local/cache/**` (local semantic-docs index) as disposable.
  When Create copies `.nevo/local/config.yaml`, it records the original SHA-256 in
  `.nevo/local/state/local-config-copy.json`. Close disposes of this copy only if its bytes
  still match. A changed/unrecorded/unreadable local config refuses
  `409 CLOSE_LOCAL_CONFIG_MODIFIED`, with `localConfig:"changed"|"unrecorded"|"unreadable"`;
  the owner must move/remove it and retry the **same** operation.
- Reconciliation of an ambiguous scratch checkout requires the explicit trusted
  `confirmedNoActiveGitProcess:true` acknowledgement, plus independent physical checks.
  This is operator recovery, never automatic inferred process liveness.
