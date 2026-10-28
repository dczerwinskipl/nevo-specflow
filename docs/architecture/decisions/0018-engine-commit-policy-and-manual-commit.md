---
id: adr.0018-engine-commit-policy-and-manual-commit
type: adr
title: Engine commit policy per capability, the uncommitted-changes ledger and manual commit
status: draft
date: 2026-10-26
summary: >
  A general policy decides per Engine capability whether its edits are committed automatically (default OFF,
  git.commits.auto.<capability> in project config with a local override, configuration only). With it off a write completes at once as
  uncommitted and is recorded in a durable, owner-keyed uncommitted-changes ledger in the durable core. A manual commit
  is the only way the Engine commits ledger content then: a normal operation through the same commit port, lease, claim
  algebra and journal, path-limited to the ledger paths of a scope, with the user's message, never arbitrary user
  changes. Abandoning a failed batch and policy-level auto-off are the same state. Create and definitions install
  stay always committed. Push is out of scope.
related:
  - adr.0013-engine-owned-commits-and-protected-branches
  - adr.0016-engine-owned-document-commits
  - adr.0017-definitions-as-project-data
  - reference.configuration.specflow-git-worktrees
  - architecture.runtime.configuration
  - architecture.runtime.specification-documents
  - reference.api.specification-documents
---

# 0018 — Engine commit policy, the uncommitted-changes ledger and manual commit

## Status

Draft (owner decision, proposed with the document write and definitions delivery). It **extends** ADR 0016 (queued commits):
abandon and auto-commit-off are one state (decision 5). It is
**general**: the document capability is the first user; tasks and reviews adopt it when they exist. Language follows
[normative language](../principles/normative-language.md).

## Context

- `git.commits` (committed Project Home config, `parseCommitsPolicy`) holds `protectedBranches`, `allowedBranches` and
  `auto`. The policy reader `readProjectGitPolicy` reads the committed file and the local file; the local file may set
  only `git.worktreesRoot` and `git.commits.auto`. Protection is committed-only by ADR 0013 so a local file cannot
  loosen it.
- The document queue (ADR 0016) has the stages `queued`, `committing` and `commit-failed` and the per-checkout lease.
  Without a ledger nothing would know which uncommitted paths the Engine produced.
- Close claims `checkout:<workspaceId>` and flushes first (`reserveCloseOperation`); `SPEC_MANIFEST_DIRTY` compares the
  manifest with the post-image of the latest non-terminal operation or `HEAD`.
- Create commits its scaffold in one synchronous stage (ADR 0013: "Spec exists implies a committed scaffold"); `init`
  and `definitions install` commit the files they write (ADR 0017: installed definitions are never left untracked).
- There is no push capability and no mechanism to commit Engine-produced changes on request.

## Decision

1. **Policy.** `git.commits.auto` is an object of booleans, one key per Engine capability, in the **committed**
   `.nevo/config.yaml`: `git: { commits: { auto: { documents: true } } }`. The key set starts with `documents` and is extended by the change
   that introduces a capability that can be committed manually (tasks, reviews, definitions, ...); an unknown key is
   `GIT_POLICY_INVALID`. **Default `false` for every capability: nothing is committed automatically, in the CLI, the API or anywhere else, unless the
   configuration enables it.** Manual commit over the ledger scope of a capability is a capability of its own and
   needs no setting. The setting is configuration only (the UI reads and writes the configuration); there is no
   per-request or per-invocation override. It is validated by the same `parseCommitsPolicy` (so `init`
   and the reader cannot disagree), also while Git is disabled (then inert). **Why `git.commits.auto` and not a sibling
   namespace:** it answers the same question as the neighbouring keys (when may the Engine commit), it needs the same
   fail-closed validation and the same reader, and `git` is already the Git capability's namespace in
   `architecture.runtime.configuration`; a sibling would duplicate the reader and the Git-disabled rule.
2. **Local override.** `.nevo/local/config.yaml` MAY contain `git.commits.auto.<capability>`; the local value wins over the
   committed one; absent in both means `false`. This is the second explicit exception to "local config cannot override
   committed git policy" (after `worktreesRoot`) and it is limited to `auto`: the local `git.commits` object MUST NOT
   contain `protectedBranches` or `allowedBranches`. Justification: turning auto-commit off never loosens a safety
   control (protection stays committed-only; the Engine commits less, not more), and an individual developer may reasonably
   prefer to review before committing. The effective value and its source (`project`, `local`, `default`) are readable.
3. **Always committed.** The Create scaffold commit (ADR 0013: a Specification exists only with a committed scaffold, and Close
   needs a clean checkout) and the commits of `init` and `definitions install` (ADR 0017: installed definitions are never
   left untracked) MUST NOT be governed by `auto`; they are existence invariants of those operations. The owner may change
   this later by a new decision; no key is reserved for it.
4. **Capability behaviour with auto-commit OFF.** An operation of that capability behaves like the Git-disabled write path with
   Git present: admission (input, limits, Windows path rule, preconditions, `SPEC_MANIFEST_DIRTY`) runs; it MUST NOT run the
   commit port `preflight` (no commit will happen, so a protected branch, a detached HEAD or a merge in progress do not
   prevent editing); the files are written at once; **there is no queue and no batch**; the operation completes with commit
   state `uncommitted` (reason `auto-commit-off`) in the same control-lock section that records the ledger entry; its claim
   is released and its journal moves to `settled/`. The mode (`auto` or `manual`) is **pinned in the journal at admission**.
5. **One state: `uncommitted`.** `abandon` of a failed batch (ADR 0016 decision 15) and auto-commit-off both end in the
   same persistent state: the files are on disk, **not** in Git, recorded in the ledger. `abandon` is "manual: do not commit
   this batch" (reason `abandoned`); auto-off is the same at policy level (reason `auto-commit-off`). The journal stage
   `abandoned` does not exist: the operation is `completed` with `outcome: 'uncommitted'` and the public commit state is
   `uncommitted`; an abandoned batch holds no claim (the ledger is the marker). The public `CommitState` is
   `pending | committed | failed | uncommitted | not-applicable`.
6. **The ledger** (`specs/durable/ledger/`, generic; the documents slice is only a user). It is keyed by **owner** and
   checkout: owner kinds `specification` (id), `definitions` (the project) and, later, `task`, `review`.
   - One durable JSON record per `(workspaceId, owner)` under `engine/operations/ledger/<workspaceId>/`, written with the
     same atomic publish as journals, changed only by read, compare and write under the control lock, surviving restarts.
   - Entry: `{ path, postSha256 | 'absent', operationIds (at most 50, newest kept, plus a count), recordedAt, reason }`; the
     record pins the `branch` and the `head` at the time of the first entry. Updating a path replaces its `postSha256` and
     appends the operation id; an entry exists exactly once per path.
   - **Order of effects:** ledger upsert first (idempotent by operation id), then the journal transition; a crash between the
     two leaves an idempotent re-run (the same operation id adds nothing twice).
   - **Pruned** when committed: after every commit (queued batch or manual) the entries whose path now equals `HEAD` content
     are removed; a periodic prune (the existing 30-second sweep, only for non-empty ledgers, read-only Git: at most one
     `ls-tree` and the bounded hashing of the effective-set function), `flush`, a manual commit and the Close flush prune
     entries equal to `HEAD`, so a hand commit clears them.
   - Caps: 200 paths per record and 2 MiB per record file (200 paths of the longest admitted path and 50 operation ids
     each are about 1.15 MB; a smaller bound than that cannot hold a record the path cap admits), and a pinned branch name
     of at most 240 characters. A write that would add a 201st distinct path is refused before writing with
     `DOCUMENT_UNCOMMITTED_LIMIT` (409, "commit the pending changes first"); a write on a longer branch name is refused
     before writing with `COMMIT_BLOCKED` (`blockedBy: branch-name-too-long`).
   - **Git disabled:** a write made while Git is disabled records nothing, but re-images an entry its path already has to
     the new post-image, so enabling Git again does not turn the Engine's own content into a foreign edit.
   - The ledger **is the only source for what a manual commit may include** (decision 8).
   - It holds **no claim** and is not a journal; it is data. `ledgerRevision` of a scope = sha256 of the sorted
     `path:postSha256` list.
7. **Manifest baseline.** With auto-commit off (or any ledger entry for the manifest), `SPEC_MANIFEST_DIRTY` compares the
   manifest on disk with the latest non-terminal operation's post-image, else the **ledger post-image**, else `HEAD`; a
   foreign edit is still detected by hash mismatch. `expectedRevision` is unchanged (the disk).
8. **Manual commit** is an operation kind (`manual-commit`) that goes through the SAME commit port, per-checkout lease, claim
   algebra (`checkout-scoped:<workspaceId>`), journal store (own kind and directory, with `settled/`) and failure
   classification as queued batches; it is **not a bypass**. The lease record and its primitives move from
   `documents/queue` to `specs/durable/lease.ts` so both users share them without a dependency cycle.
   - **Inputs:** `{ operationId, scope, message?, paths?, ledgerRevision? }`. `scope` is `specification` (a `specId`),
     `definitions` (the Project Home) or `all` (every ledger owner in one checkout). `paths` is an optional subset of the
     ledger paths of the scope; because an operation's file and registry change MUST NOT be split, the subset MUST be
     closed under shared operation ids, otherwise the request is refused `MANUAL_COMMIT_SUBSET_INVALID` naming the
     required closure. An entry keeps only its newest 50 operation ids; when any entry of the scope has forgotten
     some (`operationCount` above its ids) closure cannot be proven, so every partial subset is refused and the closure
     named is the whole scope. `ledgerRevision`, when given, is a precondition (`MANUAL_COMMIT_STALE`).
   - **Availability:** with the policy OFF for the capability, always (after a bounded flush of any queued work of
     the scope; if that work cannot drain, `MANUAL_COMMIT_UNAVAILABLE`, cause `queue-not-empty`). With the policy ON, only
     when the queue for the scope is empty after a flush; it then **adopts** the ledger entries left by `abandon`.
     `pending`, `committing`, `commit-failed` and `recovery-required` operations of the scope make it unavailable (the
     person retries or abandons first).
   - **Safety boundary:** the commit contains the **effective set** = ledger paths of the scope (∩ the subset) that differ
     from `HEAD`. It MUST NOT contain any other path. It is **not `git commit -a`** and never commits arbitrary user
     changes. A ledger path whose working content differs from its ledger post-image (someone edited it since) is a
     **conflict**: the whole request is refused with `MANUAL_COMMIT_CONFLICT` (`details.paths`), and nothing is committed
     under the Engine's message. The branch MUST equal the ledger's pinned branch (else `MANUAL_COMMIT_CONFLICT`, cause
     `branch-changed`); the commit port `preflight` runs at admission (nothing reserved on refusal) and again at
     execution, so protected branches and blockers apply (`BRANCH_PROTECTED`, `COMMIT_BLOCKED`).
   - **Message:** the user's text is validated (first line 1–100 characters after trimming; optional body at most 2000
     characters; no NUL; other control characters removed; carriage returns normalised) and neutralised (any line that looks
     like an Engine trailer, `^Nevo-[A-Za-z]+\s*:`, is prefixed `> `); a default `spec(docs): manual commit <slug>` /
     `definitions: manual commit` is used when omitted. The Engine appends its trailers as the last paragraph:
     `Nevo-Operation`, `Nevo-Kind: manual-commit`, `Nevo-Action: manual-commit`, `Nevo-Scope`, and `Nevo-Spec` /
     `Nevo-Documents` where they apply. Author per ADR 0013 (the user's Git identity, Engine as committer). The commit port
     gains a multi-line body for this kind.
   - **States and recovery:** `reserved` (ledger snapshot and message in the payload store; `parentHead` and executor
     recorded when the lease is taken) -> `committing` -> `completed` (`committed`, or `not-applicable` /
     `nothing-to-commit` when every path already equals `HEAD`), plus `failed` (a refusal after reservation, no effect) and
     `recovery-required`. Order: commit, verify, **prune the ledger**, complete the journal; each step is idempotent. A
     `committing` journal is resumed by the trailer lookup (`Nevo-Operation`), an unrecorded commit is never repeated, an
     uncertain Git outcome is resolved by the decisive-evidence rule of ADR 0016 decision 13 or becomes `recovery-required`
     (`specs documents recover --resume|--adopt|--abandon` apply; abandon leaves the ledger as it is). Idempotency: the same
     `operationId` and body replay the stored result; another body is `DOCUMENT_OPERATION_CONFLICT`.
   - The request is synchronous (the person asked for a commit); it answers `200` with `commit { state: 'committed', sha }`.
   - **Authorization:** `Manage` of the Specification (HTTP). The `definitions` scope and `all` including it are CLI-only,
     like every definitions change. Over HTTP `all` takes only the ledger owners whose Specification the caller may also
     `Manage`; the entries of the others stay untouched in the ledger and are neither committed nor named in the answer
     (the command line, which has no per-Specification authorization, takes every owner).
   - **A stopped manual commit** (`reserved`, or `committing` where no dead proof exists) blocks the next manual commit and
     any write of its paths. It answers `SPEC_BUSY` with `details.operationId` of the holder, is listed as an operation
     (`OPERATION_INTERRUPTED`) once nothing has moved for five minutes, and is resumed by `recover <operation>` or by the
     operator takeover (`recover --confirmed-stopped`) and, where the executor is provably gone, by the scheduler at startup.
   - **Close and the ledger:** Close judges the ledger twice: before the control lock (after the flush, with the prune) and
     again inside it (a read without Git), because a manual-mode save writes no claim: one that lands between the two is
     `DOCUMENT_COMMITS_PENDING` (`commit-uncommitted`) and reserves nothing.
9. **Close.** `reserveCloseOperation`'s flush (ADR 0016 decision 16) also prunes and then **refuses** when any checkout of
   the plan still has ledger entries, with `DOCUMENT_COMMITS_PENDING`, `details.cause: 'commit-uncommitted'` (replacing
   `commit-abandoned`). The UI offers "Commit now" (decision 8). Dirty-tree preflight of Close is unchanged.
10. **Policy flips.** `on -> off` with a non-empty queue: queued and committing operations keep their pinned `auto` mode
    and **drain normally**; operations admitted afterwards are `manual`. `off -> on` with a non-empty ledger: **nothing is
    committed silently**. The entries stay until the first manual commit or an explicit "commit pending" action; a later
    auto-mode operation on a ledger path commits that path's final content in its batch (its `expectedRevision` proved the
    person saw the earlier content) and the entry is pruned. The policy is read fresh at admission and at every queue
    attempt; a change takes effect for new operations only.
11. **Read model.** `commit.state: 'uncommitted'` per document (with `reason`), the tree `commits.uncommitted` count and
    `commits.policy` (`auto|manual` per capability with its source), a ledger read
    `GET /api/specs/:specId/uncommitted`, and no operations-list rows for completed-uncommitted operations (they are not
    failures); a `manual-commit` in `recovery-required` is listed (kind `manual-commit`).
12. **Config validation.** `git.commits.auto` that is not an object, has a non-boolean value or an unknown capability key is
    `GIT_POLICY_INVALID` (project and local); the local `git.commits` may contain only `auto`.

## Future: push (out of scope for this delivery)

Push is a separate capability and is **not** added here. Reasons it must be separate: the Engine has no push capability
today; a push needs credentials, and the Engine runs Git as detached children with no terminal, so credential helpers
and prompts cannot work and a hung prompt must not wedge the queue; the remote may reject a non-fast-forward and the Engine
MUST NOT resolve it (never force, never rebase); the remote may protect branches the local policy does not know; and a
publish result is not recoverable by the local journal. Seams that make it addable without redesign: the ledger scope
(owner and checkout) says what is Engine-owned, the commit `sha` of a settled journal and the `Nevo-Operation` trailers
identify Engine commits (`git rev-list @{u}..HEAD` filtered by trailer yields "unpushed Engine commits"), and the same
lease serialises Git work per checkout. No `push`, `publish` or force code may be added by this delivery.

## Consequences

- The Engine can leave a checkout dirty **by design** and says so durably; Close refuses until it is committed.
- The queue, `abandon` and auto-off share one state, one marker and one way out (manual commit).
- `git.commits.auto` extends the configuration reference, the Git policy parser and the local-config exception list.
- A person can edit documents on a protected branch with auto-commit off (nothing is committed by the Engine); the manual
  commit is then refused by the guard (`BRANCH_PROTECTED`), and a hand commit clears the ledger on the next prune.
  **Known limit:** the ledger pins the branch of its first entry. Changes saved on a protected branch with auto-commit off
  cannot be committed by the Engine, and switching to a free branch makes the manual commit refuse with `branch-changed`:
  the person switches back or commits by hand (then `resolve` or the next prune clears the ledger). Nothing re-pins a
  ledger.
- The contract changes the implemented `CommitState` (`abandoned` -> `uncommitted`) and the journal stage graph (no
  `abandoned` stage); the task that does so updates tests, reference and code together.

## Rejected

- **A sibling `engine.commit` namespace**: a second reader and validator for the same question.
- **Auto-commit as a per-request flag**: the policy is a project/developer decision, not a client choice.
- **Governing Create and `init` by the policy**: they are existence invariants (ADR 0013, ADR 0017).
- **`git commit -a` or "all changes under the Specification"**: would commit someone else's edits under the Engine's name.
- **A manual commit that bypasses the lease, claims or journal**: it would reintroduce the races the queue closed.
- **Silent auto-commit when the policy flips back on**: the person decides what leaves the working tree.
- **A push in this delivery** (see "Future: push").
