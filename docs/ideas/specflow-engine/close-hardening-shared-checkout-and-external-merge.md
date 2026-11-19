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
  - touching lifecycle/preflight.ts, lifecycle/reservation.ts, uncommitted/hold.ts or lifecycle/git/*
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

**Ready for task decomposition.** No missing owner decision blocks either part: #181's target
requirement and four analysis questions are answered above from code evidence; #157's "Expected"
behaviour is decision-complete modulo the three implementation-level choices listed, none of which
are material product or architecture decisions.

## Task decomposition

One branch/PR (`feat/close-hardening-181-157`), both Parts in sequence as separate reviewable
commits/tasks; no ordering dependency between Part A and Part B themselves, only within each
Part. All tasks are backend/Engine-only (no UI surface): recommended implementation profile for
every task is **`nevo-agents-implementer`**. Verification follows
[`engineering.shared.testing`](../../engineering/shared/testing.md): focused unit tests
co-located with the module they verify, cross-boundary/real-Git scenarios in the package's
`test/lifecycle/` tree, transport contract tests beside the existing HTTP/CLI suites.

Two consumer sites were found during discovery that the specification text does not name, because
they independently branch on the exact interfaces Parts A and B widen; both are added to the task
file lists below so the change stays consistent instead of silently regressing them:

- Part A's `CleanTreeAllowance` is also consumed by
  `packages/specflow-engine/src/specs/lifecycle/archive-effects.ts`
  (`archiveSpecificationWithCommit`'s final re-verification immediately before the archive
  commit, today called with `{ executionStateOf: oldPath }`). If only `preflight.ts`'s admission
  call is widened, this later re-check would regress to today's single-directory behaviour and
  refuse a Close that admission just accepted.
- Part B's dispatch is not the only place that branches on `CloseIntegrationPreparation.relationship`:
  `packages/specflow-engine/src/specs/lifecycle/worktree-disposal.ts`'s `assertPublication` and
  `packages/specflow-engine/src/specs/lifecycle/git/publication.ts`'s
  `requireVerifiedCloseIntegration` both pick the expected published tree (and, for `'divergent'`,
  require scratch-candidate parent evidence) from that same field. An externally-merged Close that
  is finished with the real ancestry-derived `relationship` left as `'divergent'` (no re-merge, no
  scratch, `publishedCommit` set to the destination's own current `targetCommit`) must not fall
  into that scratch-expecting branch in either file, or disposal/verification will refuse a Close
  that was already proven safe.

### Part A — shared-checkout state isolation (#181)

#### A1 — Widen the allowance types to multiple owners

**Touches:**
`packages/specflow-engine/src/specs/uncommitted/hold.ts` (the `UncommittedAllowance` interface
and `readUncommittedHold`'s filter), `packages/specflow-engine/src/specs/lifecycle/preflight.ts`
(the `CleanTreeAllowance` interface and `inspectCleanGitWorkspace`'s filter).

**What it does:** Replaces the single `{ specId, directory }` / `{ executionStateOf: string }`
shape with one that can carry _several_ Specifications' own directories (for example a
`ReadonlyMap<specId, directory>` for `UncommittedAllowance`, and a `readonly string[]` of
directories — or an equivalent predicate — for `CleanTreeAllowance`; the exact shape is
implementation discretion, not a product decision). `readUncommittedHold`'s filter changes from
"this one `specId` equals `allowance.specId`" to "the record's `owner.id` is one of the allowance's
known Specification ids, and the path is execution-state of **that id's own** directory" —
i.e. it must still never accept a path just because _some_ known directory matches; each owner's
entries are checked only against its own directory. `inspectCleanGitWorkspace`'s filter becomes "the
path is execution-state of any of the allowance's directories." No behavioural change yet — nothing
calls these with more than one directory until A2.

**Depends on:** nothing (pure type/predicate widening; existing single-directory callers keep
compiling with a one-entry allowance).

**Verification:** Extend the existing unit coverage of `hold.ts`/`preflight.ts`'s filters (co-located
or within the existing lifecycle unit tests) with a case carrying two+ directories: a path that is
execution-state of directory 2 but not directory 1 is still accepted; a path that matches no known
directory is still refused. No real Git needed for this part.

#### A2 — Derive the wider allowance from sibling active Specifications and keep every call site consistent

**Touches:** `packages/specflow-engine/src/specs/lifecycle/reservation.ts` (`allowanceOfPlan`,
`allowanceOfRequest`), `packages/specflow-engine/src/specs/lifecycle/preflight.ts`
(`previewCloseOperation`'s `inspectCleanGitWorkspace` call for `specification-close`),
`packages/specflow-engine/src/specs/lifecycle/archive-effects.ts`
(`archiveSpecificationWithCommit`'s `inspectCleanGitWorkspace` re-verification — see the
cross-cutting note above).

**What it does:** For an archive-only (or primary-folder) `specification-close` of `specId = B` in
checkout `W`, builds the allowance from **B's own directory plus every other active Specification's
own `specs/active/<slug>/` directory physically present in the same checkout `W`** — read from the
verified checkout root (the same `listWorkspaceSpecifications(root)` physical manifest read
`previewWorkspaceClose` already uses for workspace-close occupants), never from a client-supplied
directory for a foreign owner. `allowanceOfRequest` (used before a plan exists, when the first
preview already refused) resolves the same way from the request's checkout. The three call sites
(`preflight.ts` admission, `reservation.ts`'s ledger-hold check, `archive-effects.ts`'s final
re-verification) must all be built from the _same_ derivation so a Close that admission accepts is
not later refused by a stricter re-check. Out of scope stays out of scope: `workspace-close` and
`worktree-close`/legacy spec-scoped integrated Close are not touched (the first already derives the
full occupant set itself; the latter two are already refused up front by `CLOSE_SHARED_WORKTREE`
independent of this bug).

**Depends on:** A1 (the widened types).

**Verification (matches the spec's "Verification" section for Part A):**

- New scenario in `packages/specflow-engine/test/lifecycle/close-specification-lifecycle.test.ts`
  (or a sibling file in that same `test/lifecycle/` tree): two Specifications sharing one checkout
  (primary-folder case), Specification A has an uncommitted workflow-state ledger entry (a started
  step, `git.commits.auto` off); archive-only Close of Specification B succeeds, and A's files and
  ledger entry are asserted untouched afterward.
- Negative case in the same file/area: an unexplained dirty path that belongs to no registered
  Specification's execution state still refuses with `CLOSE_PREFLIGHT`, naming the path.
- Run the existing Close/preflight/ledger suites (`close-specification-lifecycle.test.ts`,
  `lifecycle-admission.test.ts`, `close-worktree-lifecycle.test.ts`, the `hold`/ledger unit tests)
  and confirm they keep passing unmodified in intent — only the allowance's scope changed, per the
  spec's "existing suites must keep passing" requirement.

### Part B — finish Close after an external (PR) merge (#157)

#### B1 — Engine: explicit external-merge finish, reusing the already-integrated disposal path

**Touches:**
`packages/specflow-engine/src/specs/lifecycle/model.ts` (new optional field on the `worktree-close`
and `specification-close` members of `CloseIntent`/`ClosePlan` — e.g. `finishAfterExternalMerge?:
boolean` — threaded through `normalizeCloseIntent`/`fingerprintCloseIntent`; a new
`CloseOperationErrorCode` for the mismatch refusal, e.g. `CLOSE_EXTERNAL_MERGE_MISMATCH`, with a
`paths` detail analogous to `CLOSE_PREFLIGHT`'s),
`packages/specflow-engine/src/specs/lifecycle/preflight.ts` (accept and pin the new request field in
`previewCloseOperation`), `packages/specflow-engine/src/specs/lifecycle/reservation.ts`
(`assertMatchingRequest` must treat the new field as part of the immutable reserved intent, like
`integrateToTargetBranch`), `packages/specflow-engine/src/specs/lifecycle/git/publication.ts` (a new
function alongside `proveAlreadyIntegratedClose` — e.g. `proveExternallyMergedClose` — that, instead
of requiring `relationship === 'already-integrated'`, calls `verifyGitTreePathEquivalent` (from
`version-control/git/integration.ts`, reused as-is) for every occupant's canonical subtree between
the pinned source and the pinned **current destination HEAD** regardless of `relationship`; on
success proceeds exactly like `proveAlreadyIntegratedClose` — `publishedCommit = targetCommit`, stage
`integration-verified` — reusing the same `verifyCloseSpecificationTrees`/CAS-rebind/disposal effects;
on a differing subtree, refuses with the new error code naming every differing canonical path, not
just the first; `requireVerifiedCloseIntegration` in the same file needs the externally-merged case
added to its expected-tree branching — see the cross-cutting note above),
`packages/specflow-engine/src/specs/lifecycle/close/integration.ts` (`advanceCloseIntegration`'s
dispatch: when the plan requests the external-merge finish, call the new prove function instead of
switching on `relationship` — the spec's open choice #3, whether this is gated to
`relationship === 'divergent'` only or offered unconditionally, is implementation discretion),
`packages/specflow-engine/src/specs/lifecycle/worktree-disposal.ts` (`assertPublication`'s
expected-tree/parent branching needs the same externally-merged case — see the cross-cutting note
above), `packages/specflow-engine/src/specs/lifecycle/close/worktree.ts` and
`.../close/specification.ts` (thread the new request field through `closeWorktree`/`closeSpecification`'s
public parameter objects).

**Whole-branch proof addendum (owner decision 2026-11-19, independent review):** the canonical-subtree-only
check above is necessary but not sufficient — it is weaker than the `already-integrated` path it
mirrors, which is backed by true ancestry (the whole branch, not just the Spec subtree). Extend
`proveExternallyMergedClose` to also verify, by content, every path
`inspectCloseGitIntegration`'s existing `mergeBaseCommit..sourceCommit` diff names (the same list
its "foreign spec ownership" check already computes, exposed as `sourceBranchPaths`) that is not
already covered by a canonical occupant subtree. `version-control/git/integration.ts` gained
`verifyGitPathContentEquivalent`, an unrestricted-path sibling of `verifyGitTreePathEquivalent`
(which keeps its canonical-subtree-only regex), for this arbitrary-path case.
`verifyCloseSpecificationTrees` (lifecycle/git/publication.ts) gained `extraPaths`/`collectAll`
options instead of a near-duplicate function, so both the Spec-subtree-only callers and this
whole-branch caller share one helper.

Recommend (per the spec's "Resolution," point in Part B) also honouring
`git.commits.protectedBranches`/`allowedBranches` for this new path reusing the existing pattern
matcher in `packages/specflow-engine/src/version-control/worktrees/*`, without changing Create-time or
ordinary-merge protected-branch semantics.

**Depends on:** nothing new structurally (builds on the existing already-integrated machinery), but
is a prerequisite for B2.

**Verification (matches the spec's "Verification" section for Part B):**

- New fixture-based test, likely a new file `close-external-merge.test.ts` in
  `packages/specflow-engine/test/lifecycle/` (real Git, matching the sibling files in that directory):
  create a linked worktree, commit on it, "externally" squash-merge its content into the target
  branch (simulating GitHub — a distinct destination commit whose tree matches the source
  Specification subtree but is not a descendant), then exercise the new finish mode; assert archive +
  CAS rebind + worktree removal happen with no new merge commit on the destination and a correct CAS
  registry update.
- Negative case in the same file: deliberately diverge the destination's Specification subtree
  (simulate a conflicting edit on the target branch after the squash merge); assert a refusal naming
  the differing path with the new error code, and no mutation (registry, worktree and destination
  branch unchanged).
- A unit-level check (co-located with `preflight.ts`/`reservation.ts`'s existing tests) that the new
  request field is part of `assertMatchingRequest`'s immutable-intent comparison (a retry that flips
  it is `CLOSE_CONFLICT`, matching how `integrateToTargetBranch` is already guarded).

#### B2 — CLI/HTTP surface and reference documentation

**Touches:** `packages/specflow-contracts/src/specs/close.ts` (new optional field on
`CloseWorktreeRequestSchema` and `CloseSpecificationRequestSchema`; the new error code added
wherever `CloseOperationErrorCode`'s HTTP-visible values are enumerated/mapped),
`packages/specflow-engine/src/specs/operations/api.ts` (`closeWorktreeOperation`'s and
`closeSpecificationOperation`'s request parameter types gain the new field),
`packages/specflow-runtime/src/features/specs/close/endpoint.ts` (read and forward the new body
field on `POST /api/specs/:specId/worktree/close` and `POST /api/specs/:specId/close`; map the new
error code to its HTTP status, following the existing `CloseErrorSchema`/`CLOSE_PREFLIGHT`
pattern), `packages/specflow/src/specs/command.ts` (a new CLI flag — e.g.
`--finish-after-external-merge` — on `specs worktree close` and, if B1's scope is extended to it,
`specs close`), `docs/reference/api/specflow-specification-operations.md` (document the new request
field/error code under "## Close"), `docs/reference/cli/specflow-specification-commands.md`
(document the new flag), `docs/architecture/runtime/specification-lifecycle.md`'s "Explicit Close
intents" table and "Safe integration, rebind and disposal" section (one row/paragraph describing the
new mode and that it is person-initiated, never inferred from `relationship === 'divergent'`). Keep
these reference-doc edits in the same PR as the code they describe, per this repository's own
convention of updating documentation alongside the change rather than in a follow-up.

**Depends on:** B1 (the Engine capability and error code must exist first).

**Verification:**

- Extend `packages/specflow-runtime/test/specs/close.http.test.ts` with the new field accepted on
  both routes, the new error code mapped to its HTTP status with `details.paths`, and (if also
  exposed under `/close/preview`) the preview reflecting the requested mode.
- A CLI-level test beside `packages/specflow/src/specs/command.ts` (or its existing test
  coverage) exercising the new flag end-to-end against the Engine test harness used by the other
  `specs worktree close` CLI tests.
- Re-run `pnpm docs:check` (already required by the repo's doc-validation convention) after the
  reference doc edits.

### Cross-task integration verification

After A1/A2 and B1/B2 are all implemented, run the full lifecycle/Close test suite end to end
(`packages/specflow-engine/test/lifecycle/**`, `packages/specflow-runtime/test/specs/close.http.test.ts`),
the repository's pre-push checklist (typecheck, lint, `pnpm docs:check`, affected unit suites) and
confirm both Parts pass together on one reviewed SHA, per the spec's "Scope and sequencing" section.
No task here owns a product/UX decision; the three Part B implementation-level choices (exact field
name, exact new error code, which relationships the mode is offered for) stay with whichever task
(B1 for the first two, B1/B2 jointly for the third) implements them, and do not need to come back to
specification or task planning unless an implementer finds an actual missing architecture decision
while building.
