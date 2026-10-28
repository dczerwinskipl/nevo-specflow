---
id: adr.0016-engine-owned-document-commits
type: adr
title: Document operations write files at once and land as Engine-owned path-limited commits through a durable queue
status: draft
date: 2026-10-24
summary: >
  Every state-changing Specification document operation writes its files and registry change to disk
  immediately, answers once the content is durable and its commit request is durably queued, and lands in
  Git later as an Engine-owned path-limited commit executed by a per-checkout queue (one active batch per
  checkout, batches per Specification). Queued operations of one Specification consolidate into one commit; a
  batch save is one commit. The dirty window between write and commit is bounded and journaled; it relaxes the
  clean-checkout consequence of ADR 0013 for document operations only. Protected branches and commit blockers
  are checked before any file is written. Extends ADR 0013.
related:
  - adr.0013-engine-owned-commits-and-protected-branches
  - adr.0014-feature-owned-operation-lists
  - adr.0015-specification-manifest-as-document-registry
  - adr.0017-definitions-as-project-data
  - adr.0018-engine-commit-policy-and-manual-commit
  - architecture.runtime.specification-documents
  - engineering.shared.specflow-git-recovery
  - reference.api.specification-documents
---

# 0016 — Document operations: immediate write, queued Engine-owned commit

## Status

Draft (proposed with `product.specflow.specification-documents`). This ADR **extends**
[ADR 0013](0013-engine-owned-commits-and-protected-branches.md) and **relaxes one of its consequences**: ADR 0013
states that "a checkout is clean after Create". For document operations a checkout MAY be dirty because of Nevo for
a bounded, journaled window (decision 9). Create keeps its synchronous commit stage and its clean-checkout
guarantee. Language follows [normative language](../principles/normative-language.md).

## Why a new ADR and not an amendment of 0013

ADR 0013 is a closed decision about one operation (Create scaffold). Document operations reuse its mechanism (one
commit capability, `commit --only` over literal paths, identity, hooks off, operation trailer, protected-branch
configuration) but add: high-frequency writes, deletions and renames, foreign-edit preconditions, a durable queue
and consolidation. 0013 receives a pointer to this relaxation.

## Context (observed in the repository)

- `VersionControl.commits` accepts only `kind: 'specification-create'`. `commit` runs
  `git add --intent-to-add` over **every** path, then `git commit --only`; failure to add is `COMMIT_FAILED`
  (`intent-to-add`). Verified with real Git (2.44 on Windows here; the reviewer ran 2.44 and 2.39): `git add -N` of a
  deleted **tracked** path succeeds (it stages the deletion), `git add -N` of an absent **never-tracked** path fails
  with a pathspec error, and an intent-to-add entry whose file was later removed stays in the index as a stale `" D"`
  entry. So the real gaps are: a path with no net change, and stale intent-to-add entries (decision 3).
- Commits in one checkout run one at a time inside a process (`serializePerCheckout`); other processes are covered
  by lost-race retries. `findByOperation` reads the `Nevo-Operation` trailer on Engine-committed commits only.
  `inspectPaths` and `ensureScaffoldCommitted` answer Create's all-or-nothing question and are **not** reusable for
  per-path batch verification (decision 7).
- Git deadlines: `executeGit` 10 s (kills git, `GIT_UNAVAILABLE`); `executeGitMutation` 30 s plus 3 s grace, and
  **any** timeout ends as `GIT_OPERATION_UNCERTAIN` (it also settles as uncertain on `close`). `child.kill()` ends
  git only; a clean-filter grandchild keeps the pipes open, so `close` may never fire.
- Journals are the claim records (`assertSharedResourcesAvailable`); transitions are read, deep-compare, write under the
  short Project Home control lock (`durable.ts` `transition`), not a hardware compare-and-swap. The control lock is
  **never stolen**: a SIGKILLed holder stalls every Project Home mutation (Create included) until an operator
  intervenes. Close claims `checkout:<workspaceId>`, which excludes `checkout-scoped:` claims.
- `reserveCloseOperation` previews outside the lock, then reserves under `withProjectControlLock`; the preview is pure.

## Decision

1. **Write now, commit later.** Save, batch save, create (template or content, text import), folder, rename, move,
   delete and classify MUST write their files and, when they change it, the manifest registry **immediately and
   durably**, then queue the commit. The request MUST answer when the content is durable on disk and the commit request
   is durably queued (`200`); it MUST NOT wait for Git. Push and publishing are **out of scope**; the Engine has no
   push capability and this ADR adds none.
2. **Commit batches: per Specification, one active batch per checkout.** The queue's unit is a _commit batch_: all
   non-terminal operations of **one Specification** in one checkout that are `queued`, up to the caps of the
   architecture document (Limits). Operations of different Specifications are different batches and different
   commits. An operation that overlaps (any shared path, or the manifest path of the same Specification) a batch that
   is full or already claimed waits (decision 6). One batch is **active** per checkout across all processes (the lease,
   decision 5). A batch commits the **effective path set** (decision 3) as it is on disk at execution time.
3. **Effective path set and the commit port.** At execution the Engine MUST compute, per batch path, whether the
   working state differs from `HEAD` (attribute-aware `git hash-object -- <path>` against the blob `git ls-tree HEAD` lists for the path;
   a deleted file equals an absent blob). Paths equal to `HEAD` are dropped. The commit request, the port's exact-set
   check and the `Nevo-Documents` trailer use the effective set. If it is empty, the members complete as
   `not-applicable` (`nothing-to-commit`) and **no Git mutation runs**. Before a commit the port MUST remove stale
   intent-to-add entries for paths that are absent on disk and untracked in `HEAD` (and MUST restore the index entries
   it created if the commit provably did not happen). `EngineCommitKind` gains `'document-change'`. Trailers:
   `Nevo-Operation: <batchId>` (the id of the first operation by sequence), `Nevo-Kind`, `Nevo-Spec`, `Nevo-Action`
   (an action or `mixed`), `Nevo-Documents` and `Nevo-Coalesced`; values are cut at **id boundaries** with a `+N`
   count, never mid-id (the port truncates a value at 200 characters).
4. **Git disabled.** Same write path (journal, atomic replacement) with no commit, no Git process and no branch
   check; commit state `not-applicable`. If Git is disabled while operations are pending, their members complete
   as `not-applicable` with `reason: 'git-disabled'`; the files remain as they are.
5. **Claims, locks and the lease.** There is no hardware compare-and-swap. Every journal transition and every claim
   MUST be a read, compare and write under the Project Home control lock (as `durable.ts`). A per-checkout **queue
   lease** record (`engine/operations/documents/leases/<workspaceId>.json`: executor identity, `batchId`, acquisition
   time) MUST be held by the process that executes a batch; it is acquired and released under the control lock, so two
   processes never run batches of one checkout at once. A document operation's own claim is
   `checkout-scoped:<workspaceId>` (coexists with Create and with other document operations; excluded by Close).
   **Stalls:** because the control lock is never stolen, a holder killed with SIGKILL stalls document operations
   (and Create) until an operator clears the lock; this is an existing limitation, documented and tested as a crash
   cut point. A lease whose holder is provably dead (decision 12) is taken over under the control lock.
6. **Barriers and the claim/write race.** An operation in `reserved` or `files-writing` is a **barrier** for the
   paths it plans: a batch containing an overlapping path MUST NOT be claimed until that operation is `queued`, and
   then includes it. A reservation whose paths overlap a **claimed** batch MUST be refused with `SPEC_BUSY`
   (`details.cause: 'commit-in-progress'`) after a bounded wait (5 s). Batch claim and operation reservation both
   happen under the control lock, so the check is atomic; the file write itself happens outside it.
7. **Per-path verification.** Before and after a commit the Engine MUST classify each batch path with a new inspection
   against the batch's recorded expectations `{pre, post}`: working-tree hash, `HEAD` blob (or absent), and whether the
   path equals `pre` (`at-pre`), `post` (`at-post`), is already in `HEAD` with the post content (`committed`), or is
   anything else (`foreign`). Deletions are verified by `HEAD` not listing the path, never by `hash-object`.
   `inspectPaths` and the Create resume logic MUST NOT be reused as they are. A `foreign` path is never committed
   silently (`content-changed`). A commit found by trailer, or an identical hand commit of exactly the effective set and
   bytes, is accepted.
8. **Preconditions protect foreign edits.** `expectedRevision` is the sha256 of the bytes **on disk** (unchanged
   definition; the disk may be ahead of `HEAD`). A batch save carries one `expectedRevision` per document and checks
   all before writing anything. `SPEC_MANIFEST_DIRTY` for registry-changing operations: the manifest on disk MUST equal
   the post-image of the latest **non-terminal** operation that changed it (queued, committing, `commit-failed`,
   and `recovery-required` operations and the ledger entry of ADR 0018 (the baseline when none is in flight) all count), or, when there is none, equal `HEAD` (hash compare, so Git runs at
   admission when Git is enabled). The plan is made at admission and **re-checked under the control lock**: if the
   manifest changed in between, the Engine re-plans once and then answers `SPEC_BUSY` (`cause: 'manifest-changed'`); an
   operation that is still writing its files (`reserved`, `files-writing`) and changes the manifest makes admission
   answer `SPEC_BUSY` (`manifest-changed`) at once, because the manifest on disk is moving rather than dirty.
   The file replacement re-hashes the target immediately before the rename; an external editor between that check and
   the rename is the stated limit of cooperative locking.
9. **Bounded, journaled dirty window.** The healthy bound is the settle period plus the commit time: **settle 300 ms**
   after the last member (configurable only within **250–500 ms**), **maximum hold 5 s** from the first member, measured
   on a monotonic clock; structural operations are eligible at once; after a restart the settle restarts (batches are
   eligible immediately). A batch that cannot be committed becomes `failed` or `recovery-required` with evidence and
   stays until a human acts. Nothing is dropped, hidden or committed with content nobody saw.
10. **Admission before write.** The commit port's read-only `preflight` for the operation's paths MUST pass before any
    file is written (protected branch, `allowedBranches`, detached HEAD, merge or rebase, unmerged paths, ignored
    path, no commits, held index lock); otherwise the request is refused with nothing written and no journal. The
    result MAY be cached per `(root, branch ref, path-set hash)` for at most 2 s and only while stat signatures of
    the resolved `HEAD` file, the index lock's existence and the project and local configuration files are unchanged; the execution-time guard is
    never cached. Git-process budget per save: 0 on a hit, at most 6 read processes on a miss. The latency budget of a
    save (p95, Linux, hit) is 150 ms, asserted by a benchmark test. On Windows the admission also applies the
    path-length rule of the architecture document ("Windows-hosted paths").
11. **Journal and write-phase failure.** A `document-change` journal (`engine/operations/documents/<operationId>.json`,
    version 1, at most 32 KiB) has the stages `reserved` -> `files-writing` -> `queued` (**the acknowledgement point**)
    -> `committing` -> `completed`, plus `commit-failed`, `failed` (a refusal after reservation; holds no
    claim) and `recovery-required`. The plan (per path `{path, pre, post}`, manifest pre-image, ids) is stored in a
    **hash-addressed plan file** in the payload store; the journal holds counts, hashes and the plan hash. Content payload
    files are deleted at the `queued` transition (only hashes are needed afterwards); the plan file lives until the
    journal settles. **A failure in the write phase after the first rename MUST roll FORWARD** from the payload with
    bounded retries (3, 100 ms apart) **while holding the claim and barrier**; if it still fails, the operation becomes
    `recovery-required` (claim and barrier stay) and the request answers `DOCUMENT_WRITE_FAILED` (503; disk full,
    I/O error) or `DOCUMENT_RECOVERY_REQUIRED`. It MUST NOT become a plain `failed` with changed files and no claim. The
    client retries the same `operationId`, which continues the roll-forward. A foreign edit found while nothing of the
    write is on disk is a refusal (`files-writing -> failed`, `DOCUMENT_REVISION_CONFLICT`, no claim); found with a path
    already in place it is `recovery-required` (write phase) and `DOCUMENT_RECOVERY_REQUIRED` (cause `write-conflict`,
    the conflicting documents in `details.conflicts`). A replayer takes the write over with a compare-and-replace of
    the `executor` of the journal (`files-writing -> files-writing`, or `recovery-required -> files-writing`) under the
    control lock, so two replayers that proved the same executor dead cannot both write. A refusal at admission creates no journal.
12. **Executor identity and takeover.** An executor is `{pid, hostId, pidNamespaceId, processStartTime, bootId}`
    (`/proc/self/ns/pid` inode, `/proc/<pid>/stat` start time, `/proc/sys/kernel/random/boot_id`). A lease, claim or
    in-flight step MAY be taken over automatically only with a **dead proof**: same host and PID namespace and the PID
    is absent or its start time differs, or the boot id differs. Where `/proc` is unavailable (Windows, macOS,
    containers without it) takeover needs an operator assertion. A live or unknown PID is never taken over. The identity also
    records the `worker_threads` thread id (absent counts as the main thread): another thread of the same process shares
    PID, start time and boot id but not module state, so it is never provably gone and its lease, claim or write is
    taken over only by an operator assertion. Create keeps its operator-assertion rule.
13. **Failure classification and the state machine.** (See the diagram.) Outcomes of a batch attempt:
    - committed -> members `completed`.
    - transient (`index-locked`, `git-busy`, `unmerged-paths`, `GIT_UNAVAILABLE` including a Git program that is
      missing or cannot be started): back to `queued` with backoff (1 s doubling to 60 s, then every 60 s for as long as
      the blocker lasts; the stored attempt counter saturates at 10). A Git outage never ends the retries: the files
      stay, the operation stays `pending` with `reason`, `blockedBy`, `attempts` and `nextAttemptAt`, and the batch is
      committed once Git works again, also after a Runtime or CLI restart (the startup pass and the sweep arm every
      checkout with queued work). A person may `abandon` a waiting operation. Git turned off by policy is different:
      the operation completes `not-applicable` and nothing is retained.
    - permanent (`BRANCH_PROTECTED`, `detached`, `branch-changed`, `no-commits`, `path-ignored`, `index-unreadable`,
      `COMMIT_FAILED`, `content-changed`, `workspace-missing`): batch `failed`, members
      `commit-failed`, files stay. A failed batch MUST NOT block other batches or paths (it holds only its own paths).
      **Split and retry:** when only some paths fail (ignored, foreign), the unaffected paths are committed and the
      failed paths become a new `failed` batch.
    - uncertain (`GIT_OPERATION_UNCERTAIN`, deadline): **decisive evidence resolves it automatically**: no commit with the
      batch trailer, `HEAD` equals the batch's recorded parent, and no `index.lock` -> a retryable failure (counter
      continues); a commit with the trailer -> `completed`; otherwise `recovery-required`.
    - `history-changed` only when a claimed batch **already attempted a commit** and its recorded parent is no longer an
      ancestor of `HEAD` (decision 14); resolved by the operator.
    - `workspace-missing` (checkout removed): `failed`; `abandon` allowed.
      Transitions: a new overlapping operation, `retry` or `flush` **dissolves** a `commit-failed` batch (members back to
      `queued`, attempt counter reset) and re-forms it. `abandon` -> `completed(uncommitted)` (decision 15).
      `recover <operation> --confirmed-stopped` offers `--resume` (look up by trailer, else re-queue when `HEAD` equals the
      parent), `--adopt` (accept a matching hand commit; `history-changed`) and `--abandon`.
14. **Parent HEAD.** The batch records `parentHead` **at claim time**, before any Git effect. A normal `rebase`, `amend` or
    `reset` before the first attempt is harmless (`parentHead` is read again at claim).
15. **Abandon is the uncommitted state (amended by [ADR 0018](0018-engine-commit-policy-and-manual-commit.md)).**
    `abandon` of a failed batch leaves the files on disk, records its paths in the **uncommitted-changes ledger** (the
    generic, owner-keyed record of ADR 0018), completes its members with `outcome: 'uncommitted'` (reason `abandoned`)
    and releases the claim; there is no `abandoned` stage or state. The tree reports the
    paths `uncommitted` until a later operation on them commits, a manual commit includes them, or a hand commit makes
    them equal to `HEAD` (pruned). Close is refused (`DOCUMENT_COMMITS_PENDING`, cause `commit-uncommitted`).
16. **Close.** The flush hook belongs in `reserveCloseOperation` (`lifecycle/reservation.ts`), after the pure
    `previewCloseOperation` returns the plan and **before** `withProjectControlLock`; it flushes every checkout in
    `plan.resources` (source, target and integration destination). The pure preview and preflight MUST NOT gain Git
    or flush effects. Precedence: remaining `pending`, `commit-failed` or `recovery-required` operations, or ledger entries (`uncommitted`) ->
    `DOCUMENT_COMMITS_PENDING`; a save that slips in after the flush -> the existing claim conflict (`CLOSE_CONFLICT`);
    a dirty tree from other causes -> `CLOSE_PREFLIGHT`. A Create with an integration destination claims `checkout:` and
    therefore conflicts with document claims on that checkout.
17. **Consolidation scope and ordering.** `sequence` is allocated under the control lock, monotonic per checkout.
    Within a batch operations keep sequence order; the commit is the final disk state of the effective set. Operations of
    different Specifications never share a commit.
18. **Shutdown.** Runtime and CLI MUST flush pending batches on SIGTERM/SIGINT with a deadline (10 s) before exit; what
    does not finish stays journaled and is picked up later. Recovery scans at first document access, Runtime start,
    every 30 s while work exists, on `flush` and on Close.
19. **Journal growth and throughput.** Settled operations (`completed`) MUST be moved to `settled/` (minimal record:
    id, fingerprint, result, sha; kept 24 h for replay) or deleted at once; claim checks list only non-terminal
    journals; the retention sweep is time-capped (50 ms), not count-capped; the batch record is capped (64 KiB,
    path list in a hash-addressed plan file). A folder operation that expands beyond 200 paths is
    `DOCUMENT_OPERATION_INVALID`.
20. **Reuse.** The generic durable-operation core moves to `specs/durable/` (journal store, payload store, claims,
    retention, committed-evidence primitives) and Create is refactored onto it with no behaviour change.
21. **Hung Git processes.** Git children MUST run in their own process group on POSIX (`detached`, kill the group) and be
    tree-killed on Windows; a mutation's outcome is resolved on `exit`, not `close`. A batch attempt has a request-level
    deadline (150 s) covering about six preflight reads, the intent-to-add step, the commit and the verification.
22. **Scope.** Close internals, Create and the branch guard are unchanged apart from decision 16. Reviews and Tasks do
    not use this mechanism.

23. **Git process bounds and the attempt budget.** A batch holds up to 200 paths and a Windows command line is capped at
    about 32K characters, so no Git process line grows with the batch. Reads (`hash-object`, `check-ignore`,
    `ls-files --stage`) name at most 100 paths and 12,000 characters of paths per process; the mutations
    (`add --intent-to-add`, `reset`, `commit --only`) take their paths from a NUL-separated pathspec file
    (`--pathspec-from-file`, `--pathspec-file-nul`, so Git 2.25 or newer) under the global `--literal-pathspecs`, so
    every entry stays a plain path. Reads and mutations share the 150 s budget: a read receives what is left of it
    (at most 10 s), a Git step with less than 1 s left does not start (retryable `COMMIT_BLOCKED` /
    `deadline-exceeded`), and once a mutation has started the reads that tell what it did keep at least 5 s. A path
    that is a directory (or submodule) in `HEAD` where a document is expected, or a directory on disk where `HEAD`
    holds a file, or a symbolic link on disk or a committed mode `120000` entry (verification compares the tree entry
    mode, not only the blob id), is a `non-blob:` state: it classifies as `foreign` and a commit naming it is refused
    (`path-kind-conflict`). The Engine records the paths it is about to add to the index before the add runs, so an
    add that was killed is taken back; the index lookup follows `core.ignorecase`. Read-only Git (`executeGit`) ends a
    process with SIGTERM and escalates to SIGKILL after 1.5 s; nothing that can hold the index lock runs through it.
    A process group is never signalled after its leader exited, except by the sweep in the mutation `exit` handler.
    `findByOperation` finds a batch by `Nevo-Operation` and by the ids in `Nevo-Coalesced`; an id that was cut off
    the trailer (the `,+N` form) is NOT findable, and a caller that cannot find its operation falls back to
    `inspectDocumentPaths` against the recorded `{ pre, post }`.

## Known limits

- **Without `/proc` a dead executor is never proven dead.** On Windows and macOS a Runtime or CLI that crashed while it
  held the queue lease leaves the checkout `busy` (`lease-held`) until an operator asserts that the executor stopped
  (`confirmExecutorStopped`, exposed by the recovery command). No platform-specific proof is built.
- **The replacement of a file is a cooperative check, not a lock.** A target is hashed, hashed again immediately
  before the replacement, and replaced through a stage file in the same directory. The window between the second hash
  and the system call is narrowed, not closed: before the rename the Engine makes a hard link to the target, and after
  it hashes the link (the old file). A foreign write that landed in place in that window is in the link; it is put
  back as the target, the path is treated as edited by someone else and the write is refused or needs recovery. A
  foreign atomic replacement that lands between the link and the rename is not seen, and where hard links are
  unavailable (no support, another device, no permission) only the two hashes protect. This is best effort and not a
  guarantee. A document with other hard links keeps them to its old content (the rename gives the path a new file).
- Moving or removing the last document of a folder leaves the empty folder on disk. Git does not track it and the
  registry (explicit folders) decides whether it is shown; it is an accepted state, not cleaned up.
- Two threads of one process (worker threads) have separate module state; they are kept apart by the compare-and-replace
  of the executor in the journal and by stage-file names that are unique per executor, not by the in-process
  serialisation.

- The working-tree hash of a symbolic link is the hash of the link, not of its target; documents are regular files and
  a link at a document path is not supported.
- Intent-to-add ownership is a per-attempt record. If the Engine process itself dies after an add and before the take
  back, the empty-blob entries stay in the index until the next attempt for the same paths; an empty-blob entry cannot
  be told from one a user made with `git add -N`, so the Engine does not reclaim entries it did not record.
- After a leader exits, the interval between Node reaping it and the sweep is not zero; a recycled process group id
  inside it is theoretically possible and practically requires the whole group to be gone and the id reused at once.

## State machine

```text
operation:  reserved -> files-writing -> queued -> committing -> completed(committed | not-applicable | uncommitted)
               |         |  ^  |  ^         ^   \-> commit-failed -(retry/new overlapping op/flush: dissolve)-> queued
               |         |  |  |  |         |   \-> completed(uncommitted, ledger entry) via abandon (ADR 0018; also from a queued op waiting after a failure)
               |         |  \--/  |         |   \-> recovery-required -(recover --resume/--adopt/--abandon)-> queued | completed | completed(uncommitted)
               v         v       |         \---- transient blocker (backoff to 60 s, retried until it passes) ----/
            failed <-----+  write-phase recovery-required (a retry of the operation takes the write back)
   files-writing -> files-writing: the executor is replaced under the lock (takeover)
   files-writing -> failed: a foreign edit was found while NOTHING of the write is on disk
batch:      formed(unclaimed) -claim(parentHead, lease)-> committing -> committed | split(failed rest) | failed | recovery-required
```

## Consequences

- A checkout can be dirty because of Nevo for a bounded window (relaxes ADR 0013); Close flushes first and refuses
  with a clear code if it cannot.
- Saves are fast (no Git on a cache hit) and history has one commit per burst per Specification.
- UI and API carry commit state; an abandoned batch is `uncommitted` (a ledger entry, ADR 0018).
- The commit port, journal codec, claims, error-status table and operation lists gain a new kind, plus the extraction
  of the durable core and a new per-path inspection.
- Hooks and signing do not apply to document commits (same trade-off as ADR 0013).

## Rejected

- **One synchronous commit per request**: latency and history noise.
- **Debounce longer than the settle window**; **an in-process-only queue**; **rolling queued files back**; **time-based
  takeover**; **`git add -A`**; **separate commits for registry and file**; **batches across Specifications** (one
  failed Specification would block another); **treating a mid-batch write failure as a plain failure** (changed files
  without a claim).
