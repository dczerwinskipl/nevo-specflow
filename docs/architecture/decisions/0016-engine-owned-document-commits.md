---
id: adr.0016-engine-owned-document-commits
type: adr
title: Document operations are file change plus one Engine-owned path-limited commit
status: draft
date: 2026-10-23
summary: >
  Every state-changing Specification document operation (save, create, rename, move, delete, classify and
  later folder/import) changes files and the registry and lands as one Engine-owned path-limited commit under
  the ADR 0013 mechanism, through a journalled, idempotent operation. Protected branches block document edits
  too. Extends ADR 0013 instead of amending it. Outlines the later commit queue with coalescing.
related:
  - adr.0013-engine-owned-commits-and-protected-branches
  - adr.0015-specification-manifest-as-document-registry
  - architecture.runtime.specification-documents
  - engineering.shared.specflow-git-recovery
  - reference.api.specification-documents
---

# 0016 — Document operations are file change plus one Engine-owned commit

## Status

Draft (proposed with `product.specflow.specification-documents`). This ADR **extends**
[ADR 0013](0013-engine-owned-commits-and-protected-branches.md); it does not supersede it.

## Why a new ADR and not an amendment of 0013

ADR 0013 is a closed decision about one operation (Create scaffold) and records Create-specific failure
semantics (journal stays at `commit-writing`, `COMMIT_FAILED` recovery). Document operations reuse its
_mechanism_ (one commit capability, `commit --only` over literal paths, identity, hooks off, operation trailer,
protected-branch configuration) but add new questions: high-frequency writes, deletions and renames inside a
commit, preconditions against foreign uncommitted edits, serialisation between concurrent operations and an
optional queue. Folding that into 0013 would turn a precise record into a mixed one. 0013 gets a one-line
pointer under its Scope item (see below); its decisions are unchanged.

## Context

- `VersionControl.commits` (`version-control/commits/port.ts`) accepts only `kind: 'specification-create'` and
  `paths` that exist; `inspectPaths`, `findByOperation`, `preflight` and `currentBranch` are already available.
- The Create journal (`specs/create/journal`) is the established pattern: reserve intent under the control lock,
  checkpoint before each effect, replay by operation id, recover from physical evidence.
- Close requires a clean checkout; an Engine write that leaves a dirty worktree would block Close again.
- The demo shapes document operations with `requestId` and `expectedRevision`; the real contract keeps the
  operation shape of Create (`operationId`, idempotent replay) so UI integration is a swap, not a redesign.

## Decision

1. **One mutation = files + one commit.** Save, create, rename, move, delete and classify (and later folder
   changes and imports) write the files and, in the same atomic file set, the manifest registry change (when the
   operation changes it), then create **exactly one** commit containing exactly the touched paths
   (`git commit --only` over literal paths: old and new path for rename/move, the deleted path for delete,
   `specs/<location>/<slug>/specification.yaml` when the registry changed). The registry change and the file
   change are never in different commits. Nothing else is staged or committed.
2. **Commit capability.** `EngineCommitKind` gains `'document-change'`. The commit port MUST support new
   (untracked) paths and deleted paths in `paths` (D4 proves it on Linux with real Git; this is a verified gap,
   not an assumption). Trailers: `Nevo-Operation`, `Nevo-Kind: document-change`, `Nevo-Spec: <specId>`,
   `Nevo-Action: <save|create|rename|move|delete|classify>`, `Nevo-Documents: <id>[,<id>...]` (ids only, capped).
   Subject `spec(docs): <action> <slug>/<path>`; body empty. Identity, hooks and signing follow ADR 0013.
3. **Git disabled.** The same operation writes atomically (temp file + rename in the same directory, verified
   non-symlink path) and journals, but makes no commit, runs no Git process and performs no branch check.
4. **Protected branches apply.** `git.commits.protectedBranches` / `allowedBranches` guard document operations
   exactly as Create. The Engine evaluates the guard at admission (before any write) and again inside the
   commit capability. The refusal codes are `BRANCH_PROTECTED` (422) and `COMMIT_BLOCKED` (409) with a stable
   `reason` (`branch-protected`, `branch-not-allowed`, `detached`, `merge-in-progress`, ...). The tree
   projection additionally exposes the same decision as advisory action availability so the UI can disable
   editing with a clear reason before the user types.
5. **Preconditions protect foreign edits.** Every operation names the document it changes by `documentId` plus
   `expectedRevision` (sha256 of the current bytes). Under the write lock the Engine reads the file and refuses
   with `DOCUMENT_REVISION_CONFLICT` when the hash differs. Operations that rewrite the registry additionally
   require `specification.yaml` to have **no uncommitted change** (`SPEC_MANIFEST_DIRTY`, 409), because the
   commit would otherwise capture someone else's manifest edit. For a path that is tracked and has uncommitted
   edits the revision check is the proof that the user saw what is being committed. A new file at a path that
   already exists on disk is `DOCUMENT_PATH_CONFLICT`.
6. **Journalled, idempotent operation.** Document operations use the Create operation shape: client
   `operationId` (UUID) is the idempotency key; a durable journal of kind `document-change` under the Project Home
   engine operations directory records the intent fingerprint, the plan (per-file pre/post sha256, moves) and the
   stage: `reserved` -> `files-writing` -> `files-written` -> `commit-writing` -> `commit-written` ->
   `completed`, plus `recovery-required`. A replay with the same fingerprint returns the stored result; a
   different fingerprint under the same id is `DOCUMENT_OPERATION_CONFLICT` (409). The call is synchronous (200
   after the commit, or after the write when Git is disabled); there is no 202 for documents in the first
   release. Completed journals share the Create retention rules.
7. **Serialisation.** One Engine write lock per checkout serialises document operations with each other and with
   Create/Close admission for the same checkout. A Specification in `archive/` is read-only
   (`SPEC_ARCHIVED`, 409). A Specification whose Close or Create is in progress is `SPEC_BUSY` (409).
8. **Failure and recovery.** Before the commit, a failure rolls the operation back by physical evidence (each
   step is checkable: source/destination hash), leaving the checkout as it was; the journal ends `failed` with
   no effects (reported as the error code, not retained as success). After files exist, a commit that cannot be
   made leaves `commit-writing` and the operation `recovery-required` (`DOCUMENT_RECOVERY_REQUIRED`, 503, with
   the underlying `COMMIT_FAILED` reason), exactly like Create: resume replays by the operation trailer
   (`findByOperation` on top of the recorded parent HEAD) and accepts a byte-identical, clean human commit.
   Save is two-state (atomic rename): after a crash the disk equals the pre-image (abandon, no effect) or the
   post-image (continue to commit); anything else is `recovery-required`.
9. **Commit queue with coalescing (extension, designed here, built after D4).**
   - A per-checkout FIFO owns commit execution; journals are reserved in arrival order and `sequence` is
     recorded. Operations touching overlapping paths (or the manifest) execute strictly in sequence; the first
     release of the queue MAY simply run all operations of a checkout in sequence.
   - **Coalescing** merges consecutive queued `save` operations for the same document into one commit when:
     the later save's `expectedRevision` equals the earlier save's result revision, nothing queued between them
     touches the document or the manifest, and branch and parent HEAD are unchanged. The merged commit carries
     `Nevo-Operation: <last>` and `Nevo-Coalesced: <earlier ids>`; each journal records `coalescedInto`; replay
     finds the commit by any of those trailers; all merged operations complete with the same commit SHA.
   - Coalescing never delays a commit artificially (no debounce timer in the first version): it only merges
     operations that are already queued while a previous commit is running. A merged group fails and recovers
     as one unit.
   - Clients keep the synchronous contract: each request answers after the commit that includes its content.
10. **Scope of this decision.** Close archive/integration, Create and the existing branch-guard behaviour are
    unchanged. Reviews and Tasks are separate resources and do not use this mechanism.

## Consequences

- A checkout stays clean after every document operation; Close's clean-checkout admission remains satisfiable.
- On a protected branch the whole Documents surface becomes read-only with a reason; users move to a new
  workspace, as for Create.
- Hooks and signing do not apply to document commits (same trade-off as ADR 0013).
- History gains one commit per operation until the queue lands; this is accepted and the squash-merge model of
  the repository absorbs it.
- The commit port, the journal codec, the lock set and the error-status table all gain a new kind: a contained,
  mechanical extension of existing seams.

## Rejected

- **Leaving document edits uncommitted.** Makes the checkout dirty because of Nevo itself and breaks Close.
- **Committing the whole manifest directory or `git add -A`.** Sweeps in foreign edits.
- **Separate commits for registry and file.** Allows a history in which the registry points at nothing.
- **Debounced/background commits as the base behaviour.** Hides failure from the request that caused it and
  reintroduces a dirty window; coalescing of already queued saves gives most of the benefit without it.
- **Amending ADR 0013.** See "Why a new ADR".
