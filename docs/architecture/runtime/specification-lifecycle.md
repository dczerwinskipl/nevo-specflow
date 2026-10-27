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

An _unsupported_ journal (older version, not JSON, or no numeric `version`) is never interpreted. It is returned
separately by the listing and is not a resource claim, so it can block neither Create nor Close; read by operation
id it answers `CREATE_JOURNAL_UNSUPPORTED` (503); the tolerant list shows it as `recovery-required` with that code.
**Resume interrupted Creates before upgrading** (and before downgrading, which would classify version 2 journals as
unsupported): the evidence of an older journal that still had effects is lost after 7 days.

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
  `git -c core.autocrlf=false add` (as a follow-up commit if a resume was already attempted), see ADR 0013). Re-submitting the same
  `operationId` meanwhile answers `CREATE_RECOVERY_REQUIRED`.
- **Replay.** The commit is applied at most once per operation: resume looks for a commit carrying
  the operation trailer on top of the recorded parent HEAD before committing.
- **Git disabled.** No commit, no branch check, no Git process, the former stage graph
  (`manifest-written` to `registry-writing`) and no `committing-specification` step. A journal
  reserved before commits existed also keeps that graph.
- Specifications created untracked earlier are not adopted automatically; Close archive and
  integration are unchanged by this behaviour.

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

| Operation                                                | Effect                                                                                                                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specification Close with `integrateToTargetBranch:false` | Archive only the selected Spec with one Engine-owned scoped commit; preserve shared siblings, bindings and workspace                                                        |
| Spec-scoped integrated Close / legacy Worktree Close     | Integrate and retire an **exclusive** managed source; reject shared sources with `CLOSE_SHARED_WORKTREE`                                                                    |
| Workspace Close                                          | Separate `workspace-close(workspaceId,operationId)`; preview every bound Spec, integrate the **entire source branch** and CAS-rebind all occupants in one registry revision |

Workspace Close derives the full occupant set from verified registry and canonical manifests.
It records exact IDs, locations, statuses and binding generations in its durable journal.
Callers cannot name an arbitrary subset or disguise a whole-branch merge as one Spec operation.
Active Specs remain active after whole-workspace rebind; already archived Specs remain archived.

Every Close and integration first flushes the document commit queue of the checkouts it touches and is refused
with `DOCUMENT_COMMITS_PENDING` while document commits are pending, failed or uncommitted; the rule, its precedence and
the recovery of document operations are owned by the [documents layer](specification-documents.md) and
[ADR 0016](../decisions/0016-engine-owned-document-commits.md).

## Safe integration, rebind and disposal

Git integration requires verified source and destination checkout identity, committed branch,
pinned HEAD/index/tree and physical publication proof. An already-integrated branch, fast-forward
or controlled divergent candidate may be supported; merge conflicts are reported and fenced.
No silent checkout, forced merge, rebasing, deletion of refs or synthetic confirmation of
external agent quiescence is allowed.

Only after publication proof does one CAS transfer every pinned binding. A second registry
revision retires the workspace registration only after a separate non-force physical removal.
The Engine checks source incarnation and inventories ignored/untracked user data before removing
any managed checkout. Failed or unknown effects preserve the journal, claims and recovery
evidence. Changed incarnation returns recovery-required instead of deleting the new occupant.

Writer/Session/Task admission belongs to later E3–E5 work and must not be faked by E2.
See [durable recovery](../../engineering/shared/specflow-git-recovery.md).
