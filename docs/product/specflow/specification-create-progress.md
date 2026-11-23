---
id: product.specflow.specification-create-progress
type: product
title: Specification Create progress, retry and return paths
status: current
scope: specflow
areas: [ui, workflow]
read_when:
  - reviewing Create submission, progress, operation monitoring or return-to-form behavior
summary: >-
  User-visible specification Create progress, retry and return paths with immutable operation identity,
  authoritative inspection and explicit refusal/unknown-outcome boundaries.
related:
  - product.specflow.specification-creation
  - architecture.runtime.specification-create-options
  - engineering.shared.specification-create-recovery
  - reference.api.specflow-specification-operations
  - reference.api.operation-progress
---

# Specification Create progress, retry and return paths

[Create choices and workspace selection](specification-creation.md) own the form.
Engine lifecycle owns admission and recovery invariants; this document owns their UI presentation.

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
stacked vertically, and works from 320 px. It is shown in the same Focused frame as the form and
the Specifications list (the design-system Bounded workspace rule), so nothing moves on submit: the
frame and the left edge stay where the form had them. Its content, dividers included, stays at one
focused column of about 880 px (the `content-form` width), left-aligned with the form, also when the
[Create form](specification-creation.md) used two columns; narrower screens fill the workspace.

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
  This project-mode result page is the completion feedback; it does not also publish a duplicate
  Specification created toast. The meaningful uncommitted-files warning remains when applicable.
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

The operations panel consumes `OperationListResponse` from
`@nevo/specflow-contracts/operations`. Transport paths, filters and bounds belong to the
[operation-list contract](../../reference/api/specs-operations-list.md) and generated OpenAPI;
[operation progress](../../engineering/shared/operation-progress.md) owns the integration recipe.

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

## Overview right after Create in project mode

A freshly created Specification opens on an Overview that shows everything that exists: the
overview's Goal (else its first paragraph) as the description, the registered documents, each
marked **Initial content only** while it is still the initial content the Engine wrote (said once
in the Documents header when every document is), the empty Tasks and Sessions sections
(inline empty states under their headers) and, with a workflow, Now with **Start workflow**
(without one, the preparation block). The block's
**Start session** opens New Session when the caller may start one; with Sessions turned off or not
permitted it only explains the preparation path. Activity history holds the "Specification created"
event and opens by default only once a Session event exists. A section whose source this Runtime
does not implement still shows the calm "Not available on this server" state (no warning tone, no
Retry); actions that cannot work are hidden instead of shown disabled. See the
[Specification Workspace API](../../reference/api/specification-workspace.md) for the sources.
