---
id: reference.api.specflow-specification-operations
type: reference
title: Specification Create and Close HTTP reference
status: current
scope: specflow
areas: [runtime, server, security]
read_when:
  - integrating the production Create Specification screen
  - changing HTTP Create, Close and Workspace Close schemas
summary: >
  Implemented E2 endpoint routes, public payloads, response codes and authorization
  boundaries.
related:
  - reference.api.specification-documents
  - architecture.runtime.specflow-lifecycle
  - product.specflow.specification-creation
  - reference.configuration.specflow-git-worktrees
  - reference.api.operation-progress
---

# Specification Create and Close HTTP reference

Exact schemas are in `packages/specflow-contracts/src/specs/`; transport mapping lives in
`packages/specflow-runtime/src/features/specs/`. This document describes current E2, not
future Workflow or provider Session APIs.

## Create

The authoritative transport contract is generated as:
`GET /api/specs/create-options` (`getSpecsCreateOptions`),
`GET /api/specs/archetypes` (`getSpecsArchetypes`),
`POST /api/specs` (`postSpecs`), and
`GET /api/specs/create/operations/{operationId}`
(`getSpecsCreateOperationsByOperationId`) in [OpenAPI](openapi.md).

**Source:** TypeBox in `packages/specflow-contracts/src/specs/create.ts` and
`create-options.ts`, routes in `packages/specflow-runtime/src/features/specs/create/endpoint.ts`.
Request/response shapes, refusal statuses, `Prefer: respond-async`, ETag and operation lookup
are documented on those operations in generated OpenAPI, not hand-copied here.

**Domain behavior:** [Create options and admission](../../architecture/runtime/specification-create-options.md)
explains the role of `baseRef`, workspace joining, information exposure, Git-off, invalid
policy and idempotency. [Specification lifecycle](../../architecture/runtime/specification-lifecycle.md)
owns durable effects/recovery. The [Create product contract](../../product/specflow/specification-creation.md)
owns UI flow. [Progress SSE](operation-progress.md) is optional, not authoritative.


## Close

| HTTP | Route                                                        | Meaning                                   |
| ---- | ------------------------------------------------------------ | ----------------------------------------- |
| GET  | `/api/specs/:specId/close/preview`                           | Plan Specification Close                  |
| GET  | `/api/specs/:specId/close/occupancy`                         | Running Turns in the checkout, no plan    |
| POST | `/api/specs/:specId/close`                                   | Archive/optional integrate                |
| GET  | `/api/specs/:specId/worktree/close/preview`                  | Exclusive Worktree Close preview          |
| POST | `/api/specs/:specId/worktree/close`                          | Exclusive Worktree Close                  |
| GET  | `/api/specs/:specId/close/operations/:operationId`           | Inspect Spec Close                        |
| GET  | `/api/workspaces/:workspaceId/close/preview`                 | Preview **every** canonical occupant      |
| POST | `/api/workspaces/:workspaceId/close`                         | Whole-branch integration and group rebind |
| GET  | `/api/workspaces/:workspaceId/close/operations/:operationId` | Inspect Workspace Close                   |

Mutating Close requests include UUID `operationId`; Specification Close optionally sends
`integrateToTargetBranch:false` for archive-only. Completed results use 200; unsettled use 202.
Worktree Close requests also accept an optional `finishAfterExternalMerge: true` (#157, below), and
so does `GET /api/specs/:specId/worktree/close/preview` — as the query string `?finishAfterExternalMerge=true`
(a literal string, not JSON `true`: query strings are always text), since it changes the previewed
merge shape (`not-integrated`/`already-merged-externally` instead of an ordinary `integrates`).
Specification Close does not accept the field at all, on its request body or its preview query: its
request and preview-query schemas have no such field (owner decision 2026-11-20, below), so a body
or preview query that sends it is rejected with 400 at the schema boundary, before it reaches the
Engine.

**Git off.** In a project with Git off (`git.enabled: false`, or no `git:` block in
`.nevo/config.yaml`) a Specification Close only archives: the Specification is moved to
`specs/archive/<slug>` in its own checkout (primary or linked), the same archive result as a normal
Close, with no commit, no integration and no repository precondition (no clean tree, no integration
branch, no branch check), so it never answers `CLOSE_PREFLIGHT` with `repository`. The workflow
gate (`CLOSE_BLOCKED`), running Session Turns, `DOCUMENT_COMMITS_PENDING` and resource conflicts
still apply. Omitting `integrateToTargetBranch` (or `false` for a linked Specification) archives;
`integrateToTargetBranch: true` is `400 CLOSE_INVALID` before the workflow gate, in the primary
checkout too (one message: Git is off, a Close cannot integrate). The preview answers
`integrationRequired: false` and `merge: {status: 'not-integrated', reason: 'git-off', checkout}`,
the result `outcome: 'archived-without-git'`. The archive stays uncommitted in that checkout; a
linked worktree created while Git was on keeps it, and a later Worktree Close with Git on meets
`uncommitted-changes` until it is committed. The mode is decided once from the policy and carried by
the plan; the reservation re-evaluates it under the lock, and a changed mode or configuration
revision is `409 CLOSE_CONFLICT` before anything is reserved. An operation keeps the mode it was
reserved with. A Git policy that cannot be read is never taken for a mode: the Close answers its
error (`503 GIT_POLICY_INVALID`) after the workflow gate and before any repository inspection.
Worktree and Workspace Close integrate with Git, so with Git off their preview and Close are
`400 CLOSE_INVALID` ("Git is off for this project: closing a worktree integrates it with Git;
archive the Specification instead, or turn Git on."). A Close with Git off that stopped after its
archive intent is `recovery-required` and holds its claims until the operator recovers it
([`specs close-recover`](../cli/specflow-specification-commands.md)).
Spec-scoped Close requires the appropriate Spec capability and whole-branch integration also
needs project-wide Git `Integrate`. Workspace Close requires project-wide Git
`CloseWorkspace` **and** `Integrate` before revealing occupants/journals.
Shared spec-scoped integration refuses with 409 `CLOSE_SHARED_WORKTREE`.
Close and integration first flush the document commit queue of the affected checkouts and refuse with 409
`DOCUMENT_COMMITS_PENDING` (`details.cause` `commit-pending`, `commit-failed` or `commit-uncommitted`) while document
commits remain; the precedence is defined in [Specification documents](specification-documents.md)
(item 19 of its UI notes). The three preview routes do not flush: when the plan refuses a dirty
checkout while document commits still hold one of the checkouts the request names, they answer the
same `409 DOCUMENT_COMMITS_PENDING` the Close would, so documents Nevo commits or waits for are never
reported as files to commit by hand. Any other repository precondition is `422 CLOSE_PREFLIGHT`
with `repository`: the blockers the owner fixes in the repository, all that are known at once
(`uncommitted-changes` with at most 10 `paths`, each `{ path, scope }` with `scope`
`specification` for a file below the Specification's own folder `specs/active/<slug>/` (listed
first; only in the Specification's own checkout, every path of the checkout it integrates into is
`other`) and `other` for any other file of the checkout, the `count`, the `specificationCount` of
them that are the Specification's own and the `workspaceId` of the checkout that holds them (its
path is read from `GET /api/workspaces`, gated by `workspace.view`; the refusal never carries a
filesystem path). A Specification Close accepts its own uncommitted Tasks and `.execution`; any other
uncommitted file refuses, because the Close pins the checkout's HEAD, index and tree, proves its
archive commit and merge against them and never commits, stashes or discards files that are not the
Specification's), `integration-target-missing`,
`integration-target-branch`, `git-operation-in-progress`, `branch-detached`;
`RepositoryBlocker` in `@nevo/specflow-contracts/specs`).

The preview and the Close answer the same blockers. `integration-target-missing` means the
project uses Git (`git.enabled: true`) and its `git:` block names no `git.integrationTargetBranch`.
It lists the local branches that could receive the Close, as facts. The server never chooses one
and never assumes a name such as `main`:

- `sourceCheckout` is the Specification's checkout. With `linked`, the Close merges its branch into
  the integration branch. With `primary`, it archives directly on the integration branch in the
  main folder, and there is nothing to merge.
- `candidates` (at most 50) are `{branch, facts}`. Each local branch appears once, with every fact
  that applies, in this order:
  - `remote-default`: the default branch of `remote`, read from the local
    `refs/remotes/<remote>/HEAD`, which `git clone` or `git remote set-head` sets. `remote` is
    present exactly with this fact. The server never fetches, so a missing remote or an unset
    remote HEAD gives no fact.
  - `started-from`: the Specification's linked workspace was created from this branch, as recorded
    at Create. Other Specifications can share that workspace. A workspace created before the fact
    was recorded gives none.
  - `primary-checkout`: the branch checked out in the main folder.

  Candidates are ordered by their first fact. A fact about a branch that does not exist locally
  names no candidate. The Specification's own linked branch is never a candidate: the server takes
  it from the Close evidence, or else from the branch Create recorded for the workspace (`branch`
  on the registry entry), so a detached checkout still excludes it.

- `otherBranches` lists the remaining local branches by name: at most 200 of `otherBranchCount`,
  without the candidates, the Specification's own linked branch, and branches that
  `git.worktrees.branchPattern` names (Specification branches).

Branch and remote names are at most 255 characters, and a name the blocker cannot carry is not
offered. Both lists can be empty, and they are empty when Git cannot be read. The refusal still
names every other repository precondition. The preview only reads Git (no fetch, no ref, config
or index write), and nothing is written to `.nevo/config.yaml`.

A successful preview (`ClosePreview`) carries the merge facts in `merge`:

- `{status: 'integrates', sourceBranch, targetBranch, commitsAhead}`: the Close merges
  `sourceBranch` into `targetBranch`. `commitsAhead` counts the source commits that are not on the
  target when the preview reads them. `0` means there is nothing to merge. A Specification Close
  still adds its archive commit.
- `{status: 'not-integrated', reason, sourceBranch}`: nothing is merged. `archive-only` means the
  linked Specification is archived on its own branch, as `integrateToTargetBranch=false` asks.
  `primary-checkout` means the Specification lives in the primary checkout and is archived directly
  on `sourceBranch`, which is the integration branch.
- `{status: 'not-integrated', reason: 'already-merged-externally', sourceBranch, targetBranch}`: a
  Worktree Close requested (or previewed) with `finishAfterExternalMerge: true` (#157, below) —
  this reports the **selected mode**, not a confirmed result: it asserts `sourceBranch` was already
  merged into `targetBranch` outside this Close (a GitHub squash merge, for example), but the
  preview proves nothing by itself. Only the actual Close operation proves whole-branch content
  equivalence before it proceeds, refusing `CLOSE_EXTERNAL_MERGE_MISMATCH` if the assertion is
  false; on success it creates no merge commit.
- `{status: 'not-integrated', reason: 'git-off', checkout}`: Git is off for the project. The
  Specification is archived in place in `checkout` (`primary`, or `linked`: its worktree), nothing is
  committed or merged, and no branch is read (a client says, for example, "Archives without Git (Git
  is off for this project)"). The archive stays uncommitted in that checkout.

A Close that the Specification workflow refuses (unfinished Tasks or runs, pending writes) answers 409
`CLOSE_BLOCKED` with `blockers`: groups `{kind, subjectIds, message}` (`kind` is a stable value, `subjectIds` are
Task ids or the Specification id for Specification-wide holds, `message` is display-only). Abandoning the
Specification instead is [`POST /api/specs/:specId/workflow/abandon`](specification-workflow.md).
The Runtime also answers `409 CLOSE_BLOCKED`, on the preview and on the Close itself (Specification
and Workspace Close), while an agent Session Turn works in the linked checkout Close would remove: one
blocker `{kind: 'session-turn-running', subjectIds: [sessionId...]}` (`CloseRefusalBlocker`).
`GET /api/specs/:specId/close/occupancy` (the Specification Close capability) reads the same blocker
without planning the Close, from the Specification's registry binding: `{blockers: []}`, or the one
`session-turn-running` blocker while Turns run in its linked checkout (never for the primary
checkout, which Close does not remove). A client reads it when the workflow projection already
blocks the Close, so both kinds are shown at once. While
Close runs, the Runtime holds that checkout against new Turns, and a Turn of the Specification's
Session refuses to start while an unfinished Close journal names the Specification
([Sessions API, execution workspace](sessions.md)). The hold is in the Runtime process. A Close run
anywhere else (the CLI, or a Runtime that does not own the Session store) refuses with the same
blocker while a live Runtime owns the store, after a stopped one left an unsettled Turn in the
checkout, or when the owner cannot be determined
([Specification lifecycle](../../architecture/runtime/specification-lifecycle.md#safe-integration-rebind-and-disposal)).

Worktree Close treats `.nevo/local/cache/**` (the semantic documentation index) as disposable
product-owned files: they do not make the worktree dirty and are deleted with it. When Create
copies Project Home's `.nevo/local/config.yaml` into a new linked worktree, the Engine records the
SHA-256 of the copied bytes in `.nevo/local/state/local-config-copy.json` of that worktree, and Close
deletes the configuration with the worktree only while its bytes still match the record. A
configuration that was edited, that the Engine did not copy, or that cannot be read makes Close
refuse with 409 `CLOSE_LOCAL_CONFIG_MODIFIED` before anything is removed (the Close stays at
`binding-rebound`). The body carries `localConfig` (`changed`, `unrecorded` or `unreadable`) and a
`remedy`: the configuration is not the unchanged copy Create made (changed, added by hand, or
unreadable) and must be moved or deleted manually.
Retrying the same Close operation afterwards completes the disposal.
Error status and exact DTO variants are defined in the schema and Runtime endpoint.

**Finish after an external (PR) merge (#157).** `finishAfterExternalMerge: true` on a Worktree Close
is person-initiated and never inferred from the merge facts: it proves by content, not ancestry, that
the destination already has everything the source branch changed (the Specification's own canonical
subtree(s) and every path the source branch's merge-base diff names), then finishes through the same
archive + CAS-rebind + worktree-disposal effects an already-integrated Close uses — no new merge
commit. A retry of the same `operationId` that flips this field is `409 CLOSE_CONFLICT`, exactly like
`integrateToTargetBranch`; it is `400 CLOSE_INVALID` in the primary checkout. On a mismatch, Close
answers `409 CLOSE_EXTERNAL_MERGE_MISMATCH` with `paths` (at most 10 of the total): every path that
is missing or not yet content-equivalent in the destination, not just the first.

**Restricted to Worktree Close (owner decision 2026-11-20).** Specification Close's request schema
has no `finishAfterExternalMerge` field at all, so an HTTP body that sends it on
`POST /api/specs/:specId/close` is rejected `400` by the schema before reaching the Engine. The
Engine refuses the same combination explicitly and unconditionally — `400
CLOSE_EXTERNAL_MERGE_UNSUPPORTED`, before any Git inspection or mutation — for any caller that
bypasses the schema (a non-HTTP Engine consumer, or a replayed `operationId`). Specification Close's
contract is that after success the Specification's canonical state is `archived`; this mode skips
merge/integration entirely, so the destination never receives the archive, and the combination would
report a false `completed`/`integrated-and-removed` success while the Specification stayed `active`
on the destination branch. Worktree Close's narrower contract (retire a worktree binding whose
content already merged) makes no such claim, so only it supports this mode.

No operation silently completes tasks, invents Session state or retries uncertain Git effects.
