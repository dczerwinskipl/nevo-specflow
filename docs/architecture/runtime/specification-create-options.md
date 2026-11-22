---
id: architecture.runtime.specification-create-options
type: architecture
title: Specification Create options and admission invariants
status: current
scope: specflow
areas: [runtime, cli, security]
tags: [specification, create, worktree, authorization, git, admission]
read_when:
  - implementing or reviewing Create options and validation
  - reviewing Git-off, branch protection or invalid Git policy behavior
  - checking Create UI authorization and workspace consistency
summary: >-
  Create options are advisory snapshots, not reservations. Their workspace, branch and
  base-config facts, permission boundaries and Git policy behavior are revalidated on admission.
related:
  - architecture.runtime.specflow-lifecycle
  - reference.api.specflow-specification-operations
  - reference.api.workspaces
  - architecture.runtime.authorization
  - reference.configuration.specflow-git-worktrees
---

# Specification Create options and admission

The exact HTTP shape is the generated OpenAPI operations `getSpecsCreateOptions`,
`getSpecsArchetypes`, `postSpecs` and `getSpecsCreateOperationsByOperationId`.
[Specification lifecycle](specification-lifecycle.md) owns durable Create journals, effects and
recovery. Create options are advisory snapshots; the Engine revalidates the selected target on admission.

## Trusted choice and authorization

- `GET /api/specs/create-options` is a read-only **snapshot**, not a branch/workspace
  reservation. The Engine rechecks authorization, configuration and Git facts on mutation.
- The options route requires project-wide `spec.create` at `{}`. It exposes the **absolute**
  worktree root `worktreesRoot.path` to any Create-capable principal; this may include workstation
  usernames. `GET /api/workspaces` separately requires `workspace.view` and exposes each
  registered checkout's absolute path. Do not imply that `spec.create` alone grants access to
  the workspace list. A UI needing both sources must handle a `workspace.view` 403 separately.
- The options' `workspaces[]` entries join to `GET /api/workspaces` strictly by
  `workspaceId`. They contain Create-only selection facts, not the registry's `kind/name/path`.
  `specCount` counts **all** bound Specifications for the shared-workspace warning, whereas
  the list's `specifications[]` includes only Specifications visible through `spec.view`.
  A listed option missing from the separate workspace list is an inconsistent snapshot:
  do not select it, re-read both sources.
- The selected workspace's `state` and `reason` are advisory, not a lease. An unavailable
  checkout may still appear for explanation. `checkout-mismatch` is projected in Create options
  as `unavailable/checkout-unavailable`. A dirty checkout can be selectable for Create but is
  not automatically integration-selectable.

## Workspace, branch and base reference

- Omitted `target` means the primary checkout. `{kind:"existing",workspaceId}` uses a
  registered checkout. `{kind:"new-worktree",baseRef?,branch?,integrationTargetWorkspaceId?}`
  provisions a new managed worktree. This does not support a free-standing new branch without a
  worktree. An explicit integration target **pins** a verified destination, independently of
  `baseRef`; `baseRef` determines where the new branch starts, not where it eventually merges.
- `baseRefs[].ref` uses the full local ref `refs/heads/<branch>`. The branch names in
  `workspaces[].branch`, `integrationTargetBranch` and
  `integrationDestination.branch` are **short** names. Remote refs are never offered.
- `defaultBaseRef` is the configured value as written: `HEAD`, a commit SHA,
  `refs/heads/...`, `refs/tags/...` or a short local branch without a slash. The short name
  denotes a branch, even if it resembles a tag. `defaultBaseRef` need not be in `baseRefs[]`
  (it may be `HEAD`, tag or SHA); `defaultBaseConfig` inspects that effective configured base
  independently. A client selecting another usable base must send it explicitly.
- Each `baseRefs[].projectConfig` represents validation of **committed** `.nevo/config.yaml`
  bytes at that ref, not dirty checkout configuration. A base can be offered yet unusable with
  `missing`, `not-regular-file`, `invalid-yaml` or `runtime-missing`. The default base
  additionally supports `ref-not-found`. Unexpected Git read failures are errors, not an
  invented configuration verdict. Create repeats admission, including the race fallback
  `GIT_BASE_CONFIG_MISSING`.
- `branchPattern` is the effective policy (usually `feature/{slug}`, optional
  `{shortId}`). The root is the configured machine-local `git.worktreesRoot` or the
  `<repo>-worktrees` default; `worktreesRoot.exists` says whether it is already on disk.
- A protected/unallowed branch remains listed with `selectable:false` and its reason; this
  does not itself change the workspace's `available/dirty` state or integration eligibility.
  `newWorktree.branchProtected:true` is an advisory signal to choose another generated name,
  not proof of acceptance for the user's final name.

## Git capability, policy and admission

- `commits` exists **exactly when Git is enabled**, including an empty
  `protectedBranches` list; it is absent when Git is disabled. Without Git, there is no
  protected/allowed branch policy in Create options, and the scaffold may remain uncommitted.
- An invalid project Git section does not make `GET create-options` fail: return 200 with
  the safely derivable workspace registry, mark Git-dependent choice unavailable
  (`git-policy-invalid`), empty `baseRefs`, no `commits`, and an advisory default
  `branchPattern/defaultBaseRef/worktreesRoot`. Do not invoke Git to guess missing facts.
  An unavailable checkout keeps its more direct `checkout-unavailable` reason. A local
  `git.worktreesRoot` inside the repository or `.git` similarly disables new worktree
  availability and shows the safe default folder.
- **Create and lifecycle mutations still fail closed** with `503 GIT_POLICY_INVALID` on
  invalid policy, even when Create options is 200: they need a trustworthy policy to decide
  whether to commit. Reads of Overview, Workspace and documents do not depend on Git policy.
- Success with Git off can indicate `uncommitted:true`: the files exist but have not been
  committed. A later Close with Git on may then refuse uncommitted changes. A Git-off Close
  archives in place and also does not create a commit.
- HTTP Create has a 2 MiB body admission limit; document and path limits are enforced by the
  Engine. The catalogue revision and archetype version must be current for a **new** operation;
  replay of an already-known idempotent operation returns its recorded outcome instead of
  treating a later catalogue change as a new request.

## Client retry and observation

- `POST /api/specs` uses the same `operationId` for an uncertain retry. The same operation
  identity and unchanged request replays; conflicting input yields `409 CREATE_CONFLICT`.
  A supplied slug is part of the fingerprint; omitted vs explicit overrides are not conflated.
- `Prefer: respond-async` requests asynchronous admission. A successful **202** is sent only
  after validation/reservation; the work survives client disconnect, and completion/failure is
  observed through the `Location` inspection route or optional SSE. Without the preference,
  a successful request normally answers **201**. Clients must handle either status.
- Inspection is a **read-only** public projection: it must not reveal Git paths, internal journal
  stages or raw errors. It cannot prove process liveness and must never initiate recovery.
  A failure remembered in the in-process progress registry may disappear after restart while
  the journal continues to require recovery. An idle journal may project
  `recovery-required/OPERATION_INTERRUPTED`. There is no HTTP recovery mutation; operator
  action is documented in [Git recovery](../../engineering/shared/specflow-git-recovery.md).
- Progress SSE is only display aid. The operation request and inspection remain the source of
  truth; absence or failure of SSE is not an operation failure.
