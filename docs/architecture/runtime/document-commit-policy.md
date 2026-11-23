---
id: architecture.runtime.document-commit-policy
type: architecture
title: Document commit policy, ledger and workflow-state commits
status: current
scope: specflow
areas: [runtime, workflow, server]
read_when:
  - changing git.commits.auto.documents, manual commit or the uncommitted ledger
  - reviewing workflow state commits and Close flush behavior
summary: >-
  Engine commit policy, manual commit selection, uncommitted ledger and workflow execution store commit boundaries.
related:
  - architecture.runtime.specification-documents
  - architecture.runtime.document-write-and-commit-queue
  - adr.0018-engine-commit-policy-and-manual-commit
  - architecture.workflow.workflow-kernel
---

# Document commit policy and execution writes

## Commit policy, the uncommitted-changes ledger and manual commit

Governing decision: [ADR 0018](../decisions/0018-engine-commit-policy-and-manual-commit.md). Push and publishing remain out of scope ("Future: push" in the ADR).

### Policy configuration

**Policy.** `git.commits.auto.documents` (committed `.nevo/config.yaml`, overridable in `.nevo/local/config.yaml`, default
`false`: nothing is committed automatically unless the configuration enables it, and there is no per-request override; the closed key set grows with each capability that adopts it). The Create scaffold commit and the commits of
`init` and `definitions install` are never governed by it. The effective mode is pinned in each operation's journal at
admission; a change affects new operations only (a non-empty queue drains normally; a non-empty ledger is never
committed silently).

`parseCommitsPolicy` accepts `auto` (a closed set of boolean capability keys, `documents`);
`parseGitWorktreePolicy` reads the local `git.commits.auto` (the only local `git.commits` key) and `effectiveAutoCommit`
returns the value with its source (`project`, `local`, `default`); an invalid value or an unknown key is
`GIT_POLICY_INVALID`, also while Git is disabled (the setting is then inert: nothing is committed, writes complete
`not-applicable`). The mode is pinned in the journal as `commitMode` (`auto` with the pinned `commit.branch`, or `manual`
without a commit; absent while Git is disabled). Manual-mode and queued operations never share a path state: the ledger holds
the first, the queue the second. The reservation counts the ledger's paths plus the ones of manual writers still in
flight and refuses the 201st distinct path with `DOCUMENT_UNCOMMITTED_LIMIT` before anything is written. The journal stage
`abandoned` does not exist as a stage or a commit state (`completed` with outcome `uncommitted`, state `uncommitted`).

### Auto-commit disabled

**Auto-commit off.** The write is the Git-disabled path with Git present: admission without the commit `preflight`, files
written at once, no queue, the operation completes `uncommitted` (reason `auto-commit-off`) in the same control-lock
section that upserts the ledger; its claim is released and its journal moves to `settled/`.

### Uncommitted ledger

**The ledger** (generic, `specs/durable/ledger/`): one durable record per checkout and owner (`specification`,
`definitions`, later `task`, `review`) of the paths the Engine changed and did not commit, each with the post-image
sha256 (or `absent`), the producing operation ids (at most 50 kept) and the pinned branch. `abandon` writes the same
entries. It holds no claim. A record is `engine/operations/ledger/<workspaceId>/<owner>.json`, published by atomic rename
under the control lock and read lock-free; entries are `{ path, postSha256 | null, operationIds, operationCount,
recordedAt, reason }` and the record pins `branch`, `head` and `workspaceRoot`. It is pruned when entries equal `HEAD`
(after a queued batch commits, a flush, a hand commit seen by the 30-second sweep, a manual commit or the Close flush): the
read-only effective-set read runs outside the lock and an entry is removed only if it is still the one judged. It is the only source of what a manual commit may include. Its revision is
the sha256 of the sorted `path:postSha256` list.

### Manual commit admission

**Manual commit** (`manual-commit` operation): same commit port, lease, `checkout-scoped` claim and journal store as a
queued batch. Scope `specification | definitions | all`; an optional path subset closed under shared operation ids; the
effective set is the ledger paths of the scope that differ from `HEAD`; any ledger path edited since its post-image, or a
changed branch, refuses the whole request (`MANUAL_COMMIT_CONFLICT`); the message is user text, validated and neutralised,
plus the Engine trailers; author per ADR 0013. **It is not `git commit -a`**: no path outside the ledger is ever
committed. States: `reserved` -> `committing` -> `completed` (`committed` or `nothing-to-commit`), `failed` (no effect),
`recovery-required`; order commit, verify, prune, complete; each step idempotent, resumed by the trailer lookup.

`specs/manual-commit/` is a journal kind of the durable core (`engine/operations/manual-commit/`,
`settled/`, a payload holding the ledger snapshot and the message, 16 KiB) with the stages `reserved`, `committing`,
`completed`, `failed` and `recovery-required` of its own. The checkout lease moved to `specs/durable/lease.ts` (the record, the
in-process mark and the dead proof; the queue binds it to its error vocabulary), so the queue and the manual commit exclude each
other through one file. The module imports no other Specification slice: the composition `documents/manual-commit.ts` resolves the
target (a Specification, the definitions, or a checkout) and supplies the ports (the claim check, the flush of the queue,
the quiet check of the paths). Admission order: Git enabled, queue at rest after a flush, ledger not empty, `ledgerRevision`, subset
closure, pinned branch, port preflight, no path edited since its post-image; the reservation re-reads the ledger under the control
lock and starts over when it moved. The reservation holds the checkout claim and the paths (a write of them is `SPEC_BUSY`) until
the journal ends. Execution takes the lease, records `parentHead` and the executor, records the start of the commit before Git
runs, commits the effective set through the port (kind `manual-commit`, a multi-line sanitised body, the paths in a pathspec
file), proves the commit holds every post-image, prunes the ledger entries as judged at the reservation, completes the journal and
releases the lease. A repeat finds its own commit by the `Nevo-Operation` trailer, accepts it only when it is the whole snapshot
and HEAD holds it, and never commits twice; a failure that does not prove the commit never ran waits for `recover`. Journal edges:
`reserved` to `committing` or `failed`; `committing` to itself (a new executor, the start of the commit), `completed`, `failed` or
`recovery-required`; `recovery-required` to `committing` (resume), `completed` (adopt) or `failed` (abandon).

### Close and queued operations

**Interaction.** Close refuses while the ledger of any checkout of its plan is non-empty after the flush and prune
(`DOCUMENT_COMMITS_PENDING`, cause `commit-uncommitted`), except for the execution state of the Specification a
Specification Close archives ([Commits of workflow state](#commits-of-workflow-state)). `SPEC_MANIFEST_DIRTY` is judged against the post-image of the
latest operation in flight, else the ledger post-image, else `HEAD` (a manifest that equals `HEAD` also passes a ledger
entry that no prune removed yet); a foreign edit is a hash mismatch. Policy flips: `on -> off` lets queued work drain with its
pinned mode and makes later writes `uncommitted`; `off -> on` commits nothing, the entries stay until a later `auto` write
of the path commits it (and prunes) or a manual commit. `init` and `definitions install` register the paths they commit
in the `definitions` owner before the commit and prune after it, so what an interrupted install leaves is known. With the policy on, a manual commit needs an empty queue for the scope (after a flush);
with it off it is always available once queued work has drained.

## Commits of workflow state

the writes of the Specification execution store (`.execution/**` and
`tasks/**` of a Specification: the Task index and manifests, the initial `task.md`, the run records and
removals) made by owner, UI or CLI operations are committed like the Specification's documents. Each
published change is ONE document operation of action `workflow` (contract
`DOCUMENT_OPERATION_STATUS_ACTIONS`) in the document journal store
(`specs/documents/write/execution-state.ts`):

### Workflow-state admission

- **Admission** (under the project control lock, before the store writes its journal): the same Git
  policy and preflight as a document write (`admitGitCommit`, pinned `commitMode`), no Create or
  Close holding the checkout, queue capacity, no claimed batch or manual commit holding a path
  (`SPEC_BUSY`, `commit-in-progress`), at most 200 paths, and with auto-commit off the ledger bound.
  A refusal writes nothing; it is a document error.

### Ledger record and Git effect

- **Record** (same lock section, after the files are published): the plan lists the paths with their
  `pre`/`post` and `source: written` (the store wrote them) or `none` (removed), plus the `summary`
  the operation gave (`create task api`). Auto-commit on: the journal is published `queued` (its
  `checkout-scoped` claim held) and the scheduler is woken (a CLI command, which runs no scheduler,
  drains the queue before it exits); the queue commits it like any member (the batch path list
  admits the execution state: the Task index and the run records as well as Task folders) (settle period, batches, verification, `Nevo-Action: workflow`, subject
  `spec(workflow): <summary> in <slug>`, `spec(documents): change documents and workflow state in
<slug>` in a mixed batch). Auto-commit off: the ledger entries (owner `specification`, reason
  `auto-commit-off`) then a settled `completed`/`uncommitted` journal. Git disabled: nothing.

### Task and auto-commit policy

- **Task documents (D03).** A `workflow` operation names no Task, so it is not a pending Task
  document change; the store's own D03 guard still refuses while a Task document change is not final,
  and a Task document change still refuses while the store's local journal is pending.
- **Auto-commit off, "Next".** A step's finish runs the post action `commit-execution-state`
  (`commitExecutionState`): a manual commit of the Specification's ledger entries below `.execution/`
  and `tasks/`, closed under shared operation ids, subject `spec(workflow): finish "<step title>"[ of task <id>] in <slug>`
  and the step id and attempt in the body (`Step solution, attempt 1.`). A path edited since the Engine
  wrote it (an agent writing `tasks/<id>/task.md` directly) would refuse the manual commit, and every
  later one, since each takes all the execution state. So before the commit the post action prunes the
  ledger once (an edit already committed with Git is no edit), then leaves out the edited paths with
  every path of their operations (`held` in the result) and commits the rest. The Task index
  (`tasks/index.yaml`) joins no operations here: every Task create, edit and removal rewrites it, so
  it would tie all Tasks into one and hold them all. Only the edited Task's own files are held; the
  other Tasks commit. The index commits with them unless it would register a held Task that HEAD does
  not have (its creation is held) or drop one HEAD still has (its removal is held); then the index is
  held too. While the index waits, every Task of the commit whose `task.yaml` exists in only one of
  the working tree and HEAD (created or removed since) waits with it, with all paths of its
  operations, so HEAD never holds a Task folder or run record its index does not list, nor an index
  entry without its Task (no `unregistered`, `broken` or `dangling` Task read from HEAD). Edits of
  Tasks HEAD already registers still commit. The next finish after the held Task is committed takes
  the index and the waiting Tasks. The held paths stay uncommitted
  until a person commits them with Git or a Close archives them.
- **Workflow subjects** follow the same rule as document subjects: at most 72 characters and never cut. When
  `<summary> in <slug>` does not fit, the summary goes alone, then `change the workflow state`; the body then holds the
  summary and `Specification: <slug>`.
- **Close.** A Specification Close does not wait for ledger entries of the execution state of the
  Specification it archives: its archive commit takes them along, and the next prune removes them.

### Crash recovery

- **Crash safety.** The store's journal fixes the operation id, the summary and each target's `pre`
  before any file is written, and the record is made BEFORE the journal is removed. A stop anywhere
  leaves the journal; the next change of the store publishes it again and records it with the same
  id and `pre`, and the record is idempotent by that id (an existing journal, active or settled,
  records nothing). A record that fails leaves the journal too, so the change is recorded later.
  The Close tolerance of dirty execution state is the backstop for state written outside the store.
