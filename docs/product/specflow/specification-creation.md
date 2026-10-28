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

The **Create** action and the one reason it is unavailable (or the note about what Create does)
stay visible at the bottom of the screen at every width; only the form above them scrolls. What
went wrong after a submit is explained at the end of the form, above that action.

Display branch, Spec count and availability from `create-options`. Disabled, detached and
(Git enabled) protected-branch workspaces cannot be selected. A dirty existing checkout can still be suitable for adding another
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
overview scaffold. The progress page shows it shortened (the first 160 characters, as one line of
text) and the field's help text says so; the full goal stays in the overview. The scaffold marks the
section with a comment under `## Goal` telling an agent that it is the initial goal from creation
and may be refined or rewritten freely.

## Commit and protected branches (Git enabled only)

Everything in this section applies **only when `create-options` carries `commits`**, which the
Runtime sends exactly when Git is enabled for the project. Without it the screens, the progress
steps and the copy are exactly those of a project with Git off: no Commit row, no committing step,
no protection text, no protected-branch reasons. (`commits` lists the protected and allowed
patterns for display; the per-workspace decision is in each workspace's `selectable` and
`reason`.)

When Git is enabled the Engine commits the new Specification's files (the scaffold) on the branch
where they are created, and it never commits on a branch the project protects
(`git.commits.protectedBranches`, optionally narrowed by `allowedBranches`; see
`reference.configuration.specflow-git-worktrees`). The UI says so before submit and never in server
text:

- **Tiles and pickers.** A workspace whose branch is protected (`reason: branch-protected`) or not on
  the allowed list (`branch-not-allowed`) is disabled with a plain-language reason that names the
  branch, for example _"The branch master is protected: Nevo does not commit there. Create the
  specification in a new workspace."_ This covers the **Current folder** tile (the tile's visible
  description is the reason, never the default tile while it is blocked) and the individual
  workspaces in the **Existing workspace** picker; when every linked workspace with a branch is
  protected the whole tile says _"All other workspaces are on protected branches. Create the
  specification in a new workspace."_ While another tile is active and **New workspace** is
  available, a quiet note offers a one-click **Use New workspace**. A protected branch can still be
  a merge target (it is not evaluated), so the merge-target logic and its muted dirty note are
  unchanged.
- **Generated or typed branch name.** `newWorktree.branchProtected: true` means the branch the
  pattern generates is protected. The tile stays selectable, the generated branch row states
  _"The generated branch X is protected: Nevo does not commit there. Use your own branch name."_ and
  Create stays unavailable (the footer prerequisite names the same problem) until the owner types a
  branch name of their own. A typed branch name is checked in the browser with the contracts rule
  (`engineCommitRefusal`, the exact predicate the Engine uses) and a protected or not-allowed name is
  a field-level error _before_ submit. The server remains authoritative.
- **Invalid Git configuration.** `newWorktree.reason: git-policy-invalid` disables only the
  **New workspace** tile, calmly: _"The project's Git configuration is invalid. Check
  .nevo/config.yaml."_ Current folder and Existing workspace keep working.
- **Commit row.** The new-workspace summary has a **Commit** row, and the current-folder and
  existing-workspace summaries a quiet line: _"The specification files will be committed to branch
  X."_ The progress page lists it (_Commit_: the branch) among its **Technical details**, not in
  the configuration summary, from facts the form saved with the draft.

### Errors (code to copy; server text is never shown)

| Code (HTTP)              | Meaning                                                              | What the UI says and does                                                                                                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BRANCH_PROTECTED` (422) | The Engine will not commit on this branch. **Nothing was created.**  | Alert _"The branch is protected"_ plus the explanation for what was sent: a typed branch name is flagged at its field; a generated name offers **Enter your own name**; a chosen workspace offers **Refresh options** (which then shows the disabled reason). The form is kept. |
| `COMMIT_BLOCKED` (409)   | The checkout cannot take a commit now. **Nothing was created.**      | Alert _"Git cannot take a commit right now"_: a merge or rebase may be in progress, no branch is checked out, or Git has the index locked; finish or abort it and try again. The form is kept and can be submitted again.                                                       |
| `COMMIT_FAILED` (503)    | The files **were written** but the commit failed. Recovery required. | Calm recovery alert _"The specification files were created but could not be committed"_: the specification is not registered yet, do not create it again, ask the project operator to resume the operation or to commit the new files, then check the operation again.          |

`COMMIT_FAILED` is the existing recovery-required state with its own copy: the form locks, the
only action is a check of the **same** operation (never a fresh create, never a blind retry), and
the progress page says the files exist, so it never shows the "Nothing was created" line. The page
shows that line only for refusals that changed nothing (`BRANCH_PROTECTED`, `COMMIT_BLOCKED` and the
other not-applied codes). A later check that reads `recovery-required` without a code keeps the
generic recovery copy.

Some codes can also be raised after the Runtime reserved the operation, when the journal, the files
or a commit may already exist: `CONTROL_LOCK_BUSY`, `REGISTRY_CONFLICT`, `GIT_POLICY_INVALID` and
`WORKTREE_PATH_CONFLICT`. The UI treats them as an **unknown outcome** (never "Nothing was
created"): the form keeps the stored operation and offers **Check the result** for the same
operation, which tells whether anything was created. Only codes that are always raised before the
reservation (validation and preconditions) declare that nothing was changed.

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
at most) when the stream is lost or unsupported. A reload of the progress page resumes the same operation (by its id, from session
storage, or from the server alone). The page navigates on the inspection result, never on the stream alone. A Runtime that
ignores the preference answers 201 synchronously, which completes the flow as before.

After a shared-worktree Spec archive, sibling Specs and their workspace remain unchanged.
Integrating the whole branch and removing that workspace is a separate explicitly previewed
Workspace Close action. Neither Create nor Close automatically runs E3–E5 workflow/provider steps.

## The progress page

Submitting the form does not draw anything under the form: it stores the request and what was
entered, and continues on a dedicated page, `/specs/new/creating/:operationId` (bookmarkable and
safe to reload). The page sends the request when the server has not seen it, follows the operation
and tells the owner clearly what is going on. **Progress is the primary content**; the
configuration is a compact secondary summary below it. The page is a focused single-task page,
stacked vertically, and works from 320 px. It has the same content width and alignment as the form
(one focused column of about 880 px, the `content-form` width, centred; narrower screens fill the
workspace), so the layout does not jump on submit.

From top to bottom:

1. **Status header.** A static status tile (`OperationStatusTile` with `animated={false}`: a
   specification icon while it runs, a check, alert or info icon afterwards; it never spins, because
   the active step of the checklist carries the page's **only spinner**) next to ONE heading
   that carries the state and the typed name: **Creating \<name\>**, then **Specification
   created: \<name\>**, **Specification was not created: \<name\>** and **Result not confirmed
   yet: \<name\>** (the name is an interpolated value of the localised heading, never a separate
   line). A long name wraps (clamped to three lines, no sideways scroll at 320 px) and the full name
   stays in the tooltip. Without a known name (a direct link) the heading has no name. Focus moves
   to the heading on arrival. Under the heading one live status line says what is happening now: **the name of the running
   step** (for example _Preparing the workspace_), never a generic line next to a concrete step.
   Only while no step is known does the generic line stay (_Sending the request…_, _Reading the
   operation…_, _Preparing the specification._); after a while it reads _Still working — this can
   take a minute._, and when the request was refused before anything was done it says what was
   **not** created.
2. **Steps** (next section): each with a title and one line, in user language.
3. **Configuration** (a heading and a compact description list in the words of the form's
   workspace summary): _Where_ (in a new workspace; added to workspace NAME with its branch; added
   to the current folder with its branch), and for a new workspace _Branch name_, _Start from_ and
   _Merge into_ (workspace and branch), then, shortened to two lines, the goal if one was entered.
   The **Commit** is not here: it is system behaviour, not a choice (see Technical details).
   The values come from the retained request and from the facts the form saved with the draft
   (workspace names, branches), never from server text; a value that is not known (a direct link, a
   lost draft) has no row; nothing is guessed. The "merge target has uncommitted changes" caveat is
   **not** shown here: it stays in the form, next to the integration-target choice.
4. **Technical details**, a closed `Collapsible`: the worktree folder (absolute path, from the
   create-options `worktreesRoot`), the explicit slug, the **Commit** (the branch the Engine
   commits the scaffold to; Git enabled only) and the operation id. These matter only for
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
  choice as they were entered (kept in session storage per operation; the URL carries only the
  operation id, `?draft=<operationId>`, never the values); a refused field is flagged again
  there. Only this explicit path restores a draft. The remedies of the explanation return to the form with that change made.
- **Outcome unknown / recovery required**: a separate calm state with the same explanation and a
  single **Check the result** / **Check operation status** action for the same operation, never a
  second create and no way back to the form to start another.
- **Opened without a stored request** (a direct link, cleared storage; a reload is the same): the
  page asks the server by `operationId` and shows what it knows (running: the steps without a
  title; finished: the specification opens; failed: the explanation), never a duplicate. An
  operation the server has no record of is shown calmly as **Operation not found**, with a way back
  to Create; nothing is sent.

### Way back from elsewhere: the operations panel

While a Create is running, needs a check, failed or finished moments ago, the specification list
(current collection, not the archive) shows a **Background operations** panel above the table. It
is drawn only from the Runtime's operation list, never from client storage, so a Create started in
another tab, another browser or the CLI shows up as well. The panel only informs: it shows
**create** operations (no other kinds), no diagnostics, and offers no resume or scheduling.

- **Absent when empty** and while the first read is pending (the table owns loading); **always
  open** when there is something to show. It is information, not a control: there is no collapse
  button and no collapsed state. A Runtime
  that does not serve the list (404/403) shows nothing and no error. A failed first read is one
  compact notice with **Retry**; a failed refresh keeps the rows and adds "Cannot refresh.
  Retrying".
- **One container, plain rows.** The panel is ONE bordered container: a header (the title and a
  summary such as "1 running, 1 needs attention") over rows separated by dividers. A row has no
  card, border or background of its own, so there is no card inside a card.
- **Rows**: a status icon, the **name of the specification** (the title the operation was started
  with; the generic kind label only when the name is unknown) and ONE meta line, _step · time_
  ("Step 2 of 4: Preparing the workspace · Started 2 minutes ago", counted without skipped steps).
  There are no kind, branch or extra badges. The whole row is one link to the operation's progress
  page (`/specs/new/creating/<operationId>`) with **no trailing arrow**; hover and focus tint the
  whole row. Five rows are shown; **Show all (N)** (a real disclosure) expands the rest inline,
  "Showing N of M" says when the server cut the list. At 320 px a row wraps onto lines; touch
  targets stay at least 44 px.
- **Needs a check** (`recovery-required`): the row says **Check result** and, for a run with no
  activity (`OPERATION_INTERRUPTED`), "No activity for N min. Check the result". It never says
  "failed" and offers no retry; it cannot be hidden.
- **Failed** rows stay for 60 minutes in the Runtime's memory (after a Runtime restart they read
  "needs a check" instead). **Completed** rows leave after 10 minutes. Failed and completed rows
  can be hidden for the session (in memory only; a reload brings them back).
- **Updates**: the list is read every 3 s while something runs and every 15 s otherwise, not at all
  in a hidden tab, again when the tab or window gets focus, and with a 3 to 60 s backoff while reads
  fail. When a row completes, the specification list and the Create options refresh by themselves.
- **Accessibility**: the list is not a live region; a separate polite status announces only status
  changes ("<name> is done", "<name> needs a check"), never step changes.
- **Visibility** follows the specification: anyone who can view the specification sees its
  operations (the journal records no initiator).
- An unknown kind, status or step id (a newer Runtime) is drawn as a generic row without a link.

The way back no longer depends on the tab's own memory: `sessionStorage` keeps, per operation id,
only the form draft and the request being resumed on that operation's progress page. **New
specification** always opens an empty form with a new operation: it never resumes or redirects to
an earlier operation. An operation still running is reached from the operations panel (or its own
page URL) and continues on the server whatever the user does; starting another one meanwhile does
not affect it. The stored entry is cleared when the operation concludes. Leaving the page never
blocks.

#### API contract

The panel renders `OperationListResponse` from `@nevo/specflow-contracts/operations`
(`GET /api/specs/operations` on a project Runtime, `GET /api/demo/specifications/operations` on the
demo Runtime; query `status` as a comma-separated filter and `limit` 1 to 50). The endpoint ships
with the Runtime (`docs/reference/api/specs-operations-list.md`); a 404 or 403 from an older Runtime or
without the capability simply leaves the panel hidden. See `engineering.shared.operation-progress`.

## Live progress while creating

Creating a workspace can take from a few seconds to minutes, so the progress page shows a calm
checklist of named steps: the running step has the page's only spinner and is emphasised,
finished steps a check, steps that follow stay muted (grey title, **no description line**, no
repeated "waiting" text). A running or finished step has one line that depends on its state. The steps are the public vocabulary of the operation, not Git or journal
internals:

| Step                       | Title (en)                      | Running                                    | Done                             | Shown when                                  |
| -------------------------- | ------------------------------- | ------------------------------------------ | -------------------------------- | ------------------------------------------- |
| `reserving`                | Reserving the name              | Checking that the name and branch are free | Name and branch reserved         | always                                      |
| `preparing-workspace`      | Preparing the workspace         | Creating the working environment           | Workspace ready                  | new workspace only                          |
| `writing-specification`    | Creating the specification      | Writing the specification files            | Specification files written      | always                                      |
| `committing-specification` | Saving the specification in Git | Committing the specification files         | Specification files saved in Git | Git enabled only (`commits` in the options) |
| `registering`              | Finishing setup                 | Registering the new specification          | Specification registered         | always                                      |

These five ids are exactly the public step vocabulary of the `specification-create` kind
(`SPECIFICATION_CREATE_STEPS` in `@nevo/specflow-contracts/operations`, mapped from the Engine's
journal in `step-mapping.ts`); the page adds none of its own and never draws a step the Runtime did
not report. The Runtime omits `preparing-workspace` for an existing or current workspace and
`committing-specification` when Git is off, so those rows never appear.

A step that does not apply (a skipped step: the workspace step for the current or an existing
workspace) is not drawn. A step id this build does not know (a newer Runtime) is drawn generically
("Next step") instead of being hidden. The copy lives in one record in `createProgress.ts`
(`Record<SpecificationCreateStep, …>`): a new public step is one entry there plus its three
catalogue keys (`create.progress.steps.<id>.title|running|done`). `committing-specification` is
listed by the Runtime only for a Git-enabled project; a finished Create redraws it only when the
form's facts say the Engine commits.

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
calm "Not available on this server yet" state (no warning tone, no Retry). Actions that cannot work
there, such as "Start conversation", are hidden instead of shown disabled. Demo mode is unchanged.
