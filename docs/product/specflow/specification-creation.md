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
target" list, and the merge-back suggestion); there is no vague "not
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
and tells the owner clearly what is going on. **Progress is the primary content**; the
configuration is a compact secondary summary below it. The page is a focused single-task page in
the narrow readable column (`w-content-narrow`, centred), stacked vertically, and works from 320 px.

From top to bottom:

1. **Status header.** A status tile (`OperationStatusTile`: a turning spinner while it runs, a
   static icon otherwise; the spinner stops under `prefers-reduced-motion`) next to ONE heading
   that carries the state and the typed name: **Creating \<name\>**, then **Specification
   created: \<name\>**, **Specification was not created: \<name\>** and **Result not confirmed
   yet: \<name\>** (the name is an interpolated value of the localised heading, never a separate
   line). A long name wraps (clamped to three lines, no sideways scroll at 320 px) and the full name
   stays in the tooltip. Without a known name (a direct link) the heading has no name. Focus moves
   to the heading on arrival. Under the heading one live status line says what is happening now:
   _Preparing a new workspace and the specification._ (new workspace) or _Preparing the
   specification._, after a while _Still working — this can take a minute._, and when the request
   was refused before anything was done, what was **not** created.
2. **Steps** (next section): each with a title and one line, in user language.
3. **Configuration** (a heading and a compact description list in the words of the form's
   workspace summary): _Where_ (in a new workspace; added to workspace NAME with its branch; added
   to the current folder with its branch), and for a new workspace _Branch name_, _Start from_ and
   _Merge into_ (workspace and branch), then, shortened to two lines, the goal if one was entered.
   The values come from the retained request and from the facts the form saved with the draft
   (workspace names, branches), never from server text; a value that is not known (a direct link, a
   lost draft) has no row; nothing is guessed. The "merge target has uncommitted changes" caveat is
   **not** shown here: it stays in the form, next to the integration-target choice.
4. **Technical details**, a closed `Collapsible`: the worktree folder (absolute path, from the
   create-options `worktreesRoot`), the explicit slug and the operation id. These matter only for
   diagnosing or finding things on disk and are not part of the summary.
5. A quiet note that the owner can leave (creation continues on the server; its status is
   available from the specification list) and the secondary **Back to specifications** button
   (also in the refused, unknown and not-found states).

Lifecycle states keep their semantics:

- **In progress**: as above; the leave note and **Back to specifications** are shown.
- **Done**: the heading becomes **Specification created**, every step is checked, and the
  specification opens by itself after a moment; **Open specification** opens it at once.
- **Refused before anything was done** (a taken branch, invalid name, stale options, a refused
  name, offline): the failure explanation of the form, the plain statement **Nothing was created**
  (only for the codes where that is certain; a failure the server concluded without a result does
  not claim it) and **Back to form**, which returns to Create with the name, goal and workspace
  choice as they were entered (kept in session storage, not in the URL); a refused field is
  flagged again there. The remedies of the explanation return to the form with that change made.
- **Outcome unknown / recovery required**: a separate calm state with the same explanation and a
  single **Check the result** / **Check operation status** action for the same operation, never a
  second create and no way back to the form to start another.
- **Opened without a stored request** (a direct link, cleared storage; a reload is the same): the
  page asks the server by `operationId` and shows what it knows (running: the steps without a
  title; finished: the specification opens; failed: the explanation), never a duplicate. An
  operation the server has no record of is shown calmly as **Operation not found**, with a way back
  to Create; nothing is sent.

### Way back from elsewhere

While a Create is unfinished, the specification list (current collection) shows one quiet row
above the list: **Creating \<name\>… (in progress)**, linking to the progress page of the
operation. It is derived from the client-side operation ledger (the stored request in
`sessionStorage`, `useUnfinishedCreate`); no endpoint is involved. It disappears when the
operation completes, is refused or is released, and is not shown in the archive. It is read when
the list opens, so a Create that finished on the server while the owner was away is reconciled when
the owner follows the row back to its page. Opening Create while an unfinished operation is stored
continues on its page instead of offering a second create. Leaving the page never blocks.

## Live progress while creating

Creating a workspace can take from a few seconds to minutes, so the progress page shows a calm
checklist of named steps: the running step has a spinner and is emphasised, finished steps a check,
steps that follow stay muted ("Waiting for previous step"). Each step has a title and one line that
depends on its state. The steps are the public vocabulary of the operation, not Git or journal
internals:

| Step                    | Title (en)                 | Running                                    | Done                        | Shown when         |
| ----------------------- | -------------------------- | ------------------------------------------ | --------------------------- | ------------------ |
| `reserving`             | Reserving the name         | Checking that the name and branch are free | Name and branch reserved    | always             |
| `preparing-workspace`   | Preparing the workspace    | Creating the working environment           | Workspace ready             | new workspace only |
| `writing-specification` | Creating the specification | Writing the specification files            | Specification files written | always             |
| `registering`           | Finishing setup            | Registering the new specification          | Specification registered    | always             |

A step that does not apply (a skipped step: the workspace step for the current or an existing
workspace) is not drawn. A step id this build does not know (a newer Runtime) is drawn generically
("Next step") instead of being hidden. The copy lives in one record in `createProgress.ts`
(`Record<SpecificationCreateStep, …>`): a new public step, for example
`committing-specification`, is one entry there plus its three catalogue keys
(`create.progress.steps.<id>.title|running|done`).

The checklist reflects only what the stream or inspection reported. **No steps are simulated and
there are no percentages**: until the first snapshot, or when no live stream is available, the page
shows ONE neutral running row, **Creating specification**, with a calm line (when the stream is
unavailable: the live steps are unavailable and the operation is being checked). The checklist is
read by assistive technology through a polite live region and each row also says its state in text.

Progress is best effort. If the live stream cannot be opened, drops or is unsupported, nothing is
shown or announced beyond that neutral row and the page carries on with its own monitoring: the
inspection polling decides the outcome. The stream never fails or delays a Create. The
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
