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
The Create result exposes no absolute checkout paths; create-options do (see `path` and `worktreesRoot` below).
**Workspace path exposure (decision).** `GET /api/specs/create-options` returns the absolute checkout path of every
registered workspace and the worktree folder to every principal that holds the `Create` capability (scope `{}`): the
Create dialog needs them to explain where a spec lands. The Runtime does not hide them behind a separate capability,
so a Create-capable role can read the workstation directory layout (including user names inside paths); grant `Create`
only to roles that may see it. Restricting `path`/`worktreesRoot` to an operator capability is a follow-up.

Create options include `primaryWorkspaceId`, `workspaces[]` (`workspaceId,kind,name,path,managed,specCount,
state,selectable,integrationSelectable,branch?,reason?,integrationDestination?`),
`newWorktree` (`status,reason?,branchProtected?`), `defaultBaseRef`, `branchPattern`, `worktreesRoot`, `integrationTargetBranch?`, `commits?`, `baseRefs[]`.
`commits` is `{protectedBranches[],allowedBranches?[]}` and is present **exactly when Git is enabled** (the
Engine then commits the scaffold), even with empty lists; it is absent when Git is disabled, as are the two
reasons `branch-protected` and `branch-not-allowed` and `newWorktree.branchProtected`. A workspace whose branch
is protected or not allowed stays listed with `selectable:false` and that `reason` (its `state` is still
`available`/`dirty`, `branch` names the branch); `integrationSelectable` is unaffected. `newWorktree.branchProtected: true`
means the branch the pattern generates for a representative name is protected: the tile stays selectable, but
the user has to type another branch name (advisory; the Engine decides on the real name).
`name` is the display label of a checkout (its folder name; for the primary checkout the repository
folder) and `path` its registered display path. `branchPattern` is the effective pattern (default
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
Local `baseRefs[].ref` values are `refs/heads/...`; project default may instead be
`HEAD`, a SHA or a tag. An existing dirty workspace may be selectable for Create but is
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
| POST | `/api/specs/:specId/close`                                   | Archive/optional integrate                |
| GET  | `/api/specs/:specId/worktree/close/preview`                  | Exclusive Worktree Close preview          |
| POST | `/api/specs/:specId/worktree/close`                          | Exclusive Worktree Close                  |
| GET  | `/api/specs/:specId/close/operations/:operationId`           | Inspect Spec Close                        |
| GET  | `/api/workspaces/:workspaceId/close/preview`                 | Preview **every** canonical occupant      |
| POST | `/api/workspaces/:workspaceId/close`                         | Whole-branch integration and group rebind |
| GET  | `/api/workspaces/:workspaceId/close/operations/:operationId` | Inspect Workspace Close                   |

Mutating Close requests include UUID `operationId`; Specification Close optionally sends
`integrateToTargetBranch:false` for archive-only. Completed results use 200; unsettled use 202.
Spec-scoped Close requires the appropriate Spec capability and whole-branch integration also
needs project-wide Git `Integrate`. Workspace Close requires project-wide Git
`CloseWorkspace` **and** `Integrate` before revealing occupants/journals.
Shared spec-scoped integration refuses with 409 `CLOSE_SHARED_WORKTREE`.
Close and integration first flush the document commit queue of the affected checkouts and refuse with 409
`DOCUMENT_COMMITS_PENDING` (`details.cause` `commit-pending`, `commit-failed` or `commit-uncommitted`) while document
commits remain; the precedence and the preview behaviour are defined in
[Specification documents](specification-documents.md).
Error status and exact DTO variants are defined in the schema and Runtime endpoint.

No operation silently completes tasks, invents Session state or retries uncertain Git effects.
