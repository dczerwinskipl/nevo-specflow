---
id: architecture.runtime.specification-close-lifecycle
type: architecture
title: Specification Close archive and refusal rules
status: current
scope: specflow
areas: [runtime, cli, security]
read_when:
  - implementing or reviewing Specification Close and Abandon
  - distinguishing Specification Close from Workspace or Worktree Close
summary: >-
  Specification Close intents, exit gates, Abandon and archive-only operation when Git is disabled.
related:
  - architecture.runtime.specflow-lifecycle
  - architecture.runtime.specification-close-admission
  - architecture.workflow.workflow-kernel
---

# Specification Close archive and refusal rules

## Explicit Close intents

| Operation                                                | Effect                                                                                                                                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specification Close with `integrateToTargetBranch:false` | Archive only the selected Spec with one Engine-owned scoped commit; preserve shared siblings, bindings and workspace                                                                                                                        |
| Spec-scoped integrated Close / legacy Worktree Close     | Integrate and retire an **exclusive** managed source; reject shared sources with `CLOSE_SHARED_WORKTREE`                                                                                                                                    |
| Workspace Close                                          | Separate `workspace-close(workspaceId,operationId)`; preview every bound Spec, integrate the **entire source branch** and CAS-rebind all occupants in one registry revision                                                                 |
| Worktree Close with `finishAfterExternalMerge:true`      | Person-initiated, never inferred: proves by content (not ancestry) that the destination already has everything the source branch changed, then finishes through the already-integrated disposal path with no new merge commit (#157, below) |
| Specification Close with `finishAfterExternalMerge:true` | `CLOSE_EXTERNAL_MERGE_UNSUPPORTED`: refused unconditionally, before any Git inspection or mutation — only Worktree Close may finish this way (below)                                                                                        |

Workspace Close derives the full occupant set from verified registry and canonical manifests.
It records exact IDs, locations, statuses and binding generations in its durable journal.
Callers cannot name an arbitrary subset or disguise a whole-branch merge as one Spec operation.
Active Specs remain active after whole-workspace rebind; already archived Specs remain archived.

### Close with Git off

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
  cannot be created with Git off; one created while Git was on archives in place too,
  and the archive stays uncommitted in that worktree: a later Worktree Close with Git on
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
state, below. Workflow mutations after the Close reservation are not yet
refused (writer admission for workflow steps is not implemented).

Every Close and integration first flushes the document commit queue of the checkouts it touches and is refused
with `DOCUMENT_COMMITS_PENDING` while document commits are pending, failed or uncommitted; the rule, its precedence and
the recovery of document operations are owned by the [documents layer](specification-documents.md) and
[ADR 0016](../decisions/0016-engine-owned-document-commits.md).

**Uncommitted execution state.** A Specification Close takes the Specification's
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

**Shared-checkout state isolation.** Two active Specifications
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
