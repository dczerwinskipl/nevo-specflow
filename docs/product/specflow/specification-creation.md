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

**Merge into** names a **workspace** (the contract's `integrationTargetWorkspaceId` is a workspace
pin; the default is the primary workspace on the project's integration target branch): show the
workspace as the primary text and its branch as a secondary branch chip. **Start from** and
**Branch name** are branches. The collapsed "default settings" summary is one definition list with
exactly three rows (Start from, Merge into, Branch name), and every branch in the section uses one
shared presentational piece (`BranchRef`: one icon size, the `code-md` token, no parenthesised or
colon variants). A caveat about the default merge target (for example uncommitted changes in the
primary workspace) is a quiet inline note on the Merge row; it never blocks Create.

Each optional setting (Start from, Merge into, slug, branch name) is switched on with the
**effective default prefilled** (current branch of the folder, the default target workspace, the
slug derived from the name and the generated branch), so the user only adjusts it. An untouched
or default-equal value is never sent as an override (an explicit merge target would become an
immutable pin, omission follows the project); only a value that differs is. Switching a setting
off restores the default.

The optional `slug` names the Specification folder, the worktree folder and the generated branch
(`branchPattern` with `{slug}`). It is lowercase kebab-case ASCII (at most 80 characters, the
rule the Engine uses for derived slugs, shared as `deriveSpecSlug`/`specSlugProblem` in
`@nevo/specflow-contracts/specs`). The UI previews the slug live from the name until the user
edits it and validates a typed one inline; a taken slug answers `CREATE_CONFLICT` and is shown at
the field. The final branch and worktree location still belong to Engine: the UI shows only a
**preview** built from `branchPattern` and the slug, where the random `{shortId}` is written as
`<id>`, and it never promises that later integration will succeed.

**Goal** is sent as `goal`, persisted in the Create journal and written to the Specification
overview scaffold; the app does not display it yet, and the field's help text says so.

Create options are a snapshot of Git state, so the Create screen treats only options fetched
since the screen was entered as current: while they load it shows the loading state of the
workspace section instead of options cached from an earlier visit.

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
