---
id: product.specflow.specification-creation
type: product
title: Create Specification and select its workspace
status: current
scope: specflow
areas: [ui, workflow]
read_when:
  - designing the Create Specification screen
  - describing branch defaults, target selection or uncertain responses
summary: >
  User-facing E2 Create choices and recovery wording without inferred future Git or
  workflow behavior.
related:
  - reference.api.specflow-specification-operations
  - architecture.runtime.specflow-lifecycle
---

# Create Specification and select its workspace

## User choices

Creating a Specification requires a title (maximum 200 characters at HTTP). The three placement
choices are: **Current project checkout** (primary), **Existing workspace**, or **New workspace**
(managed Git worktree when available). A field being optional in the API does not itself mandate
a corresponding visible control in UI.

Display branch, Spec count and availability from `create-options`. Disabled and detached
workspaces cannot be selected. A dirty existing checkout can still be suitable for adding another
Spec, while future integration requires an eligible clean attached destination. A missing branch
name gets neutral fallback copy and workspace ID, never an invented filesystem path or branch.

For a new workspace, **Start from** is the source commit/ref; **Merge into** is a separate
decision. The project's default `baseRef` can be `HEAD`, a full SHA or tag, not necessarily
a local branch listed in `baseRefs[]`. Leaving a value untouched omits its request override;
explicit user selection sends it. A custom merge destination pins a verified registered
workspace's checked-out branch and incarnation. Explicitly selecting primary differs from
following the configured default if primary currently uses another branch.

Final generated slug, branch and worktree location belong to Engine. The UI MUST NOT show
a guessed final branch or promise that later integration will succeed.

## Submission and uncertainty

Keep one client-generated UUID `operationId` and its immutable payload per submission.
On transport timeout or unknown result, inspect the same operation via
`GET /api/specs/create/operations/:operationId` rather than submitting a fresh Create.
A prolonged `in-progress` state does not prove the worker is alive; offer a recovery path
instead of endless animation or unsafe automatic retries. After completion navigate by the
canonical `specId`, not by a potentially stale worktree path.

After a shared-worktree Spec archive, sibling Specs and their workspace remain unchanged.
Integrating the whole branch and removing that workspace is a separate explicitly previewed
Workspace Close action. Neither Create nor Close automatically runs E3–E5 workflow/provider steps.
