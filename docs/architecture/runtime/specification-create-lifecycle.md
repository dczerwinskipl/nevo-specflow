---
id: architecture.runtime.specification-create-lifecycle
type: architecture
title: Specification Create admission and Git selection
status: current
scope: specflow
areas: [runtime, cli, security]
read_when:
  - implementing Specification Create with a new or existing workspace
  - reviewing Create journal, Git selection and admission invariants
summary: >-
  Create intent, baseRef, workspace selection, journal retention, scaffold commit, Git-off behaviour and refusal boundaries.
related:
  - architecture.runtime.specflow-lifecycle
  - architecture.runtime.specification-create-options
  - engineering.shared.specflow-git-recovery
---

# Specification Create admission and Git selection

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
