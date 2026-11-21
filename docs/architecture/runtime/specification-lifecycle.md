---
id: architecture.runtime.specflow-lifecycle
type: architecture
title: Specification Create, archive and shared-workspace lifecycle
status: current
scope: specflow
areas: [runtime, cli, security]
read_when:
  - modifying Create, Close, Git integration or registry rebind
  - reviewing whole-workspace disposal and recovery invariants
summary: >
  Implemented E2 Create and explicit Specification/workspace Close invariants, Git
  publication proof and CAS rebind.
related:
  - architecture.runtime.specification-documents
  - adr.0016-engine-owned-document-commits
  - architecture.runtime.specflow-project-home
  - engineering.shared.specflow-git-recovery
  - reference.api.specflow-specification-operations
---

# Specification Create, archive and shared-workspace lifecycle

## Create and the three distinct Git choices

Create pins one immutable operation intent, Spec identity, normalized inputs and target workspace.
The Engine generates `slug`, `specId`, the new worktree's branch and its physical path.
`baseRef` selects the starting Git commit, not the eventual merge destination.
When that base is a local branch (an explicit `refs/heads/*` or short branch name, or `HEAD` attached to a
branch in Project Home), Create also records it as the new workspace's `startedFrom` (Create journal target,
then the workspace registration). It is a fact for Close to offer as an integration-branch candidate, never a
merge destination. A commit, a tag or a detached `HEAD` records none, and workspaces created before it have none.
With `HEAD`, the base commit is read from that branch, so the recorded branch and the base commit name the same
tip. A name the journal and the registry cannot record (over 255 characters, or with whitespace) is not recorded.
The registration also records the new worktree's own `branch`. Close uses it to leave the Specification's branch
out of the integration-branch candidates even when the worktree is detached.
A new worktree's optional `integrationTargetWorkspaceId` chooses a verified registered checkout;
the source workspace pins the chosen destination's `workspaceId`, physical incarnation and branch.
Without an explicit destination the later Close uses project `integrationTargetBranch` through
primary. Omitted versus explicit `baseRef` or `branch` remains part of the retry fingerprint.
Create does not switch primary or promise that Close can merge in the future.

A Specification can instead be created inside a verified existing workspace without provisioning
another branch. Multiple Spec bindings in the same workspace deliberately share Git history.

The documents a Specification starts with (the archetype, its document registry and the scaffold files) are
defined by the [Specification documents layer](specification-documents.md); the target contract is in the
[Specification documents HTTP contract](../../reference/api/specification-documents.md). Create names an
archetype (there is no default in any layer), may select suggested documents and add files and folders, and
writes the whole scaffold in one commit.

### Create journal retention

The Create journal format is `version: 2`. It keeps evidence only (per file: path, sha256, bytes; the catalogue
revision the scaffold was generated from; the registered document ids). The scaffold contents are written once,
before the journal is published, to `<operation-id>.payload/<sha256>` in the same folder (temp file, fsync,
rename); recovery reads and verifies that payload and never regenerates from the current catalogue or templates,
so a catalogue change between a crash and the resume has no effect. Reserving a new Create (under the same control
lock, without Git) deletes `completed` journals older than 7 days together with their payload folder, at most 50
per reservation; it also deletes a payload folder that has no journal and is older than 7 days (a crash between
the payload write and the journal publication) and an _unsupported_ journal older than 7 days. In-progress,
`recovery-required` and corrupt journals of the current format are never removed automatically. Retries within the
window replay idempotently; afterwards the same operationId is a new operation and slug protection comes from the
Specification on disk and the registry.

An _unsupported_ journal (not JSON, or no numeric `version`) is never interpreted. It is returned
separately by the listing and is not a resource claim, so it can block neither Create nor Close; read by operation
id it answers `CREATE_JOURNAL_UNSUPPORTED` (503); the tolerant list shows it as `recovery-required` with that code.

The intent fingerprint covers the archetype id and version, the suggestions, the folders and, for added documents,
path, type and the sha256 of the content. The catalogue revision is a precondition checked when a new operation is
admitted (`CATALOGUE_STALE`) and is **not** part of the fingerprint, so a retry of an existing operation after the
catalogue changed replays the stored result. A body that differs in any fingerprinted field, including an
`archetypeVersion` that moved with the catalogue, is `CREATE_CONFLICT`: the offline CLI takes the archetype version
from the live catalogue, so to finish an operation after the catalogue changed use `specs recover <operation-id>`
(it replays the journal's recorded intent, not the live catalogue), not a re-submit.

Reservation holds the control lock while it writes the payload (fsync per file), so the hold time grows with the
number and size of the scaffold files (at most 64 files and about 2 MiB of content); contention on a very large
Create shows as a longer wait for other Creates and Closes, not as a failure.

### Create commits the scaffold when Git is enabled

When `git.enabled` is true Create commits the scaffold (`specs/active/<slug>/specification.yaml` and every
document file of the journal, nothing else; empty folders exist only in the manifest) as ONE commit through the Engine's one commit capability, between writing the
manifest and binding the registry (journal stages `commit-writing`, `commit-written`; public progress
step `committing-specification`). The commit lands on the checkout's current branch for the current
folder and existing-workspace targets, and on the new branch (one commit on top of the base commit) for
a new worktree. It is `git commit --only` over the literal paths of the journal: the user's other staged hunks,
unstaged edits and untracked files are untouched. The author is the user's configured Git identity
(Engine identity when unconfigured), the committer is the Engine, hooks and signing are off, and an
operation trailer makes replay idempotent. See
[ADR 0013](../decisions/0013-engine-owned-commits-and-protected-branches.md).

- **Protected branches.** `git.commits.protectedBranches` / `allowedBranches` (committed project
  config; nothing protected by default) are evaluated before anything is written:
  `BRANCH_PROTECTED` (422) for a protected or not-allowed branch or a protected new-worktree branch name,
  `COMMIT_BLOCKED` (409) when the checkout cannot take a commit now (detached HEAD, merge/rebase in
  progress, unmerged paths, ignored scaffold path, held index lock). Nothing is reserved, written or
  journalled in these cases.
- **After files exist.** A commit that cannot be made after the scaffold was written (a branch protected
  or a merge started meanwhile, a Git failure) is `COMMIT_FAILED` (503): the journal stays at
  `commit-writing`, files stay in place, and the operation is recovery-required. The operator resumes
  the same operation with the Engine's `resumeInterruptedOperation` once the cause is fixed, or commits
  the scaffold files by hand (resume accepts byte-identical, clean files of the full list; a hand commit of CRLF
  content under `core.autocrlf=true` without a normalising `.gitattributes` rule is refused, so commit it with
  `git -c core.autocrlf=false add --renormalize specs` (force re-hashing, then make a follow-up commit
  if a resume was already attempted), see ADR 0013). Re-submitting the same
  `operationId` meanwhile answers `CREATE_RECOVERY_REQUIRED`.
- **Replay.** The commit is applied at most once per operation: resume looks for a commit carrying
  the operation trailer on top of the recorded parent HEAD before committing.
- **Git disabled.** No commit, no branch check, no Git process, the former stage graph
  (`manifest-written` to `registry-writing`) and no `committing-specification` step. A journal
  reserved before commits existed also keeps that graph.
- Specifications created untracked earlier are not adopted automatically; Close archive and
  integration are unchanged by this behaviour. With Git disabled, Close archives without Git (below).

### Recovering a stuck Create (operator procedure and known gap)

A crash, `kill -9`, power loss or a late error after reservation leaves the Create journal non terminal
(`recovery-required` in the operation panel, or `OPERATION_INTERRUPTED` after 5 minutes without a live
writer). The journal keeps holding its slug, its branch/worktree path and (for a linked workspace) a
capacity slot until it is resolved; the 7 day retention only removes `completed` journals. **There is no HTTP
or UI action to resume or abandon a Create (known gap).** The Runtime never takes a journal over on its own:
elapsed time proves nothing about a possibly live writer. What the operator can do:

1. **Resume (preferred).** Stop whatever may still run the Create, then run
   `nevo-specflow specs recover <operation-id> --confirmed-stopped` (add `--confirmed-git-stopped` when the
   journal is at the Git stage, i.e. a new worktree was being provisioned). It calls the Engine's
   `resumeInterruptedCreateOperation` (the `resumeInterruptedOperation` / `confirmInterruptedGitSettled`
   assertions), replays the journal with the intent it recorded and drives it to `completed`. The Engine
   still verifies refs, paths, HEAD and committed bytes and fails closed on a mismatch.
2. **Abandon (manual).** Only when no branch, worktree, spec folder, commit or registry entry of that operation
   exists (check `git worktree list`, `git branch`, `specs/active/<slug>` and the registry): delete
   `<Project Home>/.nevo/local/state/engine/operations/create/<operation-id>.json` and the folder
   `<operation-id>.payload` next to it while no Create runs. A journal whose effects exist must be resumed, not
   deleted, or the slug/branch is orphaned.
3. A crash between creating and renaming a journal write can leave `.<id>.json.<uuid>.tmp` files in the same
   folder; they are ignored by every reader and swept after one hour by the next reservation.

A UI/HTTP resume or abandon action, and garbage collection of journals that never produced a Git effect, remain
follow-ups.

### A manifest in the old shape fails the whole listing

The manifest is strict and fail-closed ([documents layer](specification-documents.md), "Manifest schema"). A
`specification.yaml` that still has the old `type` field and lacks `archetype` or `documents` is invalid, and a
single invalid manifest makes the Specification listing of that checkout fail with `SPEC_SOURCE_INVALID`, so every
Specification surface of the checkout reports the source error until the manifest is repaired. The Engine message
names the offending slug and field (for example `Specification "my-spec" manifest: field "archetype" is required.`);
the HTTP response exposes only the error code and the Runtime log carries the message. A local, untracked
Specification created before the documents layer is repaired by hand:

1. Remove the `type:` line (it is no longer read; leaving it is harmless because unknown top-level keys are kept).
2. Add the archetype snapshot, for example
   `archetype: { id: minimal, version: 1, requirements: [{ documentType: overview, minCount: 1 }] }` written as
   block YAML.
3. Add the registry with the fixed overview entry:
   `documents: [{ id: overview, path: overview.md, type: overview }]`, plus one entry per other file you want
   registered (files without an entry stay readable as unclassified).
4. Commit the change yourself if Git is enabled. There is no automatic migration and no compatibility reader.

## Explicit Close intents

| Operation                                                | Effect                                                                                                                                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specification Close with `integrateToTargetBranch:false` | Archive only the selected Spec with one Engine-owned scoped commit; preserve shared siblings, bindings and workspace                                                                                                                        |
| Spec-scoped integrated Close / legacy Worktree Close     | Integrate and retire an **exclusive** managed source; reject shared sources with `CLOSE_SHARED_WORKTREE`                                                                                                                                    |
| Workspace Close                                          | Separate `workspace-close(workspaceId,operationId)`; preview every bound Spec, integrate the **entire source branch** and CAS-rebind all occupants in one registry revision                                                                 |
| Worktree Close with `finishAfterExternalMerge:true`      | Person-initiated, never inferred: proves by content (not ancestry) that the destination already has everything the source branch changed, then finishes through the already-integrated disposal path with no new merge commit (#157, below) |
| Specification Close with `finishAfterExternalMerge:true` | `CLOSE_EXTERNAL_MERGE_UNSUPPORTED` (owner decision 2026-11-20): refused unconditionally, before any Git inspection or mutation — only Worktree Close may finish this way (below)                                                            |

Workspace Close derives the full occupant set from verified registry and canonical manifests.
It records exact IDs, locations, statuses and binding generations in its durable journal.
Callers cannot name an arbitrary subset or disguise a whole-branch merge as one Spec operation.
Active Specs remain active after whole-workspace rebind; already archived Specs remain archived.

### Close with Git off (owner decision 2026-11-17)

In a project with Git off (`git.enabled: false`, or no `git:` block) a Specification Close is
**archive-only**: the Specification moves to `specs/archive/<slug>` in its own checkout with the
archived manifest, the same archive result as a normal Close, with no commit, no integration and no
repository precondition (no clean tree, no integration branch, no branch check). One pure decision,
`closeRepositoryMode` (lifecycle), derives the mode from the project Git policy, read once by the
preview; the plan carries it and the Close use case branches on the reserved plan, not per check.
Asking such a Close to integrate (`integrateToTargetBranch: true`) and any Worktree or Workspace
Close (an integration by definition) are `CLOSE_INVALID` before the workflow gate. A policy that
cannot be read decides no mode: the preview refuses with its error after the workflow gate and
before any repository inspection.

- **What still applies.** The Specification exit gate (D07, in the preview and again under the lock),
  the document commit queue (inert with Git off), resource claims against Create and other Closes,
  and the Runtime's Session Turn checks on a linked checkout.
- **Plan and journal.** The plan is marked `gitOff` and pins the registered checkout identity
  (no branch, no HEAD), the configuration revision that decided the mode, and claims only the
  Specification and its checkout. Under the lock the reservation re-evaluates the mode for every
  Close plan and refuses with `CLOSE_CONFLICT`, before publishing anything, when it or the pinned
  revision changed. The journal goes `reserved` -> `archive-initiated` (the pinned file inventory of the move)
  -> `completed` with outcome `archived-without-git`; the binding and the workspace stay as they
  are. An operation keeps the mode it was reserved with.
- **No Git process.** Like a Create into an existing workspace with Git off, the operation runs with
  the Git-free verification of Project Home and checkouts (`runGitFreeMutation`). Linked worktrees
  cannot be created with Git off; one created while Git was on archives in place too (owner decision
  2026-11-17), and the archive stays uncommitted in that worktree: a later Worktree Close with Git on
  meets `uncommitted-changes` until it is committed.
- **Interruption and operator recovery.** A move that did not finish leaves the journal at
  `archive-initiated` (`recovery-required`), holding its Specification and checkout claims (so
  Creates in that checkout are refused); a retry of the Close never re-runs it. The operator:
  1. runs `nevo-specflow specs close-recover <operation-id> --preview` (read-only): it proves the
     state against the pinned inventory: `source-unmoved`, `moved-original-manifest` (renamed, the
     manifest not yet rewritten) or `moved-archived-manifest`; anything else (both or neither
     directory, other files) is `CLOSE_RECOVERY_REQUIRED` and must be repaired by hand to one of
     those states;
  2. makes sure the original Close stopped and nothing else writes the checkout, then runs
     `specs close-recover <operation-id> --confirmed-stopped`: the proven move is finished
     deterministically (the source is planned again and must equal the pin before it moves; the
     archived manifest must hash to the pinned value), the Close completes as
     `archived-without-git` and its claims are released.

### Specification exit gate and Abandon (D07)

A Specification Close is refused with `CLOSE_BLOCKED` while its workflow is unfinished. The gate is a port
(`SpecFlowEngine.specificationExit`, composed in `engine.ts`) so the lifecycle does not import the workflow; the
workflow's pure `closeBlockers` decides it. Close calls it in its preview, before any Git check, and again inside
its reservation under the project control lock. The refusal carries grouped blockers (`kind`, `subjectIds`,
`message`): the Specification run has not ended (`specification-run`); Tasks that are neither cancelled nor
ended (`draft-tasks`, `on-hold-tasks`, `unfinished-tasks`, never-started ones included); `broken-tasks`; an
execution-store change that did not finish publishing (`pending-execution-change`); a pending Task document
change (`pending-task-documents`); execution records that cannot be read (`execution-state-unreadable`). A
Specification that never started and has no Tasks closes as before, bound to a workflow or not. Worktree and
workspace Close do not archive and do not consult the gate.

The owner's **Abandon** (`abandonSpecification`, a required reason) is the way to close without realization. In
one execution-store change it ends the Specification run (pinned first when it never started) and every Task run
that has not ended as `abandoned` (the core's `abandonment` record holds the actor, time, reason and the
position it ended from), and cancels every Task that is not cancelled or ended with the status change source
`abandon`. It is final: the same reason again returns the same result, another reason is
`WORKFLOW_SPECIFICATION_ENDED`. It is not a bypass: pending writes, broken Tasks and other operations on the
Specification refuse it with `WORKFLOW_EXIT_BLOCKED` and the same blockers (plus `operation-in-progress`). After
it the gate reports nothing. Abandon is a workflow change committed like the others (queued with auto-commit
on, in the ledger with it off), and Close's Git and workspace rules apply unchanged except for the execution
state, below. Once a Close of the Specification is reserved, every workflow write of it is refused
until the Close settles (`WORKFLOW_SPECIFICATION_BUSY`, cause `close`; `workflow/state/close-guard.ts`),
and every workflow write is admitted against the agent execution claims
([workspace execution claims](workspace-execution-claims.md#the-project-wide-resource)).

Every Close and integration first flushes the document commit queue of the checkouts it touches and is refused
with `DOCUMENT_COMMITS_PENDING` while document commits are pending, failed or uncommitted; the rule, its precedence and
the recovery of document operations are owned by the [documents layer](specification-documents.md) and
[ADR 0016](../decisions/0016-engine-owned-document-commits.md).

**Uncommitted execution state (owner decision 2026-11-12).** A Specification Close takes the Specification's
uncommitted execution state (`.execution/**` and `tasks/**` below `specs/active/<slug>`) into its archive
commit: its clean-tree check and the ledger hold accept exactly those paths of that Specification (modified,
untracked or removed), the archive inventory admits them as untracked or removed files, and the archive commit
and its proof expect the paths of the source directory at the pinned commit plus every archived file. Any other
staged, modified or untracked path still refuses with `CLOSE_PREFLIGHT`, and the refusal names the paths
(`CloseOperationError.paths`, at most ten in the message). Worktree and Workspace Close archive nothing and keep
the strict check. So an Abandon followed by Close needs no manual commit. The `uncommitted-changes` blocker
names each path with its `scope`: `specification` below `specs/active/<slug>/` (listed first, counted in
`specificationCount`) or `other` (another Specification, project files), so a refusal never calls a file in the
repository root a Specification file. The ledger hold (`DOCUMENT_COMMITS_PENDING`, `commit-uncommitted`) carries
whose paths it holds and why (`details.uncommitted`): with automatic commits off (the default) another
Specification's Task and step changes stay in the ledger until its next step finish.

**Uncommitted agent work (D16, [ADR 0026](../decisions/0026-agent-step-execution.md)).** A finished
agent attempt commits its own work at finish; what stays uncommitted is listed, never discarded:

- an agent attempt whose commit failed is listed apart, in `attempts` of the `uncommitted-changes`
  blocker and of the `DOCUMENT_COMMITS_PENDING` hold (its step, Task, failure code and its paths:
  the documents, Tasks and execution state its Turns wrote and its declared files), with the remedy
  "retry the attempt commit" (`POST .../workflow/attempt-commit/retry`, `nevo-specflow workflow
retry-commit`); those paths are not counted again under the other kinds;
- the code changes of an attempt the owner took over, or of a Turn that ended without a finish,
  are ordinary dirty paths: listed under `other` with the remedy to commit them in Git;
- the CLI `specs close --preview` and a Close refusal print the same groups as the UI
  ("Uncommitted changes", one sub-group per kind with its remedy; `uncommitted` in `--json`;
  `packages/specflow/src/documents/uncommitted-groups.ts`). There is no discard remedy.

**Shared-checkout state isolation (#181, owner decision 2026-11-19).** Two active Specifications
sharing one checkout — the ordinary primary/current-folder case, or a shared linked worktree closed
archive-only — are isolated from each other's pending state: an archive-only or exclusive Close of
Specification B is **not** refused by Specification A's own uncommitted execution state or
pre-existing staged files, because the ledger already attributes every entry to one Specification
unambiguously and B's archive commit stays path-limited to its own directory regardless. The clean-tree
check and the ledger hold widen their exemption to accept **either** B's own execution state (as
above) **or** another active Specification's own execution state of **its own** directory, derived
from the checkout's physically-discovered Specification directories cross-checked against the
registry's `specBindings` for that checkout — a physically-discovered but unregistered/orphan
directory is never exempted, and a sibling's exempted path never reaches Close B's
`uncommitted-changes` blocker (its dialog never learns A exists). Any other path — an unregistered
owner, a path that is not execution-state-shaped, or a genuinely foreign edit — still refuses with
`CLOSE_PREFLIGHT` exactly as before. Workspace Close is untouched (it already derives the complete
occupant set itself and is refused up front by `CLOSE_SHARED_WORKTREE` when shared with integration).

## Safe integration, rebind and disposal

Git integration requires verified source and destination checkout identity, committed branch,
pinned HEAD/index/tree and physical publication proof. An already-integrated branch, fast-forward
or controlled divergent candidate may be supported; merge conflicts are reported and fenced.
No silent checkout, forced merge, rebasing, deletion of refs or synthetic confirmation of
external agent quiescence is allowed.

**Finish after an external (PR) merge (#157).** A project that merges through pull requests (a
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

**Restricted to Worktree Close (owner decision 2026-11-20).** `finishAfterExternalMerge` is not
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
MUST NOT claim it is quiescent.
See [durable recovery](../../engineering/shared/specflow-git-recovery.md).
