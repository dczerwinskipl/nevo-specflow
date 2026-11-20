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

| HTTP | Route                                              | Result                                                          |
| ---- | -------------------------------------------------- | --------------------------------------------------------------- |
| GET  | `/api/specs/create-options`                        | 200, authorized read-only options                               |
| GET  | `/api/specs/archetypes`                            | 200 archetype catalogue (ETag = revision, 304), same capability |
| POST | `/api/specs`                                       | **201** `CreatedSpec`, or **202** with `Prefer: respond-async`  |
| GET  | `/api/specs/create/operations/:operationId`        | 200 sanitized observation or 404 `CREATE_NOT_FOUND`             |
| GET  | `/api/specs/create/operations/:operationId/events` | live named steps (SSE), see below                               |

The list of Create operations for the Specifications screen is `GET /api/specs/operations`
(`reference.api.specs-operations-list`; admitted by spec view, not by `Create`).

All of them require project-wide Spec `Create` capability before reading protected data.
401/403 use existing Auth schemas. With no Engine composition, all return
503 `{"error":"ENGINE_UNAVAILABLE","code":"ENGINE_UNAVAILABLE"}`.
Typed Create errors otherwise expose matching uppercase `error`/`code`; examples include
`CREATE_CONFLICT`/409, `BRANCH_ALREADY_EXISTS`/409, `BASE_REF_NOT_FOUND`/422
and `CREATE_RECOVERY_REQUIRED`/503. With Git enabled the Engine also commits the scaffold, which adds
`BRANCH_PROTECTED`/422 (the target branch, or a generated or typed new-worktree branch name, is
protected by `git.commits`; nothing was created), `COMMIT_BLOCKED`/409 (the checkout cannot take a commit now: detached HEAD,
merge or rebase in progress, unmerged paths, ignored scaffold path, held index lock; nothing was
created) and `COMMIT_FAILED`/503 (the scaffold files were written but could not be committed; an
operator has to resume, a re-submit answers `CREATE_RECOVERY_REQUIRED`). Bodies stay `{error,code}`;
they never carry branch patterns, paths or Git output.

POST request: `{title,goal?,slug?,operationId?,target?,archetypeId,archetypeVersion,catalogueRevision,optionalDocumentIds?,addedDocuments?,folders?}`,
title HTTP length 1–200. The three archetype fields are required (no default archetype in the contract); the
catalogue is `GET /api/specs/archetypes` and the fields are specified in
[Specification documents](specification-documents.md) (D2). The route sets its own `bodyLimit` of 2 MiB; a larger
body is **413** `DOCUMENT_TOO_LARGE`. Further typed errors: `CATALOGUE_STALE`/409 (revision or archetype version
changed; nothing written), `ARCHETYPE_UNKNOWN`/422, `DOCUMENT_PATH_INVALID`/400, `DOCUMENT_PATH_CONFLICT`/409,
`DOCUMENT_OPERATION_INVALID`/400 (counts, UTF-8 byte limits, an added type that cannot be registered) and
`CREATE_JOURNAL_UNSUPPORTED`/503 (an unreadable journal read by operation id). The catalogue revision is
checked only when a new operation is admitted and is not part of the idempotency fingerprint.
`slug` is optional, lowercase kebab-case ASCII (`^[a-z0-9]+(-[a-z0-9]+)*$`, at most 80 characters,
not a Windows device name). It replaces the title-derived slug for the Spec folder, the
worktree folder and the `{slug}` of the branch pattern. It is part of the idempotency fingerprint
(an omitted slug keeps the previous fingerprint, a different one on the same `operationId` is
`CREATE_CONFLICT`); a slug already used by a Spec or an open Create is `CREATE_CONFLICT`, never
renamed; a malformed slug is rejected by the schema (400) or `CREATE_OPERATION_INVALID`.
`target` omitted means primary, `{kind:"existing",workspaceId}` means one registered checkout,
and `{kind:"new-worktree",baseRef?,branch?,integrationTargetWorkspaceId?}` means a new managed
worktree. Omitted/explicit overrides have distinct durable fingerprints.

Successful result:
`{operationId,specId,kind:"specification-create",status:"completed",slug,workspaceId,relativeManifestPath,documentIds}`
(`documentIds`: the registered documents of the new Specification, in registry order).
The Create result exposes no absolute checkout paths; create-options expose the worktree folder (`worktreesRoot` below).
**Workspace path exposure (decision).** `GET /api/specs/create-options` returns the worktree folder (`worktreesRoot.path`)
to every principal that holds the `Create` capability (scope `{}`): the Create dialog needs it to explain where a new
workspace lands. The absolute checkout path of each registered workspace is served by
[`GET /api/workspaces`](workspaces.md) (`workspace.view`), which Create Specification reads next to the options. The
Runtime does not hide the folder behind a separate capability, so a Create-capable role can read the workstation
directory layout (including user names inside paths); grant `Create` only to roles that may see it. Restricting
`worktreesRoot` to an operator capability is a follow-up.

Create options include `primaryWorkspaceId`, `workspaces[]` (`workspaceId,managed,specCount,state,selectable,
integrationSelectable,branch?,reason?,integrationDestination?`),
`newWorktree` (`status,reason?,branchProtected?`), `defaultBaseRef`, `branchPattern`, `worktreesRoot`, `integrationTargetBranch?`, `commits?`, `baseRefs[]`.
Each `workspaces[]` entry is keyed by `workspaceId`, the key of the same workspace in
[`GET /api/workspaces`](workspaces.md). The registry facts (`kind`, `name`, `path`) are served only by that list; a
client joins the two by `workspaceId`. `specCount` stays a Create-only fact: it counts **every** Specification bound to
the workspace (for the shared-use warning), whereas `specifications[]` of the list holds only the readable ones the
caller may view, and serves titles. **Create Specification therefore needs `workspace.view` as well as `Create`**: without
it the list answers 403 and the form shows the no-permission alert. A workspace of the options that the list does not
contain means the registry changed between the two reads; the client treats it as a failed read (error state, Retry
reads both again). The Create-only facts are `managed`, `specCount`, `state`, `selectable`,
`integrationSelectable`, `integrationDestination`, `branch` and `reason`.
A checkout that the list reports unavailable as `checkout-mismatch` (the folder no longer is the
registered checkout: moved, replaced by a link or redirected) is `state:'unavailable'` here with
`reason:'checkout-unavailable'`; Create has no separate mismatch reason.
`commits` is `{protectedBranches[],allowedBranches?[]}` and is present **exactly when Git is enabled** (the
Engine then commits the scaffold), even with empty lists; it is absent when Git is disabled, as are the two
reasons `branch-protected` and `branch-not-allowed` and `newWorktree.branchProtected`. A workspace whose branch
is protected or not allowed stays listed with `selectable:false` and that `reason` (its `state` is still
`available`/`dirty`, `branch` names the branch); `integrationSelectable` is unaffected. `newWorktree.branchProtected: true`
means the branch the pattern generates for a representative name is protected: the tile stays selectable, but
the user has to type another branch name (advisory; the Engine decides on the real name).
`branchPattern` is the effective pattern (default
`feature/{slug}`; `{shortId}` is optional). `worktreesRoot` is `{path,exists}`: the effective folder
that receives new worktrees, from the machine-local `git.worktreesRoot` or the `<repo>-worktrees`
default; `exists` tells whether it exists yet (it is created on first use).
**Invalid Git policy.** An invalid `git` section of the project configuration (for example an unknown key)
does not fail `GET /api/specs/create-options`. The answer is 200 with what needs no Git: the registered
workspaces verified on disk, each with `state:'unavailable'`, `selectable:false` and
`reason:'git-policy-invalid'` (a workspace that is itself unavailable keeps `checkout-unavailable`),
`newWorktree: {status:'unavailable', reason:'git-policy-invalid'}`, `baseRefs: []`, no `commits` and no
`integrationTargetBranch`, and the default `branchPattern`/`defaultBaseRef`/`worktreesRoot` (display only). No Git
process runs. The cause is logged on the server only (a warning with the Engine's own description, no path) and is
never part of the response. A machine-local `git.worktreesRoot` inside the repository or `.git` is handled the same way:
`newWorktree` becomes `unavailable/git-policy-invalid` and `worktreesRoot` shows the default folder with `exists:false` (existing-workspace
Creates stay possible). Create (every target, existing included) and the lifecycle mutations still **fail
closed** with `GIT_POLICY_INVALID`/503, because they read the policy to decide whether the Engine commits;
fixing the configuration restores everything. Overview, workspace and document reads never read the policy and are
unaffected.
Local `baseRefs[].ref` values are always full refs `refs/heads/<branch>` (the contract schema requires it; remote refs
are never listed): the ref is the option's identity and the value a `target.baseRef` override sends, and
`<branch>` is its display name. Every other branch in create-options (`workspaces[].branch`,
`integrationTargetBranch`, `integrationDestination.branch`) is a short name. `defaultBaseRef` is the configured
value as written, one of: `HEAD`; a full commit SHA; `refs/heads/...` or `refs/tags/...`; or a short local branch
name without `/`, which designates `refs/heads/<name>` (so a short tag name such as `v1.0` is read as a branch). An existing dirty workspace may be selectable for Create but is
not an integration-selectable destination. All options are a snapshot, not a reservation.

Operation lookup returns `{operationId,kind:"specification-create",status:"in-progress"|"recovery-required",code?}`,
`{…,status:"failed",code}` or completed `CreatedSpec`. The status uses the SAME derivation as the operations list
(journal stage, then the live registry outcome, which keeps a failure for 60 minutes, else a journal idle for more
than 5 minutes without a live writer is `recovery-required` with `code: "OPERATION_INTERRUPTED"`), so the two never
disagree. It is read-only, never proves process liveness and initiates no recovery (there is no HTTP resume; see the
lifecycle document for the operator CLI `specs recover`). After timeout, reuse the **same** operation ID.

Async mode (`Prefer: respond-async`, RFC 7240): a client that cannot hold a request open for a
worktree create sends the request header `Prefer: respond-async` (a token in a comma-separated list,
case-insensitive, parameters such as `wait` are ignored). The Runtime validates and reserves the
operation, then answers **202 Accepted** while the work continues detached from the request:

```http
HTTP/1.1 202 Accepted
Location: /api/specs/create/operations/<operationId>
Preference-Applied: respond-async
Cache-Control: no-store
Vary: Prefer

{ "operationId": "<uuid>", "kind": "specification-create", "status": "in-progress" }
```

- 202 is sent once the operation is reserved and validated: a fresh run has left the internal
  reservation stage (Git availability and the reserved plan were checked), or the request replays
  work that is still running. Rejections up to that point are the usual synchronous 4xx/503
  (`BASE_REF_NOT_FOUND`, `BRANCH_ALREADY_EXISTS`, `CREATE_CONFLICT`, ...), never a 202.
- The outcome is read from the `Location` (the inspection endpoint) or watched on its `/events` stream.
  A failure after 202 is visible there (`failed` event with a code, `recovery-required`), not on the
  already finished request.
- Without an `operationId` in the body the Runtime generates one and returns it.
- Replay keeps the existing idempotent semantics: the same `operationId` and the same body returns
  the current state (202 while running, **201** with `CreatedSpec` when completed); a changed body is
  `CREATE_CONFLICT` (409).
- Without the header the behaviour is unchanged: the response is the synchronous **201**. A
  Runtime that does not know the header also answers 201, which a client must accept.
- Create work is never cancelled by a client disconnect, in sync or async mode: the handler is not
  bound to the request lifetime (regression test: abort during `POST /api/specs`, the journal still
  reaches `completed`).

Live progress: POST can take seconds to minutes, so a client that sends an `operationId` may also
watch `GET /api/specs/create/operations/:operationId/events`, the Create route of the shared operation
progress stream (see `reference.api.operation-progress`: events, the public step vocabulary
`reserving`, `preparing-workspace`, `writing-specification`, `committing-specification` (Git enabled only), `registering`, replay and the wait for
a not yet reserved operation). It requires the same `Create` capability, never exposes paths or
journal stages, and is optional: the POST result and the inspection above stay the source of truth,
and without SSE clients just poll the inspection.

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
Both Worktree Close and Specification Close requests (and their preview query strings) also accept
an optional `finishAfterExternalMerge: true` (#157, below).

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
or a (linked) Specification Close is person-initiated and never inferred from the merge facts: it
proves by content, not ancestry, that the destination already has everything the source branch
changed (the Specification's own canonical subtree(s) and every path the source branch's merge-base
diff names), then finishes through the same archive + CAS-rebind + worktree-disposal effects an
already-integrated Close uses — no new merge commit. A retry of the same `operationId` that flips
this field is `409 CLOSE_CONFLICT`, exactly like `integrateToTargetBranch`; it is `400 CLOSE_INVALID`
in the primary checkout or combined with an explicit `integrateToTargetBranch: false` (contradictory:
this mode reuses the integrated disposal path). On a mismatch, Close answers `409
CLOSE_EXTERNAL_MERGE_MISMATCH` with `paths` (at most 10 of the total): every path that is missing or
not yet content-equivalent in the destination, not just the first.

No operation silently completes tasks, invents Session state or retries uncertain Git effects.
