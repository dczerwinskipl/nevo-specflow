---
id: architecture.runtime.specification-worktree-integration
type: architecture
title: Worktree Close Git integration and rebind
status: current
scope: specflow
areas: [runtime, cli, security]
read_when:
  - changing worktree integration, publication proof, CAS rebind or disposal
  - reviewing external merge, conflict and recovery scenarios
summary: >-
  Physical Git proof, integration, CAS registry rebind, shared-worktree safety and disposal refusal rules.
related:
  - architecture.runtime.specflow-lifecycle
  - architecture.runtime.specification-close-admission
  - engineering.shared.specflow-git-recovery
---

# Worktree Close Git integration and rebind

## Safe integration, rebind and disposal

Git integration requires verified source and destination checkout identity, committed branch,
pinned HEAD/index/tree and physical publication proof. An already-integrated branch, fast-forward
or controlled divergent candidate may be supported; merge conflicts are reported and fenced.
No silent checkout, forced merge, rebasing, deletion of refs or synthetic confirmation of
external agent quiescence is allowed.

**Finish after an external pull-request merge.** A project that merges through pull requests (a
GitHub squash merge, for example) breaks the Git ancestry Close otherwise relies on: the destination
already has the content, but `isAncestor(sourceCommit, targetCommit)` reports `false`, so Close sees
`relationship: 'divergent'` and has no supported way to say "the destination already has this;
finish without merging again." `finishAfterExternalMerge` is a person-initiated Close mode
(`specs worktree close` only — never inferred automatically from `relationship === 'divergent'`, so a
real merge the person actually wants is never silently skipped) that proves the equivalent fact by
content instead: every path the source branch's own merge-base diff names, and the Specification's
own canonical subtree(s), must be byte-identical between the Specification's **pre-archive** source
HEAD and the destination's current HEAD — not just the subtree, so a partial external merge (the
Spec's folder landed, an ordinary code change from the same branch did not) also refuses. The
pre-archive HEAD matters because `closeSpecification` always archives locally (`specs/active` →
`specs/archive` on the source branch) before integrating, and an external merge necessarily predates
that purely local rename: the destination never has `specs/archive/<slug>`, only
`specs/active/<slug>`, exactly what was actually merged; the Close postcondition for this mode
asserts the Specification is **present** at that pre-archive location on the destination, not that it
shows `'archive'` there. On success, Close skips the merge/fast-forward step entirely and reuses the
same archive + CAS-rebind + worktree-disposal effects the already-integrated path uses — no scratch,
no new merge commit, and `relationship` stays at its true, unchanged ancestry value throughout. On
failure, Close refuses with the distinct `CLOSE_EXTERNAL_MERGE_MISMATCH` error code, naming every
differing or missing path (not just the first); the defense-in-depth re-check immediately before CAS
rebind re-runs the same whole-branch content proof, not only a subtree tree-hash comparison, so a
resumed/recovered Close is re-verified exactly like a fresh one.

The Worktree Close preview (`readCloseMergeFacts`) reflects this mode truthfully instead of
describing a merge that will not happen: with `finishAfterExternalMerge: true` it answers
`merge: {status: 'not-integrated', reason: 'already-merged-externally', sourceBranch,
targetBranch}` — never `'integrates'` with a `commitsAhead` count — because no merge commit is
ever created in this mode. `GET /api/specs/:specId/worktree/close/preview` forwards the same flag
(as `?finishAfterExternalMerge=true`); the Specification Close preview route ignores it, consistent
with that kind never accepting the field.

**Restricted to Worktree Close.** `finishAfterExternalMerge` is not
offered on Specification Close at all: the field does not exist on its request type, its HTTP body
schema and `specs close` CLI command, so a caller cannot even express the combination through those
boundaries. A caller that still reaches the Engine with it set — bypassing the typed boundary, or
replaying an `operationId` with it flipped — is refused explicitly and unconditionally, before any
Git inspection or mutation, with `CLOSE_EXTERNAL_MERGE_UNSUPPORTED`. The reason is semantic, not
accidental: Specification Close's contract is that after success the Specification's canonical state
is `archived`, but this mode never merges or integrates, so the local archive-rename commit made on
the source branch never reaches the destination branch — the Specification would stay `active` there
forever while Close reported `completed`/`integrated-and-removed`, a false success. Worktree Close's
contract is narrower (retire a worktree binding whose content already merged) and never claims the
Specification's canonical state changed, so only it may use this mode. Archiving the Specification
directly on the target branch is a deliberate, separate problem, deferred (not solved) by this
restriction; it needs its own design, ideally aligned with the project's PR policy.

> Follow-up: the original spec recommended this mode also honour `git.commits.protectedBranches`
> through the existing branch-pattern matcher; that recommendation is **not yet implemented** — this
> package only adds the content proof and the disposal reuse above.

Only after publication proof does one CAS transfer every pinned binding. A second registry
revision retires the workspace registration only after a separate non-force physical removal.
The Engine checks source incarnation and inventories ignored/untracked user data before removing
any managed checkout. Failed or unknown effects preserve the journal, claims and recovery
evidence. Changed incarnation returns recovery-required instead of deleting the new occupant.

A managed agent execution holds a project-wide
[workspace execution claim](workspace-execution-claims.md), so Create and Close are not admitted
while one is unsettled.

A read-only Session Turn holds no durable claim, yet its agent works in the checkout and Close MUST
NOT remove it from under the agent. The Engine does not know agent Sessions: the host process supplies
a checkout quiescence port (`withCheckoutQuiescence`), and Close asks it when it starts and again right
before the durable disposal intent; without the port Close does not remove a checkout. A refusal is a
resumable `CLOSE_BLOCKED` with a `session-turn-running` blocker. Agent Sessions run only inside the
Runtime that owns the Project's Session store (one local owner, see
[Session storage](../ai/session-storage-and-lifecycle.md#storage-choice-and-process-model)), so:

- the owning Runtime answers from its own Turns (its in-process workspace occupancy, which also holds
  the checkout against new Turns while Close runs) and from the native Turns its store holds unsettled
  in that checkout: a Turn that restart recovery left `unknown` is in no occupancy, yet its agent may
  outlive the earlier run, so it counts too (the Close preview and dialog show it as well);
- any other process (the CLI, or a Runtime without managed Sessions) reads the store's durable owner
  record read-only, in a short-lived Worker. A recorded owner whose process is alive, or cannot be
  proven stopped (only `ESRCH` proves it), refuses: close from the SpecFlow UI or stop that Runtime. No
  store, or no owner, means no Turn can run, except an agent that a crashed Runtime started: a native
  Turn in that checkout that never settled (still nonterminal, or `unknown` after restart recovery)
  refuses too. A store that cannot be read refuses.

A Turn that starts after the answer sees the unfinished Close journal and refuses, so the answer
cannot go stale before the removal. On Windows a dead Runtime's provider tree dies with its Job
Object; on POSIX its process group may outlive it, which is why the unsettled-Turn evidence counts. An external agent started outside Runtime holds no claim, and the Engine
MUST NOT claim it is quiescent. Writer admission for workflow steps is not implemented yet.
See [durable recovery](../../engineering/shared/specflow-git-recovery.md).
