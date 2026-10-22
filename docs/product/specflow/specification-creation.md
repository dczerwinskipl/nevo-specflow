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
  - reference.api.operation-progress
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

**Uncommitted changes in a merge target.** Creating the specification is not affected. What it
affects is closing/integrating the specification into that workspace later: the Engine refuses to
integrate into a checkout with uncommitted changes (untracked files included) so as not to touch
the owner's work. The copy says exactly that in plain words and gives the action: _"This workspace
has uncommitted changes. You can still create the specification; commit or stash them before
merging into it."_ The same fact reads consistently everywhere the reason appears for a merge
target (the Merge row note, the unavailable item in the target select, the "unavailable as a
target" list, the merge-back suggestion, and the progress page's settings); there is no vague "not
available now" wording, and it stays a quiet inline note, never an alert.

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
**preview** built from `branchPattern` and the slug (the default `feature/{slug}` previews exactly
as `feature/<slug>`; only a pattern containing the optional `{shortId}` shows it as `<id>`), and it never promises that later integration will succeed.

**Goal** is sent as `goal`, persisted in the Create journal and written to the Specification
overview scaffold; the app does not display it yet, and the field's help text says so. The scaffold marks the
section with a comment under `## Goal` telling an agent that it is the initial goal from creation
and may be refined or rewritten freely.

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

The project Create flow submits in async mode (`Prefer: respond-async`, see
`reference.api.specflow-specification-operations`): the Runtime reserves the operation and answers
202 at once, and the progress page (below) shows the operation as running while the work continues on
the server. It then subscribes to the progress stream (best effort) and reads the inspection endpoint to learn
the outcome: right away when the stream reports its end, with a slow safety-net poll while the
stream is healthy, and with the regular backoff (3 s for the first minute, then 10 s, 10 minutes
at most) when the stream is lost or unsupported. A reload resumes the same operation from session
storage. The page navigates on the inspection result, never on the stream alone. A Runtime that
ignores the preference answers 201 synchronously, which completes the flow as before.

After a shared-worktree Spec archive, sibling Specs and their workspace remain unchanged.
Integrating the whole branch and removing that workspace is a separate explicitly previewed
Workspace Close action. Neither Create nor Close automatically runs E3–E5 workflow/provider steps.

## The progress page

Submitting the form does not draw anything under the form: it stores the request and what was
entered, and continues on a dedicated page, `/specs/new/creating/:operationId` (bookmarkable and
safe to reload). The page sends the request when the server has not seen it, follows the operation
and tells the owner clearly what is going on:

- ONE heading carries the state and the typed name: **Creating specification: \<name\>**, then
  **Specification created: \<name\>**, **Specification was not created: \<name\>** and **Result not
  confirmed yet: \<name\>** (the name is an interpolated value of the localised heading, never a
  separate line under it). A long name wraps (clamped to three lines, no sideways scroll at 320 px)
  and the full name stays in the heading's tooltip. Without a known name (a direct link) the heading
  has no name. Focus moves to the heading on arrival.
- Under it a description list states the **actual settings** of this creation in the words of the
  form's workspace summary (the same rows and branch/workspace references): _Where_ (in a new
  workspace; added to workspace NAME with its branch; added to the current folder with its branch),
  and for a new workspace _Branch name_, _Start from_, _Worktree folder_ (from the create-options
  `worktreesRoot`) and _Merge into_ (workspace and branch); then the explicit slug and, shortened,
  the goal if the owner entered one. The values come from the retained request and from the facts
  the form saved with the draft from the create-options it showed (workspace names, branches,
  folder), never from server text. A value that is not known (a direct link, a lost draft) has no
  row; nothing is guessed. The merge target row carries the quiet uncommitted-changes note below
  when it applies.
- Under it the step checklist (next section), a status line (`Preparing your specification.`,
  after a while `Still working — this can take a minute.`, in neutral colour) and a note that the
  owner can leave: creation continues on the server and is resumed from **New specification**.
- **Done**: the heading becomes **Specification created**, every step is checked, and the
  specification opens by itself after a moment; **Open specification** opens it at once.
- **Refused before anything was done** (a taken branch, stale options, a refused name): the failure
  explanation of the form and **Back to form**, which returns to Create with the name, goal and
  workspace choice as they were entered (kept in session storage, not in the URL); a refused field
  is flagged again there. The remedies of the explanation return to the form with that change made.
- **Outcome unknown** (the answer was lost, the operation needs recovery): the same explanation and
  a single **Check the result** / **Check operation status** action for the same operation, never a
  second create and no way back to the form to start another.
- **Opened without a stored request** (a direct link, cleared storage): the page asks the server and
  shows what it knows (running: the steps without a title; finished: the specification opens;
  failed: the explanation). An operation the server has no record of is shown calmly as
  **Operation not found**, with a way back to Create; nothing is sent.

Opening Create while an unfinished operation is stored continues on its page instead of offering a
second create. Leaving the page never blocks.

## Live progress while creating

Creating a workspace can take from a few seconds to minutes, so the progress page shows a calm
checklist of named steps: the running step has a spinner, finished steps a check, steps that
follow stay muted. The steps are the public
vocabulary of the operation, not Git or journal internals:

| Step                    | Shown as (en)                   | Shown when         |
| ----------------------- | ------------------------------- | ------------------ |
| `reserving`             | Reserving the name              | always             |
| `preparing-workspace`   | Preparing the workspace         | new workspace only |
| `writing-specification` | Writing the specification files | always             |
| `registering`           | Registering the workspace       | always             |

A step that does not apply (the workspace step for the current or an existing workspace) is not
drawn. Rows are reserved from the moment the page opens, so it does not jump when the first
step arrives. The checklist is read by assistive technology through a polite live region and each
row also says its state in text.

Progress is best effort. If the live stream cannot be opened, drops or is unsupported, nothing is
shown or announced and the page carries on with its own monitoring: a calm "we are watching the
operation" note and the inspection polling decide the outcome. The stream never fails or delays a Create. The
mechanism is generic (`reference.api.operation-progress`) and is reused by other long-running
operations.

## Workspace names and worktree folder

Every workspace in create-options has a `name` (checkout folder; the primary checkout uses the
repository folder) and a `path`; the UI shows the name instead of a generic "Current folder" or
"Workspace" label wherever a workspace is referred to. The new-workspace summary shows the effective
`worktreesRoot` as a read-only "Worktree folder" row, with a quiet note when it does not exist yet.

## Overview right after Create in project mode

A Runtime that answers the workspace read with `unavailable` / `not_implemented` sections shows a
calm "Not available in this Runtime yet" state (no warning tone, no Retry). Actions that cannot work
there, such as "Start conversation", are hidden instead of shown disabled. Demo mode is unchanged.
