---
id: ideas.specflow-engine.close-hardening
type: architecture
title: Close hardening — shared-checkout state isolation and external-merge finish
status: draft
scope: specflow
areas: [runtime, cli, security]
tags: [close, worktree, ledger, git-integration]
read_when:
  - implementing or reviewing GitHub #181 (workflow-state isolation in a shared checkout)
  - implementing or reviewing GitHub #157 (finish a Close after an external PR merge)
  - touching lifecycle/preflight.ts, lifecycle/reservation.ts, uncommitted/hold.ts, lifecycle/model.ts, lifecycle/repository-mode.ts, lifecycle/archive-effects.ts or lifecycle/git/*
  - re-decomposing this package's tasks after PR #173 landed the GitClosePlan/GitOffClosePlan split and the CloseRepositoryBlocker reporting system underneath it — read "Reconciliation with PR #173" below first
summary: >
  Specification for two related Close hardening fixes bundled as one package: scoping the
  ledger/clean-tree preflight to the Specification being closed instead of the whole shared
  checkout (#181), and a new explicit Close mode that finishes a linked worktree after its
  content was already merged externally — e.g. a GitHub squash merge — without re-integrating
  (#157). Both are fixes to existing Close validation/flow, not new product surfaces.
related:
  - architecture.runtime.specflow-lifecycle
  - adr.0018-engine-commit-policy-and-manual-commit
  - adr.0013-engine-owned-commits-and-protected-branches
  - reference.configuration.specflow-git-worktrees
  - engineering.shared.specflow-git-recovery
  - architecture.principles.enforceable-invariants
---

# Close hardening — shared-checkout state isolation and external-merge finish

Two Close defects found during real-repo dogfooding (#173 and the #150 owner review), bundled as
one package because both touch the same Close/worktree/Git-integration code under
`packages/specflow-engine/src/specs/lifecycle/` and neither depends on the other.

## Part A — Workflow state isolation in a shared checkout (#181)

### Problem

With `git.commits.auto` off (the ADR 0018 default), workflow-state writes are recorded in the
uncommitted-changes ledger and committed only when a step finishes. When two active
Specifications share one checkout (the ordinary primary/current-folder case, or a shared linked
worktree closed archive-only), Specification A's own pending ledger entries make Close of
Specification B refuse, even though B's Close never reads or writes A's files.

### Evidence (current code, verified 2026-11-19)

- The ledger (ADR 0018 decision 6, `specs/durable/ledger/*`) is keyed per `(workspaceId, owner)`;
  owner kind `specification` carries the owning Spec's id. **Every ledger entry is already
  unambiguously attributed to one Specification.**
- Two independent checks gate a Specification-scoped Close (archive-only, or an exclusive
  worktree-close), both scoped **only** to the one Specification being closed:
  1. `lifecycle/preflight.ts`, `inspectCleanGitWorkspace()` — a full `git status`-based clean-tree
     check. Its `CleanTreeAllowance.executionStateOf` exempts only the closing Specification's own
     `specs/active/<slug>/.execution/**` and `tasks/**` (via `isExecutionStatePathOf`,
     `specs/execution-paths.ts`). Any other modified/untracked path refuses with `CLOSE_PREFLIGHT`.
  2. `specs/uncommitted/hold.ts`, `readUncommittedHold()` (reached from
     `specs/documents/queue/flush.ts`'s `readCloseHold` / `flushCheckoutsForClose` /
     `assertNoUncommittedHold`) — a ledger-based check. Its `UncommittedAllowance`
     (`{ specId, directory }`) also only exempts ledger entries owned by that one `specId`.
- Both allowances are built by `allowanceOfPlan` / `allowanceOfRequest`
  (`lifecycle/reservation.ts`), which hard-code a single Specification's own directory:
  `{ specId: plan.specId, directory: 'specs/active/' + plan.slug }`.
- `linked && integrate` (a shared **linked** worktree closed with integration) is already refused
  up front by the existing `CLOSE_SHARED_WORKTREE` occupant check in `preflight.ts`, independent of
  this bug. The realistic blocked path is **archive-only** Close — explicit
  `integrateToTargetBranch: false`, or the unlinked/primary-folder case where `integrate` is
  always `false` — of a Specification sharing its checkout with another active Specification that
  has its own pending ledger entries.
- A Specification's archive commit is `git commit --only` over its own literal paths (ADR 0013
  decision 1); it never stages or touches a sibling Specification's files. Widening the allowance
  changes only what is _tolerated_ as known, accounted-for dirty state — never what is committed.

### Analysis questions answered (owner asked these in #181)

1. **Is the block a real Git constraint, or an overly strict clean-tree validation?** Not a Git
   constraint — it is validation scope (checkout-wide) stricter than necessary for an
   archive-only/exclusive Close that never reads or writes another Specification's files.
2. **Does the ledger attribute every change unambiguously to one Specification?** Yes — confirmed
   in code (ADR 0018 decision 6; owner kind `specification` by id).
3. **Can Close commit/integrate B safely without touching A's state (index, working tree, HEAD)?**
   Yes, for archive-only and exclusive Close: the archive commit is path-limited to B's own
   directory (see above); this is unaffected by widening the preflight allowance. Workspace Close
   (which touches the whole checkout/branch for every occupant) is explicitly **out of scope**
   here — see "Out of scope" below.
4. **Behaviour on crash, conflicts and concurrent changes, during and after Close?** Unchanged.
   The same ledger read/compare/write-under-lock discipline and the same re-verification inside
   the control lock (`assertNoUncommittedHold`, called a second time after the flush) continue to
   apply; this fix only widens _which_ entries are exempt from the check, not how or when the
   check is re-verified.

### Resolution

Widen both allowances so that, for a Specification-scoped Close of `specId = B` in checkout `W`, a
dirty path or ledger entry is accepted as "known" when it is **either**:

- (a) B's own execution state — today's behaviour, unchanged (folded into B's archive commit); **or**
- (b) recorded in `W`'s ledger under owner kind `specification`, some other id `A`, **and** itself
  execution-state (`isExecutionStatePathOf`) of `A`'s own `specs/active/<slug-A>/` directory.

Any other path — an unregistered owner, a path that is not execution-state-shaped, a
`definitions`-owned entry, or a genuinely foreign/unexplained edit — **must still refuse exactly as
today**. This is a widening of what the ledger already proves safe, not a relaxation of the
fail-closed default ([[architecture.principles.enforceable-invariants]]).

Concretely this touches:

- `CleanTreeAllowance` (`lifecycle/preflight.ts`): accept a set of known Specification directories
  (or an equivalent predicate), not a single `executionStateOf` string.
- `readUncommittedHold`'s filter (`uncommitted/hold.ts`): stop requiring
  `record.owner.id === allowance.specId`; instead accept any `specification`-owned record whose
  path is execution-state of **its own** directory (the owning Spec's own `specs/active/<slug>/`,
  derived from the registry — never trust a client-supplied directory for a foreign owner).
- `allowanceOfPlan` / `allowanceOfRequest` (`lifecycle/reservation.ts`): derive the wider
  allowance from the registry's other active Specification bindings of the same checkout, not just
  the one being closed.

### Out of scope (owner exclusions, keep unchanged)

- **Workspace Close** (`workspace-close`) is not touched — it already derives the complete
  occupant set and CAS-rebinds every occupant in one registry revision; its whole-checkout
  strictness stays as is.
- **`git.commits.auto` default and semantics** are unchanged.
- **Existing refusals stay refusals**: `CLOSE_PREFLIGHT` for truly foreign/unexplained dirty
  paths, `CLOSE_SHARED_WORKTREE` for a shared linked worktree closed with integration. This change
  only recognizes evidence the ledger already carries; it does not add new exceptions.

### Verification

- Two Specifications sharing one checkout (the primary-folder case): Specification A has an
  uncommitted workflow-state ledger entry (a started step); archive-only Close of Specification B
  succeeds and leaves A's files and ledger entry untouched.
- Negative test: an unexplained dirty path that belongs to no registered Specification's execution
  state still refuses with the existing error.
- Existing Close/preflight/ledger test suites must keep passing unmodified in intent (only the
  allowance's scope changes).

## Part B — Finish Close after an external (PR) merge (#157)

### Problem

Projects that merge through pull requests (GitHub squash merge, as this repository does since its
#150 init) have no supported way to finish a Specification's linked worktree after the merge
happened outside Nevo. `specs worktree close` / `specs workspace close` always re-integrate the
branch into the pinned destination; after a squash merge the destination already has the squashed
content, so re-integrating duplicates history or conflicts. `--archive-only` keeps the worktree in
place — not a finish.

### Evidence (current code, verified 2026-11-19)

- `version-control/git/integration.ts`'s `GitRelationship` is exactly
  `'already-integrated' | 'fast-forward' | 'divergent'`, derived from true Git ancestry
  (`isAncestor`).
- For `'already-integrated'` (the source commit **is** an ancestor of the target — an ordinary
  merge or rebase already landed), Close already **skips re-merging**:
  `lifecycle/git/publication.ts` and `lifecycle/worktree-disposal.ts` call
  `verifyGitTreePathEquivalent(root, sourceCommit, destinationCommit, 'specs/active|archive/<slug>')`
  (also in `version-control/git/integration.ts`) — an exact Git tree-subtree comparison of the
  Specification's own canonical path between the source and destination commits — then proceed
  straight to archive + CAS rebind + worktree disposal. **This existing primitive and existing
  disposal path are exactly what #157 needs.**
- A GitHub squash merge breaks ancestry: `isAncestor(sourceCommit, targetCommit)` is `false` even
  though the destination already has the content-equivalent changes. Close today reports
  `relationship: 'divergent'` and has no supported way to say "the destination already has this;
  finish without merging again."

### Resolution

Add an explicit, **person-initiated** Close mode — "finish after external merge" — never inferred
automatically from `relationship === 'divergent'`, so a real merge the person actually wants is
never silently skipped.

On request:

1. Reuse `verifyGitTreePathEquivalent` to compare the Specification's canonical subtree(s) between
   the pinned source HEAD and the pinned destination HEAD, **regardless of ancestry**.
2. **Whole-branch content proof, not just the Spec subtree** (owner decision, independent review
   2026-11-19): the `already-integrated` path's safety comes from true Git ancestry — the ENTIRE
   source branch, including ordinary non-Spec code changes, is provably part of the destination's
   history. The new mode performs no merge and has no ancestry, so it must prove the equivalent
   fact by content instead: every path `inspectCloseGitIntegration`'s existing
   `mergeBaseCommit..sourceCommit` diff (the same list its "foreign spec ownership" check already
   computes) names must also be content-equivalent between `sourceCommit` and the destination's
   current HEAD — not just the canonical Spec subtree(s). A partial external merge (the Spec's
   folder landed, an ordinary code change from the same branch did not) must refuse, exactly like a
   subtree mismatch does.
3. On success: skip the merge/fast-forward step entirely and reuse the **same** archive + CAS
   rebind + worktree disposal effects the `already-integrated` path already uses. Do not fork a
   parallel disposal algorithm.
4. On failure (any in-scope path differs or is missing in the destination): refuse with a plain
   explanation naming every differing path — a new or extended error code, never a generic
   conflict message ([[feedback-explain-before-action]]: surface the precondition, not a generic
   post-submit error).

Recommend this new mode also honours `git.commits.protectedBranches` (the issue says
"optionally"; recommend doing it now — the code path is new and the pattern matcher already
exists in `version-control/worktrees/*`), without touching the existing Create-time or
ordinary-merge protected-branch semantics (ADR 0013, which explicitly leaves Close integration
unguarded today).

### Open implementation-level choices

These do not block task decomposition — they are implementation details, not product/architecture
decisions, because none of them changes the enforced invariant (explicit, verified, fail-closed):

1. The exact Close request field/flag name for this mode (e.g. a new intent value or boolean).
2. The exact new error code for the mismatch refusal.
3. Whether to offer this mode only when `relationship === 'divergent'`, or also (redundantly) for
   the other two relationships.

### Verification

- A fixture that creates a linked worktree, commits a Spec change AND an ordinary application-code
  change on it, "externally" squash-merges both into the target branch (simulating GitHub), then
  exercises "finish after external merge": assert archive + rebind + worktree removal happen with
  no new merge commit and a correct CAS registry update.
- Negative test: deliberately diverge the destination's Specification subtree (simulate a
  conflicting edit on the target branch); assert a refusal naming the differing path, with no
  mutation.
- Negative test (whole-branch gap, owner decision 2026-11-19): the source branch changes both the
  Spec and application code, but the destination only received the Spec's own folder (a partial
  external merge); assert a refusal naming the missing application-code path, with no mutation.

## Scope and sequencing

Parts A and B touch the same lifecycle/Close code area but have **no ordering dependency** on
each other; both ship in **one PR** (repo convention: prerequisites and implementation together,
not split into side PRs). Run the full lifecycle/Close test suite — and whatever the repository's
pre-push checklist requires (typecheck, `pnpm docs:check`, any affected unit suites) — once both
parts are implemented, not after each individually.

## Readiness

**Ready for task decomposition** at the time this section was written. No missing owner decision
blocked either part: #181's target requirement and four analysis questions are answered above from
code evidence; #157's "Expected" behaviour is decision-complete modulo the three implementation-level
choices listed, none of which are material product or architecture decisions.

> **This decomposition was superseded and has been replaced.** PR #173 merged into `main` after this
> package's branch was created and after PR #188 (this package's implementation) was opened,
> independently redesigning the exact Close subsystem this package sits on, which made the task
> breakdown that originally followed this note (A1/A2, B1/B2, with `CleanTreeAllowance`/
> `activeSpecificationDirectories`-shaped `Touches` lists) stale. The "Reconciliation with PR #173"
> section further below in this document diagnosed exactly what changed and what survives; the
> "## Task decomposition" section immediately below this note is the **replacement** decomposition
> written from that reconciliation, re-read against current `main` rather than carried forward from
> here.

## Task decomposition (re-decomposed 2026-11-20, against `main` post PR #173)

> This replaces the task breakdown that previously followed the "Readiness" section above (struck by
> the note just above this one). That breakdown's dependency shape and verification intent carry
> forward; its `Touches` lists and code-shape details do not — they named types
> (`CleanTreeAllowance`, `activeSpecificationDirectories`) that PR #173 removed or restructured before
> this re-decomposition was written. The full diagnosis is in "Reconciliation with PR #173" further
> below. Every file and function
> named below was read directly on `origin/main` (not this branch's own stale working tree, and not
> PR #188's superseded diff) while writing this section. The four PR #188 external-review fixes are
> folded in as acceptance criteria on A2 and B1, not ported as a diff — see the "Reconciliation"
> section above for why the literal patches no longer apply.

One branch/PR (`feat/close-hardening-181-157`), both Parts in sequence as separate reviewable
commits/tasks; no ordering dependency between Part A and Part B themselves, only within each Part.
All tasks are backend/Engine-only (no UI surface — the sibling-Specification judgment call stays
decided: fully invisible to the Close dialog, no new UI). Recommended implementation profile for
every task is **`nevo-agents-implementer`**. Verification follows
[`engineering.shared.testing`](../../engineering/shared/testing.md): focused unit tests co-located
with the module they verify, cross-boundary/real-Git scenarios in the package's `test/lifecycle/`
tree (current files: `archive-close.test.ts`, `close-process-contention.test.ts`,
`close-sigkill.test.ts`, `close-specification-lifecycle.test.ts`, `close-without-git.test.ts`,
`close-worktree-lifecycle.test.ts`, `lifecycle-admission.test.ts`, `lifecycle-journal-scope.test.ts`;
no `close-external-merge.test.ts` exists on `main` yet), transport contract tests beside the existing
`packages/specflow-runtime/test/specs/close.http.test.ts`.

Cross-cutting facts that shape both tasks below, confirmed by reading current `main`:

- `CleanTreeAllowance` no longer exists. `preflight.ts` now has `CleanTreeCheck { specificationDirectory?, acceptExecutionState?, role? }` — still single-directory, used at three call
  sites: `previewGitClose`'s admission call (`role: 'specification'`), `archiveSpecificationWithCommit`'s
  final re-verification (no `role`), and the `integration-target` checks (unaffected by Part A).
- `UncommittedAllowance` (`specs/uncommitted/hold.ts`) is untouched by #173: still `{ specId, directory }`,
  one owner, consumed by `allowanceOfPlan`/`allowanceOfRequest` (`reservation.ts`) and
  `readUncommittedHold`'s filter.
- `ClosePlan = GitClosePlan | GitOffClosePlan` (`model.ts`). `GitOffClosePlan.kind` is restricted to
  `'specification-close'`; it never integrates and its Close has **no Git status check and no ledger-hold
  check at all** (`readUncommittedHold` returns `undefined` unconditionally when Git is off) — Part A's
  widening is therefore scoped entirely to `GitClosePlan`, nothing to touch in `close/without-git.ts`.
- `archiveSpecificationWithCommit` (`archive-effects.ts`) still runs its post-commit sanity checks
  (the `git diff --cached --name-only` comparison against `expected` paths, and `reconcileArchiveCommit`'s
  and `proveArchiveCommitPhysical`'s `git status --porcelain` / write-tree checks) **with no pathspec at
  all** — confirmed unscoped on current `main`, same bug class PR #188's Fix 1 patched against
  pre-#173 code.
- `closeSpecification` (`close/specification.ts`) still archives unconditionally first
  (`archiveSpecificationWithCommit`), then integrates only if `needsIntegration(journal)`
  (`prepareCloseGitIntegration` → `advanceCloseIntegration`). `assertArchivedAt` requires
  `location === 'archive' && status === 'archived'` on the destination — this is the postcondition
  Fix 2's `assertPresentAt` sibling must replace for the externally-merged case.
- `inspectCloseGitIntegration` (`git/integration.ts`) already computes the merge-base diff
  (`sourcePaths`, `gitProof.mergeBaseCommit..gitProof.sourceCommit`) for its "foreign spec ownership"
  check, and already uses `journal.archive?.committedHead ?? plan.source.head` as `sourceCommit` —
  i.e. it reaches for the **post-archive** commit whenever one exists. Reusing this function's
  `sourceCommit` resolution as-is for the external-merge proof is exactly Fix 2's trap; B1 must pin
  the pre-archive identity explicitly instead.
- `requireVerifiedCloseIntegration` (`git/publication.ts`) and `assertPublication`
  (`worktree-disposal.ts`) both pick the expected published tree purely from
  `integration.relationship` (`'fast-forward'` → `sourceTree`, `'divergent'` → `scratch.candidateTree`,
  else `targetTree`). An externally-merged finish that leaves the true ancestry-derived `relationship`
  at `'divergent'` (no scratch ever created, `publishedCommit = targetCommit`) falls into the
  scratch-expecting branch in **both** files unless each gains an explicit externally-merged case.

### Part A — shared-checkout state isolation (#181)

#### A1 — Widen the sibling-exemption types/predicate (no behavioural change yet)

**Touches:** `packages/specflow-engine/src/specs/uncommitted/hold.ts` (the `UncommittedAllowance`
interface and `readUncommittedHold`'s filter at `record.owner.id !== allowance.specId`),
`packages/specflow-engine/src/specs/lifecycle/preflight.ts` (the `CleanTreeCheck` interface and
`inspectCleanGitWorkspace`'s unclean-path filter).

**What it does:** Replaces the single-owner shape with one that can carry _several_ Specifications'
own directories: `UncommittedAllowance` becomes a set/map of `{ specId, directory }` pairs (exact
shape is implementation discretion). `readUncommittedHold`'s filter changes from "this one `specId`
equals `allowance.specId`" to "the record's `owner.id` is one of the known ids, **and** the path is
execution-state of _that id's own_ directory" — never accept a path just because some _other_ known
directory matches. For `CleanTreeCheck`, resolve the one open implementation choice named in the
Reconciliation section: either add a field (e.g. `siblingDirectories?: readonly string[]`) beside the
existing single `specificationDirectory`, or apply a caller-side pre-filter before
`inspectCleanGitWorkspace` ever runs. Either way, `specificationDirectory`/`role`'s existing
single-directory behaviour — including the `uncommitted-changes` `CloseRepositoryBlocker`'s
`scope: 'specification' | 'other'` labelling and `workspaceId` — must stay exactly as it reports today;
the widening pre-filters sibling execution-state paths out of the unclean list before that labelling
ever sees them. No caller passes more than one directory yet.

**Depends on:** nothing (existing single-directory callers keep compiling and behaving identically).

**Work kind / profile:** backend — `nevo-agents-implementer`.

**Acceptance criteria:**

- Unit cases (co-located with `hold.ts`/`preflight.ts`'s existing tests) with two or more known
  directories: a path/entry matching directory 2 but not directory 1 is accepted; a path matching no
  known directory is still refused; an owner's own entries are never checked against a directory that
  isn't that owner's own.
- A Close reservation/preview with exactly one known directory (today's only caller shape) behaves
  byte-for-byte as before — existing Close/preflight/ledger suites pass unmodified in intent.
- The `uncommitted-changes` blocker's reported `specificationDirectory`/`scope`/`workspaceId` fields
  are unchanged by this task (no caller wires multiple directories yet, so there is nothing to verify
  behaviourally beyond "nothing regressed").

#### A2 — Derive the sibling set from the registry, wire every call site, and scope the archive-commit sanity checks (folds in Fixes 1 and 4)

**Touches:** `packages/specflow-engine/src/specs/lifecycle/reservation.ts` (`allowanceOfPlan`,
`allowanceOfRequest`), `packages/specflow-engine/src/specs/lifecycle/preflight.ts`
(`previewGitClose`'s `inspectCleanGitWorkspace` call built with `role: 'specification'`),
`packages/specflow-engine/src/specs/lifecycle/archive-effects.ts`
(`archiveSpecificationWithCommit`'s final `inspectCleanGitWorkspace` re-verification; the post-commit
`git diff --cached --name-only` comparison inside `archiveSpecificationWithCommit`; `reconcileArchiveCommit`'s
and `proveArchiveCommitPhysical`'s `git status --porcelain` / write-tree checks), reading (not
necessarily modifying) `packages/specflow-engine/src/specs/repository.ts`'s
`listWorkspaceSpecifications` and `registry.specBindings` (`project/workspace/registry/types.ts`) as
the derivation's data sources.

**What it does:** For an archive-only/exclusive `specification-close` of `specId = B` in checkout `W`:
derive the sibling set from the checkout's physically-discovered Specification directories
(`listWorkspaceSpecifications(root)`, the same manifest `previewWorkspaceClose` already uses for
workspace-close occupants), **cross-checked against `registry.specBindings` for that checkout's
`workspaceId`** (Fix 4) — a physically-discovered but unregistered/orphan directory falls back to the
existing strict refusal, never a silent exemption. All three call sites — `preflight.ts`'s admission,
`reservation.ts`'s ledger-hold check, and `archive-effects.ts`'s final re-verification — build the set
from this same derivation, so a Close admission accepts is never later refused by a stricter re-check.
Additionally scope every one of `archive-effects.ts`'s post-commit sanity checks (the staged-diff
comparison, and the write-tree/status checks in `reconcileArchiveCommit`/`proveArchiveCommitPhysical`)
to B's own `oldLiteral`/`newLiteral` pathspecs, exactly like the staging (`git add`) and commit
(`git commit --only`) calls they verify already are (Fix 1) — these currently run with no pathspec and
would refuse a Close that admission just accepted whenever a sibling has a pre-existing staged file.
Out of scope stays out of scope: `workspace-close` and `worktree-close`/legacy spec-scoped integrated
Close are untouched (the first already derives the full occupant set itself; both are refused up front
by `CLOSE_SHARED_WORKTREE` independent of this bug); `GitOffClosePlan` is untouched (no ledger/status
check exists for it at all).

**Depends on:** A1.

**Work kind / profile:** backend — `nevo-agents-implementer`.

**Acceptance criteria:**

- Positive: two Specifications sharing one checkout (primary-folder case) — Specification A has an
  uncommitted workflow-state ledger entry (a started step, `git.commits.auto` off) **and** a
  pre-existing staged file of its own; archive-only Close of Specification B succeeds, and A's files,
  ledger entry, and staged file are asserted untouched afterward. (This scenario — a sibling with
  staged, not just working-tree-dirty, state — is what Fix 1 protects; the original two-Specification
  scenario alone does not exercise it.)
- Negative: an unexplained dirty path belonging to no registered Specification's execution state still
  refuses `CLOSE_PREFLIGHT`, naming the path.
- Negative (Fix 4): a physically-discovered Specification directory with no `specBindings` entry for
  that checkout is not exempted; its dirty paths still refuse.
- A sibling's exempted path never appears in Close B's `uncommitted-changes` `CloseRepositoryBlocker`
  (`paths`/`count`/`specificationCount`) — the #173 reporting contract is preserved exactly; Close B's
  dialog never learns A exists.
- Existing Close/preflight/ledger suites (`close-specification-lifecycle.test.ts`,
  `lifecycle-admission.test.ts`, `close-worktree-lifecycle.test.ts`, the `hold`/ledger unit tests) keep
  passing unmodified in intent.

### Part B — finish Close after an external (PR) merge (#157)

#### B1 — Engine: `finishAfterExternalMerge`, proving whole-branch content equivalence against the pre-archive identity (folds in Fixes 2 and 3)

**Touches:** `packages/specflow-engine/src/specs/lifecycle/model.ts` (a new optional
`finishAfterExternalMerge?: boolean` field on the `worktree-close`/`specification-close` members of
`CloseIntent`, threaded through `normalizeCloseIntent`/`fingerprintCloseIntent`; it applies to
`GitClosePlan` only — `GitOffClosePlan.kind` is restricted to `'specification-close'` with no
integration, so the type system itself excludes the combination; a new `CLOSE_EXTERNAL_MERGE_MISMATCH`
`CloseOperationErrorCode`, with a `paths` detail analogous to `CLOSE_PREFLIGHT`'s — a distinct error
code, not a `CloseRepositoryBlocker`, since this is a mid-operation Git-publication failure _after_
admission, not a pre-admission repository precondition), `packages/specflow-engine/src/specs/lifecycle/preflight.ts`
(`previewGitClose`: accept and pin the new request field), `packages/specflow-engine/src/specs/lifecycle/reservation.ts`
(`assertMatchingRequest`: treat the new field as immutable reserved intent, like
`integrateToTargetBranch`), `packages/specflow-engine/src/version-control/git/integration.ts` (a new
`verifyGitPathContentEquivalent`, an unrestricted-path sibling of the existing canonical-subtree-only
`verifyGitTreePathEquivalent`), `packages/specflow-engine/src/specs/lifecycle/git/publication.ts` (a new
`proveExternallyMergedClose` alongside `proveAlreadyIntegratedClose`: compares every occupant's
canonical subtree **and** every path named by a whole-branch content diff — computed the same way
`inspectCloseGitIntegration`'s existing `mergeBaseCommit..sourceCommit` diff is, but exposed for reuse
rather than recomputed ad hoc — between the Specification's **pre-archive** identity
[`plan.source.head`/`plan.location` — never `journal.archive.committedHead`, the trap named above] and
the destination's current HEAD, regardless of `relationship`; on success sets
`publishedCommit = targetCommit`, stage `integration-verified`, reusing `verifyCloseSpecificationTrees`
— extended with `extraPaths`/`collectAll` options rather than duplicated — and the existing CAS-rebind/
disposal effects; on any differing or missing path, refuses `CLOSE_EXTERNAL_MERGE_MISMATCH` naming
every one, not just the first; `requireVerifiedCloseIntegration` in the same file gains an
externally-merged branch in its expected-tree selection and re-runs the _same_ whole-branch proof,
not just a subtree tree-hash, on every call including a resumed journal),
`packages/specflow-engine/src/specs/lifecycle/close/integration.ts` (`advanceCloseIntegration`'s
dispatch: when the plan requests `finishAfterExternalMerge`, call `proveExternallyMergedClose` instead
of switching on `relationship` — whether this is gated to `relationship === 'divergent'` only or
offered unconditionally stays implementation discretion, per the spec's open choice #3),
`packages/specflow-engine/src/specs/lifecycle/worktree-disposal.ts` (`assertPublication`'s
expected-tree/parent-proof branching needs the same externally-merged case, so it does not fall into
the scratch-expecting `'divergent'` branch when `relationship` is left at its true, unchanged ancestry
value), `packages/specflow-engine/src/specs/lifecycle/close/specification.ts` (`closeSpecification`:
thread the new field through; `assertArchivedAt`'s postcondition needs a sibling `assertPresentAt`
check — comparing against the pinned pre-archive `plan.location`, not requiring `location === 'archive'`
— for the externally-merged case, mirroring `closeWorktree`'s own never-archives case),
`packages/specflow-engine/src/specs/lifecycle/close/worktree.ts` (thread the new field through
`closeWorktree`'s request parameter).

**What it does:** Adds a person-initiated Close mode, never inferred automatically from
`relationship === 'divergent'`, that proves by content — not ancestry — that the destination already
has everything the source branch changed, then reuses the already-integrated disposal path without a
new merge. The whole-branch proof (owner decision 2026-11-19) is necessary because this mode has no
ancestry to lean on the way the `already-integrated` path does. Recommend (per the original spec's
Part B "Resolution") also honouring `git.commits.protectedBranches`/`allowedBranches` by reusing the
existing matcher in `version-control/worktrees/*`, without touching Create-time or ordinary-merge
protected-branch semantics.

**Depends on:** nothing new structurally (builds on the existing already-integrated machinery:
`verifyGitTreePathEquivalent`, `verifyCloseSpecificationTrees`, the CAS-rebind/disposal effects); is a
prerequisite for B2.

**Work kind / profile:** backend — `nevo-agents-implementer`.

**Acceptance criteria:**

- Positive fixture (new file, e.g. `close-external-merge.test.ts` in
  `packages/specflow-engine/test/lifecycle/`, real Git): a linked worktree commits a Spec change
  **and** an ordinary application-code change, both are "externally" squash-merged into the target
  (a destination commit whose tree matches but is not a descendant); `finishAfterExternalMerge`
  succeeds — archive + CAS rebind + worktree removal happen, no new merge commit on the destination,
  correct CAS registry update.
- Negative (subtree mismatch): the destination's Specification subtree diverges after the squash merge
  (a conflicting edit); refusal naming the differing path, `CLOSE_EXTERNAL_MERGE_MISMATCH`, no
  mutation.
- Negative (whole-branch gap, owner decision 2026-11-19): the source branch changes both the Spec and
  application code, but the destination only received the Spec's own folder; refusal naming the
  missing application-code path, no mutation. This must come from the real `mergeBaseCommit..sourceCommit`
  diff, not just the canonical Spec subtree.
- Fix 2 (identity): the content-equivalence proof — at admission _and_ at `requireVerifiedCloseIntegration`'s
  re-check — uses `plan.source.head`/`plan.location` (pre-archive), never `journal.archive.committedHead`
  or the post-archive `specs/archive/<slug>` path, for `closeSpecification`'s case (archive always
  precedes integration there).
- Fix 2 (postcondition): `closeSpecification`'s final postcondition for an externally-merged finish
  asserts the Specification is _present_ at its pre-archive location on the destination
  (`assertPresentAt`), not that it shows `'archive'` there.
- Fix 3 (recovery): `requireVerifiedCloseIntegration`'s defense-in-depth re-check — run again
  immediately before every CAS rebind, including on a resumed journal — re-runs the same whole-branch
  content proof `finishAfterExternalMerge`'s admission already performed, not only a canonical-subtree
  tree-hash comparison.
- A retry on an existing `operationId` that flips `finishAfterExternalMerge` is `CLOSE_CONFLICT`
  (`assertMatchingRequest`), matching how `integrateToTargetBranch` is already guarded.
- `assertPublication` (`worktree-disposal.ts`) and `requireVerifiedCloseIntegration`
  (`git/publication.ts`) never select the scratch-candidate-tree branch for an externally-merged
  finish — no scratch is ever created for this mode, and `relationship` stays at its true,
  ancestry-derived value throughout.

#### B2 — CLI/HTTP surface and reference documentation

**Touches:** `packages/specflow-contracts/src/specs/close.ts` (a new optional field on
`CloseWorktreeRequestSchema` and `CloseSpecificationRequestSchema`; `CLOSE_EXTERNAL_MERGE_MISMATCH`
added wherever `CloseOperationErrorCode`'s HTTP-visible values are enumerated — additive beside
#173's own additions to this same file, e.g. `CloseCheckoutRoleSchema`, `IntegrationBranchFactSchema`,
`RepositoryBlockerSchema`), `packages/specflow-engine/src/specs/operations/api.ts`
(`closeWorktreeOperation`'s and `closeSpecificationOperation`'s request parameter types gain the new
field), `packages/specflow-runtime/src/features/specs/close/endpoint.ts` (read/forward the new body
field on both `POST /api/specs/:specId/worktree/close` and `POST /api/specs/:specId/close`; map
`CLOSE_EXTERNAL_MERGE_MISMATCH` to its HTTP status beside the existing `CLOSE_PREFLIGHT`/`CloseErrorSchema`
switch), `packages/specflow/src/specs/command.ts` (a new CLI flag, e.g.
`--finish-after-external-merge`, on `specs worktree close` and `specs close`, beside the existing
`--archive-only`/`--yes` options on those commands), `docs/reference/api/specflow-specification-operations.md`
("## Close"), `docs/reference/cli/specflow-specification-commands.md`, `docs/architecture/runtime/specification-lifecycle.md`
("## Explicit Close intents" table — additive beside #173's own rewrite of this section and its new
"### Close with Git off" subsection; read the current text before editing, since #173 changed the
surrounding prose materially).

**Depends on:** B1 (the Engine capability and error code must exist first).

**Work kind / profile:** integration (contracts + HTTP + CLI) — `nevo-agents-implementer`.

**Acceptance criteria:**

- Extend `packages/specflow-runtime/test/specs/close.http.test.ts`: the new field is accepted on both
  routes, `CLOSE_EXTERNAL_MERGE_MISMATCH` is mapped to its HTTP status with `details.paths`, and (if
  also exposed under a preview query) the preview reflects the requested mode.
- A CLI-level test beside `packages/specflow/src/specs/command.ts`'s existing coverage, exercising the
  new flag end-to-end against the Engine test harness the other `specs worktree close`/`specs close`
  CLI tests use.
- `pnpm docs:check` passes after the doc edits; the edits are additive beside #173's own content in
  the same files/sections, not a rewrite of it.

### Cross-task integration verification

After A1/A2 and B1/B2 are all implemented, run the full lifecycle/Close test suite end to end
(`packages/specflow-engine/test/lifecycle/**`, `packages/specflow-runtime/test/specs/close.http.test.ts`),
the repository's pre-push checklist (typecheck, lint, `pnpm docs:check`, affected unit suites), and
confirm both Parts pass together on one reviewed SHA — one branch/PR
(`feat/close-hardening-181-157`), no side PRs, per this repository's convention. No task here owns a
product/UX decision: the sibling-visibility judgment call (Close B's dialog never shows that A exists)
and the three original Part B implementation-level choices (exact field name, exact error-code name,
which `relationship` values offer the mode) are already resolved or stay open at the same
implementation-discretion level documented above; none require returning to specification or task
planning unless an implementer finds an actual missing architecture decision while building.

### Readiness

**Ready for execution planning.** Nothing in Part A or Part B is blocked on the repository owner: every
fact this re-decomposition relied on was verified directly against current `main` (file contents,
function names, call sites), not assumed from the original pre-#173 decomposition or PR #188's
superseded diff. The one remaining open point (the exact mechanism for `CleanTreeCheck`'s multi-directory
shape in A1) is implementation discretion, left to whichever task implements it, exactly as the
Reconciliation section already characterizes it — not a product or architecture gap.

## Post-merge review fixes (GitHub PR #188, 2026-11-19)

An external reviewer of the pushed PR found four issues against the implemented code; all four are
fixed in the same commit, with regression tests. **Kept here as the historical record of each defect's
reasoning** — see "Reconciliation with PR #173" for why the literal diff that fixed them cannot be
carried forward, and where each fix's requirement is re-expressed as an acceptance criterion against
current `main`.

1. **Sibling staged changes could interrupt Close mid-mutation (P1).** `archiveSpecificationWithCommit`
   (`lifecycle/archive-effects.ts`) staged and committed B's own paths correctly, but its post-commit
   sanity checks (`git diff --cached --name-only`, and the `write-tree` vs. `HEAD^{tree}` comparison in
   `reconcileArchiveCommit`/`proveArchiveCommitPhysical`) were unscoped: a sibling Specification A's own
   PRE-EXISTING staged (not just working-tree-dirty) file, now correctly tolerated at admission by this
   PR's widened allowance, made these post-commit checks fail AFTER B's directory had already been
   physically moved to `specs/archive/<slug>`. Fixed by scoping every one of these checks to B's own
   `oldLiteral`/`newLiteral` pathspecs, exactly like the staging (`git add`) and commit
   (`git commit --only`) calls they verify already are.
2. **`finishAfterExternalMerge` compared the wrong destination path shape for `specification-close`
   (P1, the significant one).** `closeSpecification` always archives locally (`specs/active` →
   `specs/archive` on the source branch) BEFORE any Git integration step runs. An external PR merge
   necessarily predates that purely local rename, so the destination a `finishAfterExternalMerge`
   finish compares against never has `specs/archive/<slug>` — only `specs/active/<slug>`, exactly what
   the destination had when the PR was actually merged. `proveExternallyMergedClose` was still pinned to
   the POST-archive source commit and location for this one proof, so it always mismatched. Fixed by
   deriving a dedicated whole-branch content-equivalence proof (`verifyExternallyMergedContent`,
   `lifecycle/git/publication.ts`) that uses the Specification's PRE-archive identity
   (`plan.source.head` / `plan.location`) whenever a local archive commit exists, recomputing the
   merge-base/branch-diff evidence against that identity instead of trusting the already-pinned
   (post-archive) evidence. `verifyGitTreePathEquivalent`'s own canonical-subtree check keeps requiring
   the Specification's directory to exist at both commits, unchanged. A second, previously-undiscovered
   consequence of the same pre/post-archive mismatch: `closeSpecification`'s own final postcondition
   (`assertArchivedAt` on the destination) also required the destination to show `'archive'`, which an
   externally-merged finish can never satisfy either, for the same reason. Fixed with a sibling
   `assertPresentAt` check (comparing against the pinned PRE-archive `plan.location` instead), mirroring
   the check `closeWorktree`'s own never-archives case already uses.
3. **Recovery didn't re-prove the whole branch before rebind (P2).** `requireVerifiedCloseIntegration`'s
   defense-in-depth re-check, run again immediately before every CAS rebind (including on a resumed
   journal), only re-verified the canonical subtree's tree hash for `finishAfterExternalMerge`, not the
   whole-branch content proof `proveExternallyMergedClose` already performed once. Fixed by re-running
   the SAME `verifyExternallyMergedContent` helper there too, against the freshly re-verified current
   destination HEAD.
4. **The sibling-directory allowance didn't cross-check registry ownership (P2, minor).**
   `activeSpecificationDirectories` exempted any Specification directory physically discovered in the
   checkout, without confirming a registered `specBinding` backs it for that checkout — wider than this
   spec's own "every active Specification bindings of the same checkout" wording, though never a data-
   loss risk (the archive commit stays path-limited to the closing Spec regardless). Fixed by
   cross-checking each physically-discovered directory against the registry's `specBindings` for the
   checkout's `workspaceId`; an unregistered/orphan directory now falls back to the pre-existing strict
   refusal.

## Reconciliation with PR #173 (2026-11-20)

PR #173 ("ux round after audit #168 — close preconditions, demo on the engine, package A") merged
into `main` on 2026-11-19, after this package's branch (`feat/close-hardening-181-157`, merge-base
`7b050d6e`) was created and after PR #188 (its implementation, plus the four fixes above) was opened.
It independently redesigned the Close subsystem this package sits on. Its own body lists "Workflow-
state isolation in a shared checkout (#181)" as an explicit **follow-up** — its author knew #181 was
still open and deliberately left it for this package. This section reconciles intent vs. code shape;
it does not relitigate any decision #173 already made.

Verified directly (not taken on trust): `gh pr view 173`, `git diff
feat/close-hardening-181-157...origin/main` over every file this package touches, and `git merge-tree
HEAD origin/main`. The merge-tree shows exactly **7 conflicting files**: `docs/architecture/runtime/
specification-lifecycle.md`, `docs/reference/api/specflow-specification-operations.md`,
`packages/specflow-engine/src/specs/lifecycle/archive-effects.ts`, `preflight.ts`, `reservation.ts`,
`packages/specflow-engine/src/specs/uncommitted/hold.ts`, `packages/specflow-runtime/src/features/
specs/close/endpoint.ts`, `packages/specflow/src/specs/command.ts`. `docs/index.generated.*` auto-merge
cleanly (generated indices, no competing hand-written content).
`.nevo/definitions/workflow/specification-standard.yaml` does **not** conflict — not because the two
branches agree, but because this package's branch never touches that file at all (`git diff
main...feat/close-hardening-181-157` for it is empty); PR #173's `purpose`-field rewrite there has
nothing to conflict with.

### What #173 actually changed underneath this package (evidence, not the briefing's assumptions)

- **`ClosePlan` is now `GitClosePlan | GitOffClosePlan`** (`lifecycle/model.ts`), selected once per
  Close by `closeRepositoryMode()` (`lifecycle/repository-mode.ts`, owner decision 2026-11-17).
  `GitOffClosePlan.kind` is restricted to `'specification-close'` only — Worktree Close and Workspace
  Close with Git off refuse with `CLOSE_INVALID` before the workflow gate, because both are integrations
  by definition and Git-off Close never integrates. A Git-off Close archives in place with **no commit,
  no Git status check, and no ledger-hold check** (`readUncommittedHold` returns `undefined`
  unconditionally when the project's Git policy is disabled, before any allowance is even consulted).
- **A structured precondition-reporting system replaced throw-with-message-only preflight.**
  `CloseOperationError` now also carries `repository: readonly CloseRepositoryBlocker[]`, with kinds
  `uncommitted-changes`, `integration-target-missing`, `integration-target-branch`,
  `git-operation-in-progress`, `branch-detached`, each naming the affected checkout's role
  (`CloseCheckoutRole`: `'specification' | 'integration-target'`). Two new modules back it:
  `./repository-mode` (the git/git-off decision above) and `./integration-candidates` (the local-branch
  suggestions an `integration-target-missing` blocker carries). `CloseOperationErrorCode` itself is
  otherwise unchanged (still has `CLOSE_PREFLIGHT`, `CLOSE_CONFLICT`, etc.) — it is the detail payload
  that grew, not the code namespace.
- **`archive-effects.ts` was independently decomposed** into `planArchiveMove` / `moveToArchive` /
  `inspectArchiveMove` / `completeArchiveMove` over a new `CloseArchiveMove` type, shared by the Git
  archive-commit path and the new Git-off path (`close/without-git.ts`). The scoped-commit staging and
  post-commit sanity-check block inside `archiveSpecificationWithCommit` — the exact code Fix 1
  patched — is **structurally unchanged** on `main`: its post-commit `git diff --cached --name-only`
  sanity check still runs with no pathspec (unscoped), and its final re-verification is still
  `inspectCleanGitWorkspace(actual.workspace, { specificationDirectory: oldPath, acceptExecutionState:
true })` — single-Specification, pre-#181 behaviour, confirmed by reading the current function body.
- **`UncommittedAllowance`** (`specs/uncommitted/hold.ts`) is untouched: still `{ specId, directory }`,
  one owner. **`CleanTreeAllowance` no longer exists by that name**; `preflight.ts` now takes a
  `CleanTreeCheck { specificationDirectory?, acceptExecutionState?, role? }` — also still
  single-directory. `reservation.ts`'s `allowanceOfPlan` / `allowanceOfRequest` are, line for line, the
  same single-owner logic as before #173 (confirmed by reading both functions on `main`).
- **`closeSpecification` still archives, then integrates**, in that order: `archiveSpecificationWithCommit`
  runs first unconditionally, Git integration (`advanceCloseIntegration`, gated by `needsIntegration`)
  only afterward. The decomposition of `archive-effects.ts` did not move this ordering.
- **No `CloseRepositoryBlocker` kind exists for an external-merge mismatch**, and
  `CloseIntegrationPreparation.relationship` (`'already-integrated' | 'fast-forward' | 'divergent'`) is
  untouched.
- `UncommittedHold`'s reporting shape (`owners: readonly UncommittedHoldOwner[]`, with per-owner
  `workflowState`/`documents` counts, `title`, `stepInProgress`) is new, built for the Close dialog's
  "Ready facts" (#173 package A, U7) — a reporting enrichment, not a change to who is exempted from
  blocking.

### What stays as unchanged intent

- The **target requirement of #181** (an archive-only/exclusive Close of Specification B must not be
  refused by Specification A's own pending, unrelated execution-state ledger entries or dirty paths in
  the same shared checkout) is **fully, unconditionally still needed**. #173 did not touch the
  sibling-isolation problem — only the surrounding reporting/mode types around it. Nothing above
  changes the four analysis-question answers in Part A, the "Out of scope" exclusions (workspace-close,
  `git.commits.auto` semantics, existing refusals), or the fail-closed default.
- The **`finishAfterExternalMerge` field and its semantics** (#157): a person-initiated mode, never
  inferred from `relationship === 'divergent'`, that reuses the already-integrated disposal path after
  proving content-equivalence instead of ancestry. Unchanged.
- The **`CLOSE_EXTERNAL_MERGE_MISMATCH` error code** concept: unchanged, still needed, still a
  `CloseOperationErrorCode`, not a `CloseRepositoryBlocker` (see below).
- The **requirement each of the four PR #188 review fixes protects** (sibling staged changes must not
  interrupt a scoped archive commit; the external-merge content proof must use the Specification's
  pre-archive identity because the destination predates the local archive rename; recovery must re-run
  the same whole-branch proof, not just the subtree check; the sibling-directory allowance must be
  cross-checked against the registry) is unchanged. What does **not** survive is the literal diff that
  implemented each fix — it patches code shapes (`CleanTreeAllowance{ directories }`,
  unconditionally-single-directory `inspectCleanGitWorkspace` calls) that no longer exist on `main` in
  that form.

### What must be re-expressed against the new code

**Part A (#181), re-expressed:**

- The exemption predicate ("a dirty path/ledger entry is accepted when it is B's own execution state,
  or another active Specification A's own execution state of A's own directory") must be layered
  **underneath** `CleanTreeCheck`'s existing single-`specificationDirectory` reporting, not replace it.
  `CleanTreeCheck.specificationDirectory`/`role` must keep naming B's own directory for the
  `uncommitted-changes` blocker's `scope: 'specification' | 'other'` labelling (#173's reporting
  contract) — the widening instead pre-filters sibling execution-state paths out of the unclean-path
  list entirely, before that labelling ever sees them, so a sibling's exempted path never reaches
  `scopedPaths`/the blocker's `paths`/`count` at all. This preserves #173's reporting contract exactly:
  a Close dialog for B never learns A exists.
- `readUncommittedHold`'s filter (`uncommitted/hold.ts`) needs the same widening against its current
  per-owner `held`/`owners` grouping: instead of `record.owner.id !== allowance.specId`, accept any
  `specification`-owned record whose `owner.id` is one of a known set of sibling ids **and** whose path
  is execution-state of _that id's own_ directory (never a client-supplied directory for a foreign
  owner) — the same non-negotiable constraint the original spec stated, now expressed against the
  owners-array shape #173 introduced for reporting rather than a flat allowance.
- `allowanceOfPlan`/`allowanceOfRequest` (`reservation.ts`) and the final re-verification call inside
  `archiveSpecificationWithCommit` (`archive-effects.ts`) must all derive the widened set from the same
  place (the registry's active `specBindings` of the checkout, per Fix 4's cross-check requirement) so
  a Close admission accepts is not later refused by a stricter re-check — this is the same cross-cutting
  consistency requirement the original spec already named for A2, now spanning one more call site
  (`previewCloseOperation`'s `role: 'specification'` call, confirmed at the matching line in
  `preflight.ts`) that did not exist in that form before #173.
- **Open implementation-level choice** (not a product/architecture decision — the exact shape is
  discretion, as the original spec already treats analogous choices): whether the widened predicate is
  expressed as an added field on `CleanTreeCheck` (e.g. `siblingDirectories?: readonly string[]`) or as
  a pre-filter applied by the caller before `inspectCleanGitWorkspace` ever runs. Either keeps
  `specificationDirectory`'s single-directory reporting contract intact; pick whichever reads more
  clearly against the implemented file.
- The four existing Part A verification scenarios (two-Specifications-sharing-one-checkout positive
  case; unexplained-foreign-path negative case; existing suites keep passing) are unchanged as
  acceptance criteria; they just execute against the current file shapes.

**Part B (#157), re-expressed:**

- **Resolved, no owner input needed:** `finishAfterExternalMerge` is a field on `GitClosePlan` (and the
  `worktree-close`/`specification-close` members of `CloseIntent`) only. `GitOffClosePlan.kind` is
  restricted to `'specification-close'` with `integrateToTargetBranch` always `false`/absent — Git-off
  Close structurally cannot integrate, so the combination with an external-merge finish is excluded by
  the type system itself, not by a new runtime refusal.
- **Resolved, no owner input needed:** the external-merge mismatch stays a distinct
  `CloseOperationErrorCode` (`CLOSE_EXTERNAL_MERGE_MISMATCH`), not folded into `CloseRepositoryBlocker`.
  The blocker system reports preconditions the owner fixes _before_ a Close is admitted; the
  external-merge proof is a mid-operation Git-publication failure _after_ admission, the same stage and
  shape as other post-admission refusals (`CLOSE_CONFLICT`, `CLOSE_RECOVERY_REQUIRED`), none of which are
  `CloseRepositoryBlocker`s either.
- **Resolved, no owner input needed:** the archive-then-integrate ordering `closeSpecification` uses is
  unchanged by the `archive-effects.ts` decomposition, so Fix 2's requirement (the content proof must
  compare against the Specification's _pre-archive_ identity, `plan.source.head`/`plan.location`,
  because an externally-merged destination necessarily predates the local archive rename) re-applies
  exactly as originally diagnosed — there is no new ordering question to resolve.
- `CloseWorktreeRequestSchema`/`CloseSpecificationRequestSchema` (`specflow-contracts/src/specs/
close.ts`) still only carry `integrateToTargetBranch`; the new field and `CLOSE_EXTERNAL_MERGE_
MISMATCH`'s HTTP mapping are still needed exactly as B2 originally scoped them, now additive next to
  #173's own additions to the same files (`CloseCheckoutRoleSchema`, `IntegrationBranchFactSchema`,
  etc.) rather than replacing anything.
- The doc anchors B2 targeted still exist with the same headings: `## Explicit Close intents` and the
  new `### Close with Git off` subsection in `specification-lifecycle.md`; `## Close` in the operations
  reference. B2's edits are additive rows/paragraphs beside #173's, not a rewrite of them — but the
  implementer must read the current section text before editing it, since #173 changed its surrounding
  prose materially (the conflict markers in those two files are real content conflicts, not just
  proximity).
- The three original Part B open implementation-level choices (exact request field name, exact new
  error code name, which `relationship` values offer the mode) are unchanged and still open at the same
  level — still not product/architecture decisions.

**The four PR #188 review fixes — fold into A2/B1 as acceptance criteria, do not port the diff forward:**
The uncommitted diff on the branch patches code shapes (`CleanTreeAllowance{ directories }`,
`activeSpecificationDirectories(root)`, a since-decomposed `archiveSpecificationWithCommit`) that do not
exist on current `main`; reapplying it as a patch is not meaningful. Each fix's underlying requirement
is instead a correctness requirement the rebuilt tasks must satisfy from the start:

1. **(→ Part A2)** Every post-commit sanity check inside the scoped archive commit (`git diff --cached
--name-only`, the write-tree/`HEAD^{tree}` comparison) must be scoped to the closing Specification's
   own `oldLiteral`/`newLiteral` pathspecs — confirmed still unscoped on current `main`, same bug class,
   same fix shape.
2. **(→ Part B1)** The whole-branch/subtree content-equivalence proof for `finishAfterExternalMerge`
   must use the Specification's pre-archive identity (`plan.source.head`/`plan.location`) whenever a
   local archive commit already exists, and the final postcondition for an externally-merged finish
   must assert the Specification is _present_ at that pre-archive location on the destination, not that
   it shows `'archive'` there (mirroring `closeWorktree`'s own never-archives case).
3. **(→ Part B1)** `requireVerifiedCloseIntegration`'s defense-in-depth re-check (run again before every
   CAS rebind, including on a resumed journal) must re-run the _same_ whole-branch content proof
   `finishAfterExternalMerge`'s admission already performed, not just the canonical-subtree tree hash.
4. **(→ Part A2)** The sibling-directory exemption set must be cross-checked against the registry's
   `specBindings` for the checkout's `workspaceId`; a physically-discovered but unregistered/orphan
   directory falls back to the pre-existing strict refusal, never a silent exemption.

### Decisions for the repository owner

None of the above required escalation — every question the task brief raised (field placement on
`GitClosePlan`, blocker-vs-error-code for the mismatch, archive/integrate ordering interaction) resolves
from code evidence already on `main`, consistent with how #173 itself was decided (owner decisions
2026-11-12/17 this package already cited are unaffected).

One judgment call worth naming explicitly, resolved here rather than escalated, because it is small and
reversible: #173 added a user-facing Close dialog that reports repository preconditions
(`CloseRepositoryBlocker`s) so the person can fix them before closing. Part A's widening makes a
sibling Specification's own pending execution state **completely invisible** to that dialog for Close B
— not shown even as a non-blocking fact. This matches the original spec's "known, accounted-for dirty
state" framing and keeps this package backend/Engine-only (no UI surface, as the original task
decomposition already states) rather than reopening any part of #173's Close dialog. If the owner later
wants the dialog to show "another Specification has unsaved work here, which won't block you" as an
informational line, that is a separate, additive UX change against #173's existing dialog — out of
scope for this package and not a precondition for implementing it.

### Readiness (supersedes the "Readiness" section above)

**Partially ready for decomposition, with isolated, named, non-blocking implementation-level
restructuring** — not a product or architecture gap:

- Part A (#181): ready. Target requirement, evidence and verification scenarios are unchanged; the
  only re-expression needed is mechanical (widen the exemption predicate underneath the new
  `CleanTreeCheck`/`UncommittedHold` reporting shapes without changing what they report), with one
  open implementation-level choice (field-on-`CleanTreeCheck` vs. caller-side pre-filter) left to
  whichever task implements it.
- Part B (#157): ready. Field placement, error-code status and archive/integrate ordering are all
  resolved from evidence above; the three original open implementation-level choices are unchanged;
  B2's doc and contract edits are additive beside #173's own additions to the same files.
- The four PR #188 review-fix requirements: ready, carried forward as acceptance criteria on A2
  (fixes 1 and 4) and B1 (fixes 2 and 3) rather than as a diff to reapply.
- **Before task-planner re-decomposes:** treat every "Touches" file list and code-shape detail in the
  "Task decomposition" section above (A1/A2, B1/B2) as superseded by this section — the dependency
  shape and verification scenarios they describe still hold, but the exact functions/types they name
  (`CleanTreeAllowance`, `activeSpecificationDirectories(root)`, single-argument
  `inspectCleanGitWorkspace` calls) must be re-read from current `main` before writing new task
  "Touches" lists, not copied from the stale section.

## Implementation outcome (2026-11-20)

A1/A2 and B1/B2 (the "Task decomposition … against `main` post PR #173" section above) were
implemented on branch `feat/close-hardening-181-157`, merged with `origin/main` (merge commit
`66b676a86`), as commit `cb3bd1b99` ("feat(engine): Close hardening — shared-checkout isolation and
finish-after-external-merge (#181, #157)") plus a follow-up correctness fix, commit `89cbca7e7`
("fix(engine): scope archive post-commit checks to the #181 sibling allowance, not a blanket
exemption").

**What landed, against the task decomposition above:** `siblingSpecificationDirectories`
(`preflight.ts`) derives the sibling set from `listWorkspaceSpecifications` cross-checked against
`registry.specBindings` (A2/Fix 4); `UncommittedAllowance`/`CleanTreeCheck` gained an
`isAcceptedDirtyPath` exemption predicate wired through admission, `reservation.ts`'s
`allowanceOfPlan`/`allowanceOfRequest`, and `archive-effects.ts`'s re-verification (A1/A2).
`finishAfterExternalMerge` is a field on `GitClosePlan` only, as planned; `proveExternallyMergedClose`/
`verifyExternallyMergedContent` (`git/publication.ts`) prove whole-branch content equivalence against
the Specification's pre-archive identity (`plan.source.head`); `requireVerifiedCloseIntegration` and
`worktree-disposal.ts`'s `assertPublication` gained the externally-merged branch so recovery re-proves
the whole branch, not just the subtree (B1/Fixes 2–3); `CLOSE_EXTERNAL_MERGE_MISMATCH` was added as a
distinct error code, threaded through contracts/operations/endpoint/CLI/journal-codec (B2).

**Self-found regression (A2):** the first draft of the archive-effects.ts post-commit scoping
exempted any dirty path anywhere in the checkout, not just a sibling Specification's own execution
state, which silently broke the existing `close-sigkill.test.ts` "alien index additions" crash test.
Fixed as `assertNoUnexpectedDirtyPaths` (checkout-wide `git status`, exempting only another active
Specification's own execution state via the same `siblingSpecificationDirectories` predicate admission
uses) in `89cbca7e7`.

**Independent review (same-day):** confirmed the LC33 regression fix is correctly scoped (a genuinely
alien file still refuses), the pre-/post-archive identity fix is correct and covered by a test that
would fail on revert, the whole-branch proof is content-based (not existence-only) with 5 passing
real-Git tests, and found no stray pre-#173 code shapes left in the branch. Full suites (51 engine
lifecycle tests, 11 runtime HTTP tests, 2 CLI tests), typecheck/lint across the four touched packages,
and `pnpm docs:check` all green, re-run independently on Linux. Verdict: **ready to push for
independent GitHub review**, no blocking findings.

Two non-blocking items the review surfaced as follow-ups, not required before push: (a) the exact
"open implementation-level choice" named above (3) — `finishAfterExternalMerge` is offered
unconditionally rather than gated to `relationship === 'divergent'` only; resolved as safe because the
whole-branch content proof is the actual safety boundary regardless of the true relationship; (b) no
dedicated SIGKILL/crash-recovery test exists yet specifically for the `finishAfterExternalMerge`
verification path (unlike `close-sigkill.test.ts`'s coverage of other paths) — low risk since that path
performs no Git mutation of its own and reuses already crash-tested checkpoint/disposal machinery, but
worth a follow-up test given this is explicitly a hardening/recovery feature.
