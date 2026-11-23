---
id: architecture.runtime.document-write-and-commit-queue
type: architecture
title: Document writes, durable journal and commit queue
status: current
scope: specflow
areas: [runtime, workflow, server]
read_when:
  - changing document writes, claim leases, queue jobs or interruption recovery
  - investigating document commit failures, retries and refusal
summary: >-
  State-changing document writes, admission, queue claiming, crash/retry paths and scoped Git commit consolidation.
related:
  - architecture.runtime.specification-documents
  - architecture.runtime.document-limits
  - architecture.runtime.document-commit-policy
  - adr.0016-engine-owned-document-commits
---

# Document writes and the commit queue

## Write operations and the commit queue

Governing decision: [ADR 0016](../decisions/0016-engine-owned-document-commits.md) (the state machine and the full
failure classification live there). Exact contract: the reference. Push and publishing are not
part of this layer. Admission bounds are in the [document limits table](document-limits.md).

### Write admission and durable publication

**Write path (every state-changing operation).**

1. _Admission_ (nothing written): validate input, limits and the Windows path rule; resolve the Specification and its location (`archive/` is read-only); read the manifest; check preconditions on disk (`expectedRevision` of every named document, path rules, collisions, protection of `overview`, `SPEC_MANIFEST_DIRTY` against the post-image of the latest non-terminal operation or `HEAD`); with Git enabled the commit port's read-only `preflight` for the operation's paths (cached per `(root, branch ref, path-set hash)` for 2 s while the stat signatures hold).
   - Any refusal ends here with no journal and no file written.
   - A verified file identity that changes during the planning read is `SPEC_BUSY` (`source-changed`, retry after 1 s), not evidence that the document is missing.
   - No write is retried automatically; the caller re-reads the document before retrying.
   - Tree and summary reads continue to skip such unstable entries.
2. _Reservation_ under the control lock: preconditions and the manifest plan are re-checked (one re-plan, then
   `SPEC_BUSY`/`manifest-changed`); paths of a **claimed** batch are refused; `sequence` is allocated; the plan file
   and the content payload are durable; the operation becomes a **barrier** for its paths.
3. _Write_: files by temp file (fixed short name in the target directory) and rename, the manifest last, then one journal transition to `queued`; content payload files are then deleted.
   - The response is `200` after this transition, with `commit.state` `pending` (Git enabled) or `not-applicable`.
   - A failure after the first rename rolls forward from the payload while the claim and barrier are held. _Replay and roll-forward._ The same `operationId` is the retry and the crash recovery.
   - An equal request returns the stored result with the **current** commit state and writes nothing; a different request, or the same id on another Specification, is `DOCUMENT_OPERATION_CONFLICT`.
   - A journal in `reserved` or `files-writing` records the writer's **executor identity** (`pid`, `hostId`, and where `/proc` supplies them `pidNamespaceId`, `processStartTime`, `bootId`); the field exists only in those two stages.
   - The write is continued from the payload only when that writer is this very process (a write that stopped inside it), is provably gone (same host and PID namespace and the PID is absent or has another start time, or another boot id) or an operator asserted it; a live or unprovable writer is `SPEC_BUSY` (`write-in-progress`).
   - Each path is at its pre or its post state (anything else is a foreign edit), a path already at post is skipped, and the target is hashed again immediately before it is replaced, so continuing twice is harmless.
   - A foreign edit found while nothing of the write is on disk (at the `reserved` stage, or right after `files-writing`) ends the operation as `failed` (`DOCUMENT_REVISION_CONFLICT`, no claim, the client keeps nothing half done).
   - Once any path is in place a foreign edit, a full disk, an I/O error or an unprovable payload leaves the operation `recovery-required` in its write phase, holding the claim and the barrier, and the answer is `DOCUMENT_WRITE_FAILED` or `DOCUMENT_RECOVERY_REQUIRED` (`write-conflict` for a foreign edit, with `details.conflicts`).
   - The continuing process takes the write over by replacing the journal's `executor` under the control lock only if it is still the one proven gone, stage and backup files carry the operation and the executor in their names and are removed by pattern, and a replaced file keeps its mode.
   - The replacement of a file narrows the window after the second hash with a hard link to the old file, which is checked after the rename; this is best effort ("Known limits" of the ADR).
   - Empty folders left by a move or removal are an accepted state.
   - Without Git the operation completes at once as `not-applicable` (`git-disabled`) and its record moves to `settled/`, where it and its plan file stay for 24 hours so that the id keeps replaying.
4. _Commit_ (asynchronous): the worker holding the checkout lease forms the batch of one Specification, claims it
   (records `parentHead`), computes the **effective path set**, re-checks the guard and per-path states, makes one
   path-limited commit, verifies it and completes the members.

### Commit-state reads

- **Reads of the commit state.** The tree, the workspace `documents` section, the status of one operation and the rows of the document operation list read the active journals and batch records of the Project Home and nothing else: no control lock, no Git process, no write, bounded by the listing cap of the journal directory.
- A bad file is counted and reported (`commit-blocked` for the writes, a `recovery-required` row), never a failure of the read; a file that is not JSON is ignored.
- The plan file of an operation names the paths it covers (immutable, addressed by its hash, so a read remembers it).
- Only operations that have not settled appear, so a committed one leaves the tree; the tree revision covers the markers, the held paths, the capacity of the queue and the blockers but not the age of anything, so an unrelated read never changes it.
- A `reserved` or `files-writing` operation whose writer is provably gone (same host and PID namespace, or another boot) is reported as needing recovery; an unprovable one stays pending.
- The read side sits in `documents/reads` and imports neither the writer nor the mutating modules of the queue (import boundary).

### Batch consolidation

**Consolidation rule.** A commit batch is all non-terminal `queued` operations of **one Specification** in one
checkout, in `sequence` order, up to the caps; its commit is the final on-disk state of the effective path set.
Different Specifications are different commits. A batch of only saves waits for the settle period (300 ms, 250–500
configurable) bounded by the maximum hold (5 s); any structural operation makes it eligible at once. A barrier
operation (`reserved`/`files-writing`) delays claiming a batch that overlaps it.

### Claim and lease

- **Formation, claim and lease.** One pass of the queue takes the operations of one Specification that are `queued`, in `sequence` order, up to 50 operations and 200 distinct paths (paths compare case-insensitively).
- An operation is skipped, and no later operation that overlaps it may overtake it, while one of its paths is held by a barrier (`reserved`, `files-writing`, write-phase `recovery-required`), by a `failed` or `recovery-required` batch, or when it was pinned to another branch than the first member.
- A batch of only saves is claimable when 300 ms (configurable only within 250-500 ms) passed since its last member was queued or 5 s since its first, on a monotonic clock; the age of an operation that this process has not seen is read from its journal and clamped to 0..5 s, so a restart makes it eligible at once and a wall clock that jumped backwards cannot postpone the maximum hold.
- A structural operation, a full batch or a flush is claimable at once.
- The batch id is the id of its first member.
- The claim is one section under the control lock, in this order: the hash-addressed path list, the lease of the checkout, the batch record (`committing`, with `parentHead` read just before the lock and the executor), then each member `queued` to `committing`.
- The batch record is the commit point of every attempt and the member journals follow it, each function idempotent, so the process that takes over from a stopped executor (the dead proof, or an operator assertion) resumes a `committing` batch, completes the members of a `committed` one from the record without Git, and finds an unrecorded commit by its `Nevo-Operation` trailer instead of committing twice.
- A record is never created under the id of a record that is not finished; a split after a failure forms two new batches with disjoint members, never two under one id.

### Batch commit messages

- **Message of a batch commit.** The subject says what the batch did, worded from the plans of its members and restricted to what the commit holds: `spec(documents): update notes.md in <slug>`, `update 3 documents in <slug>`, `add …`, `rename <old> to <new> in <slug>`, `move …`, `delete … from <slug>` (`delete folder <name> from <slug>` for a folder, also an empty one), `classify <path> as <type> in <slug>`, and `change N documents in <slug>` when the members did different things.
- It is at most 72 characters and is never cut: when the form with full names does not fit, the Engine takes the next form whole, first with ` in <slug>` and then without it: the names by their last segment (`update api.md`), then a count (`update a document`).
- The body lists one line per change with the full names (at most 20 lines and 1500 characters, then `… and N more`), for a coalesced batch the number of operations, and `Specification: <slug>` when the subject could not name it; it is cleaned like the body of a manual commit.
- A member whose plan cannot be read is worded from its action and the committed paths.
- The trailers (ADR 0016 decision 3) are unchanged; the wording is not configurable.

### Failures, retry and abandon

- **Failures, retry, abandon and recover.** A transient blocker (index lock, busy Git, timed-out or hung Git, an effective set that changed under the attempt) dissolves the batch: its members are `queued` again with the attempt counted, `reason` and `blockedBy` visible and `nextAttemptAt` after the backoff (1 s doubling to 60 s, then every 60 s; the attempt counter saturates at 10).
- A transient blocker never ends the retries, a Git that is missing or cannot be started included: the operation stays `pending` and is committed once Git works again (the startup pass and the sweep arm it after a restart), and `abandon` is allowed meanwhile.
- A permanent failure makes the batch `failed` and its members `commit-failed`; when only some paths are at fault (a path edited by someone else, an ignored path, a directory where a document belongs) the batch is split: the original is dissolved, the members that touch a failing path (and, transitively, every member that shares a path with them) become one new `failed` batch named by its own first member, and the rest is queued to be committed as a new batch.
- Two live records never share an id.
- A failed batch is dissolved, its members queued again with the counter reset, when a new operation on the same branch overlaps its paths (the new write is folded in), or by `retry`; a failed batch holds only its own paths and never delays other paths or Specifications.
- An uncertain outcome is resolved by evidence: a commit that carries the batch's trailer AND leaves HEAD holding the recorded content of every path completes it; no such commit, HEAD still the recorded parent and a repository that can take a commit (no `index.lock`) is a retryable failure; anything else is `recovery-required`.
- A trailer alone is never trusted.
- A parent that history has rewritten is read again when no commit of the batch was started (`commitStartedAt` absent), otherwise the batch needs recovery.
- With Git turned off the queued operations complete as `not-applicable` (`git-disabled`) and the files stay; with the checkout gone they become `commit-failed` (`workspace-missing`).
- The Engine functions `retryDocumentCommit`, `abandonDocumentCommit`, and `recoverDocumentOperation` (`resume`, `adopt`, `abandon`) are the actions behind `retry`, `abandon` and `recover`; `abandon` keeps the files and ends every operation of the batch `completed` as `uncommitted` (reason `abandoned`): each member's paths are upserted into the ledger first and the operation completes in the same control-lock section, so its claim is released and its journal settles; a later commit that holds the paths, a manual commit or a hand commit removes the ledger entries (there is no marker stage and no `resolve`).
- The operator assertion that an executor whose lease cannot be proven dead has stopped is `QueueOptions.confirmExecutorStopped` of `runQueueOnce` / `drainQueue`.

### Failure classification

- **Classification summary and ownership rules.** Permanent (a person decides): a detached HEAD, a changed branch, a repository without commits, an ignored path, an unreadable index (`index-unreadable`), a protected or not-allowed branch, a foreign edit (`content-changed`), an invalid Git policy.
- Transient (waits, then catches up): an index lock, a busy Git, a timeout, a Git program that is missing or cannot be started, an unmerged index.
- Git turned off by policy is not an outage: a queued operation completes `not-applicable` and nothing is retained, no ledger entry.
- A started commit is never completed `not-applicable` without decisive evidence: it is resolved by the trailer look-up or goes to `recovery-required`.
- The durable batch record decides the fate of its members: the Git-disabled and workspace gates leave a `queued` member of a `formed` or `committing` batch to the batch, and `abandon` of a waiting operation is refused while it belongs to such a batch.
- Working content is read with `lstat` and a size-checked descriptor (raw limit): a symbolic link, a special file or an over-limit file is never hashed or committed, and Git path facts treat a working symbolic link and a committed mode `120000` entry as non-blob states.
- The write preflight cache signature covers `HEAD`, the index lock, merge, cherry-pick, revert, rebase and sequencer state, the root `.gitignore`, the common `info/exclude` and `config` and the Project Home configuration.

### Post-failure guarantees

- **Rules the queue keeps after a failure.** A failure after the commit was started is checked against the repository before it is called transient: a commit that carries the batch's trailer and holds the whole batch is recorded with its sha, whatever the failure was (a timeout, an error of the queue's own storage, Git turned off meanwhile).
- Only a failure that comes before any commit (the port's own blockers) or one with proof that nothing was committed is retried; a repository that cannot be asked, or a Git process that may still run (`not-terminated`), leaves the batch for recovery.
- Attempts are counted per member and a batch counts as many as its freshest member, so a new save that joins members that failed before keeps its full set of attempts.
- A failure is recorded only while the batch still belongs to the executor that reports it, and a lease is released only by the batch it names.
- A Git that cannot be found is permanent; one that could not be started for want of descriptors, processes or memory passes.
- A queued operation whose plan cannot be read is failed alone (`plan-invalid`, abandon or retry it); a write in progress whose plan cannot be read holds back the queue without throwing.
- Operations that wait for a person do not count against the 200 of the queue; 1000 of them end new saves with `SPEC_BUSY` (`held-limit`), which is not retryable.
- A repeat of the same action on an operation that is already where the action would put it (`retry` on a queued or finished operation, `abandon` on an abandoned one, `recover` on a recovered one) answers with that state; every other mismatch stays `DOCUMENT_OPERATION_STATE_INVALID`.
- `recover --resume` on a batch that was only partly committed by hand is `recovery-unresolved`: the exits are `abandon`, or finishing the commit by hand and then `adopt`.
- A save on another branch than a failed batch holds waits as `queued` without a `waitMs` (the sweep of the scheduler covers it); it is not marked as blocked.

### Commit-state projection

**Commit states** (`pending`, `committed`, `failed`, `uncommitted`, `not-applicable`) are derived from the journals.
`failed` keeps the files; `retry`, `abandon`, `flush` or the next overlapping save resolve it; `recovery-required` is
resolved by the operator command. `abandon`, like auto-commit off, ends `uncommitted`: the paths are in the ledger (ADR 0018).

### Durable queue storage

- **Where the queue lives.** In persisted journals, a batch record and a per-checkout lease record under the Project Home engine operations directory, not in memory.
- Every claim and transition is read, compare and write under the control lock (not a hardware compare-and-swap).
- The control lock is never stolen: a holder killed by SIGKILL stalls document operations (and Create) until an operator clears it (see the operator takeover below).
- Executors are identified by PID, host, PID namespace, process start time and boot id; automatic takeover needs a dead proof (same host and namespace and the PID absent or with a different start time, or a different boot id), otherwise an operator assertion.

**Interaction with other operations.** Create and other path-limited commits are unaffected. Another checkout has its
own queue, branch and HEAD. Git deadlines: read 10 s, mutation 30 s plus 3 s grace, batch attempt 150 s; children are
killed as a process group (tree on Windows).

### Scheduler

**Scheduler.** The Engine owns one scheduler per Engine (Project Home); it has no transport and no
process signals (`createDocumentQueueScheduler`, `specs/documents/scheduler/`). A host creates and starts it: the
Runtime after its listener is up; the one-shot CLI commands start none and drain explicitly. Rules:

- A finished write (`applyDocumentChange`, `resumeDocumentChange` ending `queued`) announces itself in process; the scheduler
  of the same Project Home state root arms one timer per checkout at the settle period (300 ms). A timer that is already
  due earlier is kept, so a burst keeps one timer.
- A pass is `drainQueue`. What the queue reports decides the next timer: `idle.waitMs` (settle left, or the backoff of a
  failed attempt) re-arms at that time; a re-queued attempt asks again at once and then learns its backoff; `busy` (another
  executor, or a second run of this process) retries with the queue backoff capped at 30 s; an empty or blocked queue arms
  nothing.
- At most one pass per checkout runs at a time; a wake-up during a pass runs one more pass afterwards. The queue's process
  wide lease mark backs this up for explicit runs of the same process.
- Every 30 s a sweep lists the active journals and arms the checkouts that have `queued` or `committing` work and no timer.
- The startup pass rolls interrupted writes (`reserved`, `files-writing`) forward through `resumeDocumentChange` (the
  writer judges the recorded executor: a live one is refused, a dead one is taken over) and arms every checkout with queue
  work at once. A restart inside the settle window therefore waits the rest of the settle again; an operation older than the
  maximum hold is eligible at once. There is no scan at first document access: Runtime start, the 30 s sweep, `flush` and
  Close cover it.
- An error of a pass is recorded (name only, never a path) in a ring of the last 50 events and published on the
  diagnostics channel `nevo.specflow.engine.document-scheduler`, and the checkout is retried with the queue backoff (1 s
  doubling to 60 s). The queue gives its claim back before an error escapes a pass, so no lease is leaked.
- All timers are `unref`'d: the scheduler never keeps a process alive. The timers and the monotonic clock are seams, and a
  disabled scheduler (`disabledDocumentQueueScheduler`) does nothing.
- `stop({ flush, deadlineMs })` cancels every timer and starts no further pass, waits for passes in flight, then (with
  `flush`) commits everything queued, ignoring the settle period, within the deadline (default 10 s). A commit already
  running is not cancelled. When the deadline passes the journals stay `queued` or `committing`; the next executor finishes
  them (dead proof, or the operator assertion). The outcome reports `complete`, `timedOut` and the operations `remaining`.
  A stopped scheduler is not started again; create a new one.

**Shutdown.** The Runtime (`startRuntime`) closes the server first, so that requests in flight have queued their writes,
then calls `stop({ flush: true, deadlineMs: 10 s })`; SIGTERM and SIGINT reach it through the `start` command. A CLI
command that writes documents calls `flushAllDocumentCommits(engine, { deadlineMs })` before it exits.

### Close admission and queue

**Close and the document queue.** `reserveCloseOperation` (and so every Close use case) does this at
first admission, in this order:

1. The pure preview. If it refuses with `CLOSE_PREFLIGHT` (a dirty tree may be Nevo's own queued documents), every
   checkout with queue work is flushed and the preview runs once more; if it still refuses and a document journal holds the
   source checkout or the primary checkout, the answer is `DOCUMENT_COMMITS_PENDING` instead. The preview and the preflight
   themselves never flush or write.
2. The flush of every checkout the plan owns (the source and, when it is another checkout, the target that is the
   integration destination), one after the other, ignoring the settle period, with a wait cap of 30 s per checkout when
   another executor keeps the queue.
3. The claim check: when document journals still hold one of those checkouts the Close is refused with
   `DOCUMENT_COMMITS_PENDING` (409), `details.cause` `commit-pending` (queued, committing, or a write in progress),
   `commit-failed` (`commit-failed` or `recovery-required`) or `commit-uncommitted` (the ledger still holds paths of the
   checkout after the flush pruned the entries a commit now holds). The first cause in that order wins.
4. The control lock. A save that slipped in between the flush and the lock holds a claim, so the in-lock claim check refuses
   with `CLOSE_CONFLICT`.

Precedence is therefore `DOCUMENT_COMMITS_PENDING`, then `CLOSE_CONFLICT`, then `CLOSE_PREFLIGHT` (a dirty tree that
no document journal explains). A Close that was reserved earlier is read back without any of this. A Create with an
integration destination requests `checkout:<destination>` and conflicts with the document claims of that checkout like a
Close does (`CREATE_CONFLICT`). A Git-disabled project queues nothing, so the flush returns without asking Git.

### Operator takeover

**Operator takeover.** The control lock is never stolen by age, PID or timeout. `takeOverDocumentQueue`
(`--confirmed-stopped` of the recover command) is the operator's answer to a stopped Runtime on platforms where the Engine
cannot prove the holder dead (Windows, macOS, containers without procfs). It needs the explicit assertion
`confirmExecutorStopped`; without it nothing is touched. It then:

1. clears the control lock (`takeOverProjectControlLock`) only when the lock is a regular file and the holder is provably not running on this host: the recorded PID is absent (`kill(pid, 0)`), or it is the PID of this process and the lock was written before this process started (a restarted container) while this process does not hold it, or the metadata is unreadable and the file is at least a minute old.
   - A live PID, a lock this process holds, a lock written by this process after it started (a sibling thread may hold it) and a lock that changed while it was judged are refused, and a refusal ends the command.
   - The record carries no host, so the assertion is also the statement that the Project Home is not shared with another machine; a recycled PID of an unrelated live process needs a person to remove the file;
2. rolls interrupted writes forward with `confirmWriterStopped`;
3. drains every checkout with queue work, flushing, with `confirmExecutorStopped`: a lease or `committing` batch whose
   executor cannot be proven dead is taken over, a live one is reported `busy` and left alone.

### Foreign edits and revision conflict

**Foreign edits.** `expectedRevision` is the on-disk hash, so a pending version is the baseline of the next save.
A pending path changed by another writer is `content-changed` at commit time, never committed silently.
