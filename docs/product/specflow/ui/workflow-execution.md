---
id: product.specflow.ui.workflow-execution
type: product
title: Manual workflow execution and Task authoring
status: current
scope: specflow
areas: [ui, workflow]
tags: [workflow, manual-execution, task-authoring, now-block, close, abandon]
read_when:
  - changing the Now block of a Task or of the Specification Overview, or its dialogs
  - changing Task authoring on the Full Task page (documents, context, dependencies, details)
  - changing the first-start confirmation, Finish or Return dialogs, or exit gates in the UI
  - changing Close specification or Abandon specification
  - changing Run with agent (its Now block states, dialog, Stop, Continue, Take over, owner confirmation)
  - changing what Close lists as uncommitted changes
summary: >
  How a person runs a Specification and its Tasks entirely in the UI, without any Session: the
  projection-driven Now block with one main action, the Finish, Return and first-start dialogs, exit
  gates, Task authoring on the Full Task page (documents in the Secondary, context, dependencies,
  details), the lifecycle actions, Close and Abandon with grouped blockers, and Run with agent (the
  start dialog, attempt states, the attempt commit, owner confirmation, take over and history).
related:
  - product.specflow.ui.specification-overview
  - product.specflow.ui.interaction-model
  - product.specflow.ui.shell-geometry
  - reference.api.specification-workflow
  - reference.api.task-reads
  - adr.0024-tasks-are-resources
  - adr.0023-neutral-workflow-coordinator-and-manual-execution
  - adr.0026-agent-step-execution
  - architecture.runtime.agent-step-execution
---

# Manual workflow execution and Task authoring

A person can create a Specification, author its documents, create Tasks of the project's own types,
edit their documents, context and dependencies, approve them, advance the Specification and every Task
step by step, and close or abandon the Specification, entirely in the UI and without an agent. Opening
anything only inspects; every change is an explicit action recorded with the person as its actor. The
Specification Overview and the Tasks page are described in
[Specification Overview](specification-overview.md); the data is the
[workflow action projection](../../../reference/api/specification-workflow.md) and the
[Task reads](../../../reference/api/task-reads.md).

## Rules

1. **Projection-driven.** The UI renders the Engine's action projection: a position (`not-started`,
   `ready`, `active`, `waiting`, `blocked`, `terminal`) and the actions allowed now. It never branches
   on step ids, never invents results and never mutates to discover actions.
2. **Titles, not ids.** Steps, workflows, transitions and returns are shown by their title. The step id
   and the workflow revision are detail: only in the Now block's ⋯ note ("Step implement · Standard
   Task rev 1") and the history meta, for a Specification and a Task alike. An attempt number is
   shown only from the second attempt on ("Attempt 2 · …").
3. **Only allowed actions are shown.** A disallowed action is omitted. When nothing is allowed and the
   reason is not evident, one sentence says why. Exception: **Put on hold** during an active attempt
   stays visible, disabled, with its reason ("finish or return the current step first").
4. **One main action, in the Now block** (Approve, Resume, Start, Finish step, Close specification).
   Other lifecycle actions (Edit details, Put on hold, Cancel, Remove) are in the header overflow.
5. **The Task Type is immutable**: chosen at creation, never edited; a Task whose type is no longer
   allowed is cancelled or removed and created again.
6. **State is never colour alone**: every toned line has an icon or words; refusals and conflicts are
   `role="alert"`; the position is a polite live region.
7. Action labels carry no trailing ellipsis, and status icons sit on the first text line
   ([UI/UX guidelines](../../../design-system/principles/ui-ux-guidelines.md#action-labels)).

## Now block

The top of the Full Task page, and of the Overview (its Specification variant is in
[Specification Overview](specification-overview.md#sections-and-order)), directly under the summary.
In reading order:

1. **Subject status** when it changes what can happen (a draft needs approval; on hold with its reason;
   an abandoned Specification with its reason). A Task's draft and cancelled notes sit under
   its title with the status glyph (`edit`, `close`) and a neutral tone: a status
   alone is not attention. An on-hold Task's Now leads with the hold: **On hold** (`circle-pause`)
   as its title, the reason under it, and where the workflow stands as the quiet line ("Not started ·
   First step · Implement"), with **Resume** as the main action; the header does not repeat the
   hold while Now shows it.
2. **Position**: the step title, or Not started / Completed / Abandoned; on the Overview the step
   track and its label (see [Specification Overview](specification-overview.md#sections-and-order));
   and one quiet line ("In progress since 11:18 · started by you", "Attempt 2 · …" only from the
   second attempt on; or the first step, "First step · Design" before a Task's first start; or how
   it continues; "Starting…" while a start is recorded). When an agent holds the step, the quiet
   line is the **executor row** instead (`NowExecutor`, one piece for every agent state): the
   provider's mark, the agent ("Claude Code · Opus 5.5"), the state of its work under it in its tone
   (green while it works, yellow while it waits for you or stopped without a result, red when its
   outcome is unknown) and **Open session** as the text action. **Actionable readiness leads**
   (owner, 2026-11-26): a Task its dependencies hold reads **Waiting for dependencies** (clock,
   attention tone) as its title, "Not started · First step · Implement" as the quiet line, and
   closes the state with "2 dependencies remaining · View dependencies ›". The domain state is
   unchanged; only the order and weight of its presentation.
3. **What the step is for.** The Specification shows the step's purpose. A Task shows it as
   **Goal**; without a purpose, the first paragraph of the step's instructions (three lines, **Show
   more**); with neither, nothing. Before a Task's first start it is the first step's Goal.
4. **Done when**: the active step's exit gates, met or not, as one checklist (the same list for the
   Specification and the Task). It is read from the step's results (`position.exits`), so it shows
   whoever runs the attempt, an agent included, when the viewer has no Finish step. A met gate is a
   success check with the document that meets it; an unmet one is an open circle with "not yet",
   neutral, because the step is being worked on and the main action is its fix. A gate reads as
   what it needs, by the document's file name, never the type id ("behaviour.md has an Acceptance
   section · not yet"; without a document yet, by the type's word: "A Behaviour document has an
   Acceptance section"); a gate with its own declared label shows that label. The missing sections
   are named only when the label does not name exactly those ("not yet · Risks section missing").
   The Finish dialog uses the same words in the attention tone. Only a gate that cannot be met as
   things are says why (its file is missing or cannot be read). Results that need different gates get one list each ("Done with Approved
   when"); a result that waits for open Tasks is left out (see Open Tasks). A Task adds where the work
   goes, "Then: Review", when every result leads to the same step (the Specification's step track
   names the next step already). A step with no document gates (the shipped workflows declare none)
   has no "Done when" at all, never an empty heading: a Task shows only the "Then" line, the
   Specification nothing; no document carries a relation label then, only its content state.
5. **Blocking reasons**, one line each with a link to where it is fixed (a missing required
   context entry · See Context; dependencies that can never finish). Dependencies still to finish
   are the readiness lead above, not a second line. An awaited process artifact is
   one neutral line.
6. **Last hand-off** (the Specification and the Task, one shared component): under a divider, the
   label "Last hand-off", then one row: a status mark and the result as its title ("Breakdown
   approved"); the row opens nothing (one chevron per block, View feedback's; the work history is
   the header's History action); under it one line each for the step
   ("Review the breakdown"), who handed it over ("Claude Code · Opus 5.5") and when ("Nov 25, 5:09
   PM"); then what the attempt committed, with the Commit icon ("[commit] 3 documents · 3ca401a",
   from the history read, when an agent's attempt committed); then **View feedback ›** when the
   hand-off left feedback, which opens the shared [Feedback view](#feedback) directly. The
   feedback is never previewed here: no fade, no cut fragment, no nested Show/Open (owner review,
   PR 169: one kind of information has one place of detailed presentation, with any number of
   direct entry points). A hand-off the next attempt must act on (a `fail` result such as a review
   that requested changes, or a return) is marked in the attention tone (its status mark and
   `data-handoff-tone="blocking"`), with the same one View feedback. The Now of a terminal run
   shows no hand-off.
7. **The main action**, with at most one button-styled secondary, for the Specification and the Task
   alike (one rule, `nowActionPlan`). Finish step is the main action while some result can be taken.
   When every result waits for an unmet gate whose document exists, opening it is the main action
   ("Open task.md", with "Add the Verification section to task.md to finish.") and Finish step is the
   secondary. Return to an earlier step (named "Restart Implement" when its only target is the
   step the run is at), an unavailable Finish step, Workflow history and the step id and revision
   are in the ⋯ menu. A lifecycle main action (Approve, Resume) replaces the workflow
   actions and is not repeated in the header.

The full attempt history is the Secondary (Task history, Activity history), closed by default and
opened by the header's history toggle.

## Dialogs

- **Finish step.** The result is a radio list of the projection's transitions, each with where it
  goes ("Goes to Implement · feedback required", "Ends the workflow"). Feedback is required when the
  chosen transition requires it (inline error, Finish disabled); artifacts are optional (attach a
  document). A step that produces Tasks lists the drafts it proposed earlier, ticked: ticked drafts stay
  drafts, unticked ones are cancelled, Tasks created by hand are not affected; keeping a draft that
  depends on an unticked one is refused in the dialog.
- **Exit gates.** The selected result lists the gates it needs (met ones as satisfied checks, unmet
  ones with what is missing, in the attention tone, and an action such as opening or creating the
  document): here the gate refuses the action the person is about to take. While one is unmet Finish
  is unavailable for that result and other results stay available. The Now block lists the gates as
  its neutral "Done when" checklist. A gate action closes the dialog but keeps its
  draft (result, feedback, artifacts) and opens the document in the Secondary; Finish step reopens the
  dialog with the draft and evaluates the gates again.
- **Open Tasks.** A result that completes the Specification is unavailable while any Task is open
  (owner decision A, [ADR 0024](../../../architecture/decisions/0024-tasks-are-resources.md)): the
  dialog names each open Task with why it is open ("t-02 is in progress, t-05 waits for other
  tasks") and Finish stays disabled for that result. The Now block says the same for each such result
  with **See Tasks**, and does not list the gates of such a result (meeting them would not help). On
  the Now block, Finish step is the main action only while some result can be taken; otherwise it
  moves to the ⋯ menu, unavailable, with the reasons, and an unmet gate's action becomes the main
  action only when meeting it would make a result available. When the Engine says the finish itself
  can close the open Tasks (`resolvableByFinish`), the dialog names the Tasks still open after the
  drafts the owner unticked and how each closes: "Untick t-08 below" for a draft of this step,
  "Cancel t-02 in Tasks first" for one only a status decision closes (the dialog sends no
  decisions). Finish becomes available once unticking leaves no Task open ("Finishing cancels the
  drafts you unticked"); such a result counts as available in the Now block, which asks
  to untick those drafts instead of naming them as open. A refused finish (the Tasks changed after
  the projection was read) shows the same explanation. Abandon remains the way to end a
  Specification with open Tasks.
- **Return to an earlier step.** The projection's allowed steps and the reason, required when the
  return requires it.
- **First start of a Task** confirms what will be pinned: Task Type, workflow and revision, first step.
  Confirming sends the previewed revision; when the workflow changed in between, nothing starts and the
  dialog shows the new revision and the change ("Not started: the workflow changed just now", **Start
  with rev N**). A type no longer allowed explains that the Task keeps its type and offers **Not now**,
  **Cancel task** and **Remove task**. Later steps start without confirmation.
- **Approve with a missing required context entry** stays allowed and confirms first, naming the entry
  and saying the Task cannot start until it is fixed. Awaited process artifacts give no warning.
- A wait step has no Finish: it settles by itself; only Return is offered when allowed.

## Full Task (`/specs/:specId/tasks/:taskId`)

Back to the Tasks page; the header (Narrow) or the trail's last item (Wide) names the Task by its icon
and key, the body by its title, then "[Task] Task · Task Type" (see
[Page identity](interaction-model.md#page-identity-and-product-icons)), the preparation notice (draft, cancelled
with its reason, or on hold with its reason when Now is not shown), the summary, then the sections **Workflow** (the Now block; omitted when
cancelled), **Documents**, **Context** and **Depends on**. Task history is the Secondary.

- **Placement.** Structured facts are edited where they are read, in these sections (no edit mode);
  documents open in the **Secondary** editor, several as tabs. On Narrow a document is a pushed page
  with Back.
- **Sections open when small.** At Wide (the workspace splits Primary and Secondary) Documents,
  Context and Depends on are ordinary sections with their icons, always expanded. Below Wide they are
  disclosures with the same spacing. A section starts **open** when it holds at most 3 rows
  (Documents) or 4 entries (Context, Depends on), or a blocker (a missing document file, a required context entry
  that does not resolve, a dependency that no longer exists); above that it starts **collapsed**
  with a one-line summary in its header ("Documents 5 · task.md, plan.md, +3", "Context 6 entries ·
  own list · 1 optional missing"). The user's toggle is kept per Task for the visit (in memory).
- **Rows and add actions.** A row click opens its object (a document as a Secondary tab, a context
  reference its target, a dependency that Task); the row `⋯` menu holds everything else. A section's
  add action is an icon-only **+** in its header with a label and tooltip ("New document", "Add
  dependency"); Context's **+** opens a menu ("Add context"). An empty section shows one labelled
  button instead.
- **Documents.** `task.md` first, then the Task's other documents, on the shared document row of
  Context and the Overview Documents (glyph, file name, a trailing state label; the role in the
  tooltip). The trailing label is the shared document state label
  ([document state](documents-tree.md#document-state-label)): the content state from the
  Task document listing (**Initial content only**, also for a generated `task.md` nobody edited yet)
  and the relation from the Task's own projection, with "this step" for the Task's active step
  (**Needed to finish this step** while `task.md` lacks a section its finish needs). A file that is
  not on disk shows **File missing** and opens nothing. New document; Rename
  and Delete in the row menu, none for `task.md`. While the context is the Task's own list, New
  document says that the new document is not added to it ("Add it from Context if a step should
  read it"); with the default context it says nothing (the document joins by itself).
- **Context.** The effective list in declared order. Kinds: Task document, Specification document, Project
  document, Code path (with its current match count) and Instructions, each Required or Optional with an
  optional note. Each entry is the shared document row named by its file name (`overview.md`, not the
  document title), with its kind and note in the tooltip and a trailing label: **Always first**
  (`task.md`), **Required** or **Optional**, or the problem with its short reason, visible at every
  width (**Not found · required**, **Not found · optional**, **Not registered · required**,
  **Awaited · needed to start**). Trailing labels line up: while the context is
  editable every row keeps the `⋯` slot. Above the rows a short label says which list it is,
  **Default context** or **Own context list**, with an info button (the size of the row buttons)
  that opens the explanation in a popover, by click or tap: what context is, by state (before the
  first start "Inputs this task needs before it starts, in the order they are read", once started
  "Inputs this task reads, in order"), then for the default that it follows the task (`task.md`,
  its other documents and the Specification overview, all required) and that new task documents
  join it, and, when the context is editable (also after the start, until the task ends), set
  apart: "Your first change saves it as this task's own list. After that, new task documents are
  not added by themselves." For an own list: this task's own list, new task documents are not
  added by themselves, and, when it can go back, Choose “Use default context” in the + menu. The open header shows the count only ("2 entries"); the collapsed
  summary keeps the source ("6 entries · own list · 1 optional missing"). The first change of an
  editable default has no confirm; it is said where it happens, before it happens: the row `⋯`
  menu opens with a note above a separator, read before any choice ("A change here saves the context
  as this task's own list…", announced with the menu through `aria-describedby`), and every Add dialog opens with an
  info note directly under its description, before any field, so a long document list cannot
  scroll it out of view while **Add to context** stays in the footer ("Adding this saves the
  context as this task's own list…").
  Both disappear once the list is the task's own. The row menu shows Move up / Move down, and
  their separator, only when the entry can move. With an own, editable list the **+** menu ends
  with **Use default context**: a confirm says the list of N entries will be replaced by the
  default (all required), names the entries that go ("Entries you added will be removed: ux.md,
  src/auth/**, +1") and that the context then follows the task again (new task documents join it
  by themselves), then sends `context: null` with the read revision. The default it compares with is the Engine's
  (`taskAuthoring.context.defaultEntries`); the UI never derives it. Entries that need attention come
  first, then **Show all N entries in order**. Missing required entries are also named in the
  danger note above the rows ("1 required entry is missing: ux.md."); a missing optional one is an
  attention label only. An entry marked "Created earlier in
  the process" (a process artifact) is **Awaited** while missing: neutral, no warning. Marking the Task's own document as a required
  artifact is refused and explained in the dialog: what the Task produces is an exit gate, not context.
- **Depends on.** Rows with the dependency's state. **Add dependencies** (owner, 2026-11-26) names
  each Task by its title, never its id: **Available tasks · N** first; the Tasks that cannot be
  added (already a dependency, shown checked; a cycle, "Depends on this task already; adding it
  would create a cycle"; cancelled; broken) in a collapsed **Unavailable tasks · N** group, each with
  its reason. With no Task to add the available group says "No task can be added now." A list longer
  than a Select's (8) has a search that filters both groups. The confirm names the count ("Add 2
  dependencies"). After the first start dependencies are fixed (a note, no add action).
- **One picker.** Add dependencies, New task's Depends on, and Add context's Specification and
  project documents use the same picker (the available items, then the collapsed unavailable ones
  with their reason, a search over a long list); Add context's confirm names the count too ("Add 2
  documents to context").
- **Edit details** changes Title and Summary; the Task Type is read-only with the remove-and-recreate
  hint. A revision conflict shows "Not saved: T-02 changed since you opened it" with **Copy my
  changes** and **Load the latest version**, edits kept; section edits that meet a newer revision show
  the same alert.
- **New task** (Overview header, Tasks page): Task Type (only the types the effective policy allows,
  each with its workflow and steps), Title, Summary, Depends on. It creates a draft.

**Lifecycle actions** (the projection decides; this is the rule they follow):

| Preparation | Never started                           | Started, between steps   | Active attempt                          | Ended |
| ----------- | --------------------------------------- | ------------------------ | --------------------------------------- | ----- |
| draft       | **Approve**, Edit, Hold, Cancel, Remove | —                        | —                                       | —     |
| ready       | Edit, Hold, Cancel, Remove              | Edit, Hold, Cancel       | Edit, Cancel; Hold disabled with reason | none  |
| on-hold     | **Resume**, Edit, Cancel, Remove        | **Resume**, Edit, Cancel | —                                       | —     |
| cancelled   | none                                    | none                     | —                                       | none  |

## Close

**Close specification** is in the Overview header overflow and, once the workflow ended, the Now
block's main action (in the demo, which has no repository, it is unavailable with that reason). It
opens the Close dialog: the title "Close <title>" stays, and exactly one outcome is shown at a time
(`closeDialogOutcome`). "Ready to close" never appears while a check is pending, failed or blocking,
or after a refusal.

- **Checking:** a spinner with one polite live line, "Checking whether <title> can close…", and after
  3 s a second line, "Checking the repository. This can take a few seconds." The footer has only
  **Cancel**. When saved documents in the checkout are still queued for their automatic commit
  (`DOCUMENT_COMMITS_PENDING`, `commit-pending`), it reads **Saving document commits…** and the
  preview is read again by itself (every 1.5 s, about 30 s at most); after that it becomes a failed
  check with **Check again**.
- **Blocked:** one sentence saying why, then flat groups in a fixed order — **Running sessions**,
  **Workflow**, **Unfinished tasks**, **Broken tasks**, **Pending writes**, **Workflow state** — each
  with one explanation, its Tasks (the title as a link, the id on its own secondary line as on a
  Task row, then the status with its mark from the one
  status model; at most five, then "and N more"; only a group that lists Tasks counts them in its
  heading; an On hold Task adds its hold reason, as its Tasks page row does) and its resolving
  action where one exists. Below them "Not going to finish this work?
  **Abandon instead**". The footer has only **Dismiss** (primary); when repository problems are
  listed as well (below), it also has **Check again**, as there.
- **Blocked by the repository:** "<title> cannot close yet: N repository problems." and one group per
  problem:
  - **Uncommitted specification files · N** (or **Uncommitted files where it merges** for the
    checkout it is integrated into, which says the files may not belong to this specification): the
    files as a list (at most five, then "and N more"), committing them in that checkout as the way
    forward, the checkout's folder in monospace with **Copy path**, and the attention note "**Discarding deletes
    these changes for good.** Git keeps no copy of uncommitted work, so discard only what you are
    sure you do not need." The dialog never offers to discard. The refusal names the checkout by
    its registered workspace (`workspaceId`), never by a filesystem path: the folder is read from
    the registered workspaces (`GET /api/workspaces`, `workspace.view`). Without that read the
    sentence names the checkout ("the specification's checkout") and there is no path to copy.
  - **No integration branch configured:** the branch must be set as `git.integrationTargetBranch` in
    `.nevo/config.yaml`. Under **Integration branch** the Runtime's candidates are radio rows with
    the facts that make each one a candidate ("Remote default (origin)", "<title> started from it",
    "Checked out in the main folder"), and nothing is chosen, even with one candidate. **Another
    local branch…** reveals a select of the other local branches. The setting is shown as two lines
    of YAML, `git:` / `integrationTargetBranch: <choose a branch>`, until a choice names the branch;
    **Copy setting** stays off with "Choose a branch first" until then. No branch (`main` included)
    is ever assumed. Without any local branch the list reads "No local branch can receive it". The
    choice is not saved: the person edits the file, then checks again.
  - **Integration checkout on another branch**, **Unfinished Git operation**, **Not on a branch**:
    what holds the Close and what to do.

  "Abandon instead" is not offered while only repository problems remain (abandoning needs a Close,
  which meets the same checks). The footer has **Dismiss** (secondary) and **Check again**
  (primary, last in the footer, on top when stacked), which reads the preview anew (Checking, then
  the new outcome).

- **Agent work whose commit failed:** its own group in the blocked Close, with **Retry commit**
  inside it (see [Close: agent work whose commit failed](#close-agent-work-whose-commit-failed)).
- **Held by uncommitted files SpecFlow wrote** (`DOCUMENT_COMMITS_PENDING`, `commit-uncommitted`,
  from the preview or the Close): a blocking state, never a failed check. "<title> cannot close
  yet: another specification has uncommitted changes in this checkout." (or "it has uncommitted
  changes in its checkout" when only this Specification's files are named, or "files SpecFlow wrote
  in this checkout are not committed" without named Specifications), then how to resolve it (commit
  from that Specification's Documents or with Git, or finish its step in progress), then each owner
  with its files and the discard warning. Another Specification's name is a link to its Overview
  (this Specification's is not). The footer has **Dismiss** and **Check again** (primary).
- **Check failed:** the preview refused for a reason that is not a blocker list, or could not be
  read: a danger alert "Could not check whether <title> can close" with what to do (a failed
  document commit: retry or resolve it in Documents), **Dismiss** and **Check again**.
- **Ready:** the "Ready to close" alert ("The workflow is complete and the repository checks
  passed."; with Git off "The workflow is complete. Git is off, so nothing is merged.", since no
  repository check ran; an abandoned Specification shows "Abandoned: “<reason>”" under the title
  instead), then the facts in a fixed order: **Result** "Recorded as not delivered"
  (abandoned only), **Merges**, **Tasks** and, when some apply, **Documents**: the documents still
  only their initial content in the shared document state vocabulary ("2 with initial content only:
  ux.md, backend.md", at most three names then "+N more"), informative and never a blocker, from the
  workspace read's `contentState`. Merges comes from the preview's `merge` fact:
  "<source> → <target>", "Nothing to merge" (no commits ahead of the target), "Archives on <branch>
  (main folder; nothing to merge)" (the Specification lives in the main folder), "Archives on
  <branch> without merging" (archive only), or "Archives without Git (Git is off for this project)"
  (adding, for a linked worktree, that the archive stays uncommitted there). Tasks reads the
  Runtime's Task counts in Now's words ("All 6 tasks done · 1 cancelled", "5 tasks cancelled · 1
  done", or "No tasks were created"); the cancelled and abandoned Tasks are then named below. The note "Closing archives the specification; it cannot be reopened."
  follows, and the footer has **Cancel** and **Close and archive**.
- **Closing:** the ready content stays, read-only; the button reads **Closing…** (`aria-busy`) and
  Cancel is off. Then the dialog closes, or shows **Not closed** with the reason (**Dismiss**, **Check
  again**; a refusal that names blockers shows them as Blocked instead), or **Close needs attention**
  when it stopped part way.

At 390 px the footer buttons are full width and stacked, the primary on top, and long paths and
branch names wrap.

## Abandon (close without realization)

**Abandon specification** is a danger item of the header overflow, shown only when the projection
allows it. **It is final**: there is no reopen.

- The dialog says it ends the Specification without delivering it and cannot be undone, and lists the
  consequences: the Specification workflow ends as abandoned at its step, every active attempt is
  listed and ends as abandoned with its work kept, every open Task is cancelled (listed by id), and
  documents, Tasks and history stay readable. A reason is required.
- **Blocked** uses the same grouped layout with only **Dismiss** when something is still running
  (pending writes, broken Tasks, another operation).
- Afterwards the Now block reads **Abandoned** with the reason and offers **Close specification**; New
  task is gone, and Close lists every cancelled Task as not delivered.

## Responsive

Wide (1440) and Compact (900): the Primary and the Secondary (history or a document) side by side.
Narrow (390): one surface; history is the header toggle; a document is a pushed page with Back.
The Now block (Specification and Task) is a card from a 40rem page content container and a flush
band across the body padding below it (`AccentBlock bleed="narrow"`); the action row wraps, main
action first.
Dialogs keep one column. Blocker and Task rows keep id → title → state order.

## Run with agent

**Status: implemented.** Storybook (production stories): **SpecFlow/Screens/Run with agent** (`Entry`,
`NewSession`, `ContinuesSession`, `IndependentStep`, `UncommittedChanges`, `NoAgentChosen`,
`ProviderNotReady`, `SessionUnavailable`, `RefusedOnSubmit`), **SpecFlow/Screens/Agent attempt**
(`Running`, `Stopping`, `ReturnRequested`, `ReturnStopFailed`, `TakeOver`, `OutcomeUnknown`,
`SessionMissing`, `EndedWithoutResult`, `ProposalRefused`, `ContinueRefusedFilesChanged`,
`SessionGone`, `ConfirmationPending`, `ConfirmationReject`, `TakenOverWithHistory`,
`FinishedCommitted`, `FinishedCommitFailed`, `HoldOutcomeUnknownOnOtherSubject`,
`HoldWorkingOnOtherSubject`) and **SpecFlow/Screens/Close specification**
(`BlockedByAgentWorkWhoseCommitFailed`, `BlockedRepositoryWithAgentWork`). It follows
[ADR 0026](../../../architecture/decisions/0026-agent-step-execution.md) and
[agent step execution](../../../architecture/runtime/agent-step-execution.md).

A person can let an agent do a step instead of doing it themselves. Run with agent adds no new
surface: it lives in the Now block, its dialogs, the Close dialog and the histories. The UI renders
the Engine's projection only (the step's agent option, the attempt, the position, the project hold);
it never decides from a step id which agent runs. User copy says "the agent stopped", never "turn",
"claim" or "invocation", and the explanations of states are plain Engine data, never written by an
AI.

### Naming the agent

Every screen names an agent the same way, **"Claude Code · Opus 5.5"**: the tool (the provider:
Claude Code, Codex, ...), then the model (owner, 2026-11-26). One formatter (`agentDisplayName`)
serves the Now block (its position line, Last hand-off and the result waiting for the owner), the
Activity history and the Task history, the Run with agent dialog, and the attempt's commit message
says it the same way ("by agent Claude Code · Opus 5.5"). Each part comes from one source order:
**what the attempt or its Session actually ran first, the catalogue after it, the id last.**

- The tool: the title the attempt recorded when it started, else its Session's, else the provider
  catalogue's, else the provider's id made readable (`claude` is "Claude").
- The model: the title the attempt recorded, else its Session's, else the catalogue's title of the
  model id the attempt recorded (the attempt's own record, else its actor's, so the history and the
  Now block name one attempt alike), else that id.

Where a line is too short for the whole name (the history's one-line agent line at 375 px or beside
Overview), the provider's mark stands for the tool and the line shows the model alone, "Opus 5.5";
the name is never cut, and the whole name stays the accessible name and the tooltip. The Sessions
screens follow the same rule: a row shows the mark and the model, the Session's header the whole
name.

The Run with agent dialog has no Session yet: it names the catalogue's choice, and the recorded ids
when the catalogue cannot be read.

### Start step and Run with agent

- On a ready step whose executors include an agent, the action row holds **Start step** (main) and
  **Run with agent** (the one button-styled secondary, `bot` icon). A step the agent does not do
  shows **Start step** alone, with no disabled Run with agent. Run with agent only starts an
  attempt: it is never offered during a person's active attempt.
- Run with agent stays enabled when the agent is unavailable (no agent chosen, not ready, a dirty
  checkout): its dialog explains the precondition before anything is sent. It is omitted only when
  the step is not an agent's step.
- Two buttons, not a split button: the agent is one visible click away, and the design system has no
  split button.

**Action placement rule.** In every Run with agent dialog and Now block state, an action that
resolves a blocker lives inside that blocker's alert or note (**Check again**, **Retry commit**). A
dialog footer holds only Cancel and the one primary action, disabled while blocked; a Now action row
holds the main action and at most one secondary. Never three buttons in one row.

### Run with agent dialog

Title "Run with agent: <step title>". The description says what happens: the agent does this step of
<the Task, or this specification> on its own (it reads the step, its documents and context, writes
what the step needs and proposes a result); decisions that need you stay with you. The dialog checks
the start when it opens ("Checking whether an agent can run this step…"); a check that did not
finish says so ("SpecFlow could not check the agent. The check did not finish, so nothing was
started.") with **Check again** inside the alert. Then, in order:

1. **What blocks the start**, only when something does: one attention alert per precondition with
   what, why and what to do, and **Check again** at the bottom of the alert. The footer stays
   **Cancel** and **Run with agent** (primary, disabled while anything blocks; "Starting…" while it
   is sent). A refusal of the start that names the agent or the dirty checkout is shown as the same
   blocker (announced as an alert); any other refusal is explained in its own words and code.
   - **Commit or undo these changes first** (uncommitted changes): the files changed outside
     SpecFlow and are not committed; the agent starts from a committed checkout so that everything
     that changes afterwards is its own work; documents and tasks SpecFlow saved itself do not
     block it. The paths as the Close dialog lists them (five, then "and N more"), the checkout's
     folder with **Copy path** where the workspace is registered, "Commit them, or undo the ones you
     do not need, then check again." There is no discard action.
   - **No agent is chosen for <step>**: which agent role does the step and that the project names
     no agent and model for it yet; the fix is the project's agent settings (there is no link). The
     Session section then shows "Agent and model not chosen", never a preselected picker.
   - **The agent is not ready**: the Runtime's own words about which agent and why. For a new
     session the picker marks it and choosing a ready agent enables **Run with agent**; a continued
     session has no picker and stays blocked.
   - **The session to continue is gone**: the workflow continues the session that did the step
     before and it no longer exists; SpecFlow does not start another in its place. Do the step with
     **Start step**, or have the workflow changed. The Session section shows the gone title struck
     through.
   - **The project is busy**: another change is being saved; wait, then check again.
   - **Agents do not run in the demo**: do the step yourself with **Start step** (no Check again).
   - **An agent cannot run this step now**: the step changed since it was opened, or no agent does
     it; check again to read it once more.
2. **Session.** The workflow decides new or continued; the dialog never offers that choice:
   - **New session**: the start screen's agent tiles and the model picker, preselected from the
     agent role's settings ("Your choice applies to this attempt only"). While the agents load it
     says so; when they cannot be listed it says the attempt starts with the preselected agent.
   - **Continues <Session title>** (a link): read-only, with its model and why ("the workflow
     continues the session that did <step> before, so the agent keeps what it learned there. Its
     agent and model stay as they are."), and the session's own work mode ("The agent works in the
     Auto mode.", the provider's title) when the provider still lists it. A new session states its
     mode the same way when the Runtime names it for the preselected agent and model.
   - **Independent step** (a review facet): a new session as above and "<step> is done
     independently: it always starts in a new session, never in the one that wrote the change."
3. **Commit disclosure**, always once the check is read: an info note with the commit icon, "When
   the agent finishes, SpecFlow commits its work on `<branch>` as one commit; changes of others are
   never included." (the specification's branch when its name is not known). A branch name is never
   broken inside.

### While the agent works

The Now block reads the attempt again every few seconds while the agent works, is stopping, may still
run, a return waits or its result is being applied.

- **Working**: the executor row names the agent and, under it, the attempt ("Attempt 2 · agent
  working since <time>", green), with **Open session** beside it. Goal, "Done when" and the
  hand-off stay as for a person's attempt; the viewer has no Finish step. The action row holds
  **Stop agent** (secondary, stop icon). The ⋯ menu stays.
- **Stopping**: "Attempt 2 · stopping the agent · <Session>", **Stopping…** (disabled, busy) and an
  info note with a spinning icon: the step stays locked until SpecFlow sees the agent's process has
  ended; then you can continue or return. It never says stopped before that proof. The ⋯ menu is
  gone.
- **Return requested**: Return in ⋯ during an agent attempt is a request. The Runtime stops the
  agent and the step goes back only once its process is proven ended. Until then: "Attempt 2 ·
  return requested · waiting for the agent to stop · <Session>", **Returning…** (disabled) and an
  info note: the step goes back to <target step> only once the agent's process has ended, so nothing
  it still writes is lost or mixed into the next attempt. The ⋯ menu is gone. If stopping failed, an
  attention note says the agent may still be working and the return waits, with **Stop again**. Once
  the agent has stopped, the line reads "return requested · the agent has stopped" and the note
  says the return applies when you next act on this step (choose Return in the menu, which stays).
  A refused return shows "The return to <target> was not applied: <reason> (<code>). The attempt
  stays as it is."
- **Outcome unknown** (the agent's process may still run): "Attempt 2 · the agent's outcome is
  unknown · <Session>", a danger note (alert): SpecFlow cannot tell whether the agent is still
  working; nothing can be saved anywhere in the project until that is known; **Check outcome**
  (main) asks the machine running SpecFlow again; if it still cannot tell, end the agent's process
  there, then check again. Distinct from Stopping: nobody asked it to stop, and it blocks the whole
  project, not one step. The ⋯ menu is gone.

### Other subjects while an agent holds the project

Every other subject's Now block shows one note above its own content:

- **Outcome unknown**: an attention alert "Nothing can be saved in this project right now. SpecFlow
  cannot tell whether an agent is still running. Check its outcome in <subject>. Session: <title>",
  the subject as a link to its page. The block offers none of its own actions.
- **The agent works** (running normally): an info note, shown only where the block has an action
  the hold would refuse ("An agent is working in this project. Until it stops, starting, finishing
  or returning a step here is refused; this page updates by itself when it stops. It works on
  <subject>. Session: <title>").

### After the agent stops

- **Stopped without a result**: "Attempt 2 · the agent stopped without a result at <time> ·
  <Session>"; an attention note "The agent stopped without proposing a result." with what Continue
  and Take over do; a quiet line "Kept so far: <documents as links> and N changed files. **See the
  attempt**", where a Task's documents are named with the Task's title ("Kept so far: Sign-in
  screen: task.md, screens.md; Audit log: task.md", since every Task has its own `task.md`; the
  titles come from the Specification's Tasks and the drafts the attempt produced, bare names only
  when a title is not known). Actions **Continue** (main) and **Take over** (secondary); Return stays in ⋯.
  **Continue** opens a small dialog "Continue <step>" whose description also names the session's
  work mode ("The agent works in the Auto mode.") when the provider lists it, with an optional
  **Note for the agent** (at most 4000 characters) and Cancel / **Continue** (**Continue with the note** once a note is
  written); Continue has the initial focus, so without a note it is one more press. The note goes
  into the attempt's own Turn after SpecFlow's continuation message, with the attempt's scope and
  permissions (never a separate chat Turn), and is recorded on that Turn in the attempt journal.
  The dialog closes when the Continue is answered; a refusal is shown in the Now block as before.
  The Activity history lists each note under its attempt ("Your note for the agent: …").
- **Did not start** (its Session could not be created): "Attempt 2 · the agent did not start"; an
  attention note says it has done nothing yet. The main action reads **Retry start** instead of
  Continue.
- **Result refused when it was applied**: "… the agent's result was not accepted"; a danger note
  (alert) "The agent proposed <result>, and SpecFlow did not accept it:" with one bullet per reason
  in plain words (a changed file the agent did not list; a file without a document type, "Give it a
  type or delete it"; a file SpecFlow wrote that was edited outside it; a Git repository inside the
  checkout; a condition not met; Tasks still open; otherwise the code), then what Continue and Take
  over do. Same actions.
- **Being applied**: "Attempt 2 · the agent proposed a result"; an info note with a spinning icon
  ("The agent proposed <result>. SpecFlow is applying it."); Continue is disabled.
- **Continue refused, files changed since the agent stopped**: shown before the click: an attention
  note "The agent cannot continue: N files changed since it stopped." with the paths and "SpecFlow
  never counts someone else's edits as the agent's work. Undo these changes, or commit them
  yourself (they become your commit, not the agent's), then continue. Or take over and finish the
  step yourself." with **Check again** inside the note. **Continue** is disabled; **Take over**
  stays. There is no "keep as the agent's" action.
- **Continue refused, its session is gone**: "The agent cannot continue: its session no longer
  exists." SpecFlow does not start another in its place: take over, or return from the ⋯ menu. The
  Session title is struck through. Any other reason Continue is refused shows the same blocker
  alert as the dialog.
- **Kept work**: nothing is undone or discarded. The kept-work line links the Task's documents (the
  Specification's own documents are named, not linked) and counts the other changed files; **See the
  attempt** opens the Task or Specification history and does not scroll to the attempt.

### The attempt commit

When an agent attempt finishes, SpecFlow commits its work as one commit on the specification's
branch, also when the result then waits for confirmation: confirmation decides only the transition,
never whether the work is committed. Changes of others are never in it. The Now block of the step
that follows reports it, read from the workflow history (nothing is said while the commit is still
being made; the block reads it again until it settles):

- **Committed**: an info note with the commit icon, "The agent finished <step>. Committed `<short
id>` on `<branch>`: N documents and N files." Without an id (every path already equalled HEAD) it
  says "Its work is committed on `<branch>`". There is no "Show commit" action. Now moves on and the
  hand-off is the agent's (result, feedback, "<provider> · <model>").
- **Commit failed**: the step is finished, so Now moves on. An attention note (alert) says it in
  plain words with the code after it ("<step> is finished, but its commit failed: a Git hook or rule
  in this repository refused it (`COMMIT_BLOCKED`)"; or "the branch is protected"; or "Git could not
  complete it"), that the files stay uncommitted on `<branch>` and Close lists them until
  committed, and, before any click, that until it is committed nothing in the specification's
  workflow can change: Start, Finish step, Return and Run with agent wait for it (fix the cause,
  then Retry commit). Then the attempt's files (five, then "and N more") and **Retry commit**
  inside the note (a dedicated owner action; the same button in Close and in the history). A
  refused retry shows its reason under the note.
- **Commit still being made**: an info note "The agent finished <step>. SpecFlow is committing its
  work…" with the same sentence on what waits for it; when it stays pending past a few reads it adds
  "The commit has not finished. If it does not finish by itself, Retry commit makes it now." and
  **Retry commit**.
- This is **one notice for the whole workflow block** of every subject of the specification while
  the commit waits (the projection's `attemptCommit`): on another subject it names the step with its
  task ("Implementation of task t-04"), and its Retry commit retries that attempt. Start, Finish
  step, Return (menu) and Run with agent are disabled meanwhile, and the task actions and New task
  are not offered. A change refused for it after all ("The agent’s work in this specification is not
  committed yet, so nothing in its workflow can change. Retry its commit (shown above), then try
  again.") and a finish whose own commit waits for it ("The change is saved, but its commit waits
  for the agent’s work in this specification to be committed first…") use their own words, never
  the generic failure.

### Pending owner confirmation

The attempt is finished and committed before the owner decides.

- "Waiting for your confirmation · the agent finished <time> · <Session>"; under the step's purpose
  the agent's result in the Last hand-off component, labelled "The agent's result" (its result,
  the agent and the time on their own lines, what its commit holds, in the info tone, and View
  feedback, which opens the [Feedback view](#feedback) of that attempt), then an info note with what Confirm applies ("Confirming approves the 5 draft tasks
  (t-01 to t-05) and moves to <next>.", **See Tasks**; "records the agent's decisions on N tasks"
  when it proposes decisions on Tasks; "completes the workflow" or "ends the workflow as abandoned"
  when it ends the run). Actions **Confirm** (main) and **Reject**.
- **Confirm** applies the transition and its effects as the owner, an ordinary owner write. While the
  attempt commit is pending or has failed, **Confirm and Reject are both disabled** (a Reject would
  write the run into the agent's uncommitted work) and one note explains why for both in plain
  words: confirming or rejecting waits until the agent's work is committed; when the commit failed
  the note holds the failure with **Retry commit** (the same wording and button as above). Both
  become available once the commit is made. The same note shows the commit when it is made
  ("Committed <short id> on <branch>: N documents and N files") and, while it runs, "SpecFlow is
  committing its work…" (the block reads again until it settles); when it stays pending past a few
  reads (an interruption left it so), the note adds "The commit has not finished…" with **Retry
  commit**, the same button as after a failure. A Confirm refused because the commit is not made yet
  reads the block again instead of showing an error; any other refused Confirm shows its reason.
- **Reject** opens "Reject the agent's result": the step goes back to ready to start with the owner's
  feedback as its hand-off; the proposal is not applied; the drafts and documents it wrote stay (the
  description says so when it wrote drafts). The attempt's work is already committed, so Reject
  leaves no uncommitted agent work. A required field **What should change (required)** ("The next
  attempt reads it first, whether you start it yourself or run it with an agent"). **Cancel** and
  **Reject** (disabled until the field has text).

### Feedback

One view presents a hand-off's feedback whole, wherever it is reached from (owner review, PR 169):
Now's Last hand-off (a Specification's and a Task's), the agent's result waiting for the owner, and
every Activity history and Task history entry that has feedback, each through **View feedback ›**.
It is a Secondary screen (`feedbackStack`): opened from Now it replaces the Secondary (on a phone,
the Overview), and Back or Close returns to Now; opened from a history entry it is pushed onto the
history, and Back returns to the history. It is not a route.

- The header: "Feedback", with **Copy** (an icon action, its words as tooltip, "Copied" for a
  moment) that copies the original Markdown.
- The step's title, how it ended (the history's mark and outcome line: "Breakdown approved",
  "Changes requested", "Result rejected", "Returned to <step>"), "Attempt N · <when>" (an owner's
  attempt adds "you"), the agent with its mark and **Open session**, and the owner's decision line
  ("Confirmed by you · <when>").
- Under a divider, the full original Markdown in the shared renderer (as messages and
  documentation). A rejected result shows the agent's feedback, then the owner's, each under its own
  label ("Result", "Why the result was rejected").
- A return between attempts names no attempt and no agent: its step, "Returned to <step>" and when.
  A return hand-off is found in the history by its time (a return record, a Reject, or an attempt
  that returned).
- A feedback the history no longer holds (cut off as older) says so instead of showing anything
  stale.

### Take over and the attempt's history

- **Take over** is offered once the agent's process is proven ended. Its dialog "Take over <step>":
  "The agent's attempt ends as taken over, and your own attempt N starts. You then finish the step
  yourself." **The agent's work stays** lists its paths: nothing is undone; the files stay as the
  agent left them, uncommitted until you commit them; finishing the step does not commit them, and
  Close lists them until they are committed ("The agent left no uncommitted files." when there are
  none). The Session stays open to read but no longer works on the step (or, when it is gone, "no
  longer exists").
- Then Now is a person's attempt: "Attempt 3 · in progress since <time> · started by you · taken
  over from the agent", with Finish step.

### Hand to agent

- On the owner's own attempt of a step whose executors include an agent (after Start step or Take
  over), the action row holds **Finish step** (main) and **Hand to agent** (Polish "Przekaż
  agentowi", the one secondary, `bot` icon). When the row already has another secondary (an unmet
  gate's fix beside Finish step), Hand to agent is in the ⋯ menu instead: never three buttons. A step
  the agent does not do never offers it.
- The who-acts line says it: "You are doing this step: do the work and finish it, or hand it to the
  agent to go on." (after Take over: "… do the rest yourself and finish it, or hand it back to the
  agent in a new attempt.").
- It opens the Run with agent dialog with its own words: "Hand to agent: <step>", "Your attempt N of
  this step ends here, and the agent goes on with the step in a new attempt: …", the primary **Hand
  to agent** ("Handing over…"). Everything else is Run with agent's: the check when it opens, the
  blockers, the Session and the commit note. No reason is asked.
- **Commit or undo your changes first**: the checkout has uncommitted changes besides SpecFlow's own
  workflow state (the owner's work in the step, a document not committed yet). The agent's attempt
  would count them as its own work, so they are named before anything is sent (five paths, then "and
  N more", the checkout's folder with **Copy path**), "Commit your work, or undo what you do not
  need, then check again. The agent then goes on from what you committed.", and the primary is
  disabled.
- After the hand, Now is the agent's attempt as for Run with agent. The Task history shows the
  owner's attempt with the line "Handed to the agent"; the agent's attempt lists "Handed to the
  agent" as its first event instead of "Started".
- **What an attempt changed** reads the same in the Task history and the Activity history. The
  Engine groups everything the attempt itself changed, committed or not (the files SpecFlow wrote
  for its Turns and the files its result declared, never the rest of the checkout), by what it is:
  the Specification's (or the Task's) **registered documents**, the **Tasks** it produced (by
  title), **other files**, and SpecFlow's own records (`.execution/**`, Task resource files, the
  manifest). The counts of its commit follow the same groups, so "3 documents" is three registered
  documents, never execution state.
- The history shows what an attempt achieved, not every event the Engine recorded: the ordinary
  lifecycle (started, working, stopped, finished, committed) stays in the attempt's data for
  diagnosis and recovery and is never listed. Only exceptions get a line: a result the Engine did
  not accept ("Result not accepted · <time>"); an interruption, a take over, a failed commit and a
  result waiting for the owner are the outcome line and the commit note.
- An attempt reads, in order: its time, "Today, 12:35 – 12:40 PM · Attempt 1" (in the Activity
  history the day is the group heading instead): the elapsed range only, never a duration, because
  the range holds interruptions and waits (a rate limit, the owner's reply) the data cannot tell
  from working time; the agent with its provider's mark, "Claude Code · Opus 5.5" (the same formatter and
  source order as Now's Last hand-off, see "Naming the agent"; the model alone beside the mark where
  the line is too short), on one
  line that never wraps, with **Open session** at the end of the same line (the Session is not named by its title: a Session
  continued from an earlier step keeps that step's title, "Gather requirements · attempt 1", which
  would misname this step); what it changed as compact rows, collapsed by default, each only when it
  has any: "N changed files" (the registered documents first, as links where they open, then the
  other files; each by file name with its folder relative to the Specification, never the repeated
  `specs/active/<slug>/` prefix) and "N tasks" (Task titles as links, the first four, then "N more
  tasks"); then its commit as one row, "Committed · cac3c46". A failed commit shows the Now block's
  note with **Retry commit**; work an attempt that ended without its own result left in the
  checkout reads "Kept in the checkout, not committed". The owner's Confirm or Reject of its result
  is a line of the attempt, after the agent ("[person-check] Confirmed by you · 5:09 PM", "Rejected
  by you · 5:09 PM"; the Owner confirmed and Owner rejected icons). **View feedback ›** opens the shared
  [Feedback view](#feedback) when its result, its return or its Reject left feedback; the history
  never expands feedback in place, however long it is (the Task history's entries too). SpecFlow's own records (execution state, Task resource
  files, the manifest) are never listed. In the Task history the attempt sits inside the ordinary
  entry (step, result line) and says how it ended when the entry's result does not ("Taken over by
  <person>", "Returned to <step>", "Abandoned", "The agent is working on it"; "The agent stopped
  without a result at <time>" when it never proposed one).
- The Specification's own steps (Breakdown and the like) appear in the Activity history (beside
  Overview, and as its stacked screen on a phone) in its one chronological timeline with the
  Specification's events (see
  [Specification Overview](specification-overview.md#activity-history)), newest first and grouped
  by day (**Today**, **Yesterday**, then the date). The owner's entries use the same grammar: the
  owner's own attempt (the step, its result line, "1:12 – 1:13 PM · you · Attempt 2", View feedback)
  and a return ("Returned to <step>", View feedback). The owner's Confirm or Reject is not an entry
  of its own: it is the "Confirmed by you · <time>" or "Rejected by you · <time>" line of the
  attempt it decided, so one attempt is one entry with the agent's result and the owner's decision
  (the decision stays its own record in the data; only the presentation joins them). A rejected
  attempt is marked "Result rejected" (circle-alert, attention). Each agent entry is
  marked by how the attempt ended, with the marks of the Now block's Last hand-off: completed
  (circle-check, success; the line names the result, "Breakdown approved", or "Completed"),
  waiting for your confirmation (clock, info), changes requested, result rejected and a commit that
  failed ("Finished, but not committed") (circle-alert, attention), running (spinner), taken over
  or returned (undo, neutral), abandoned (close, neutral). Then the step as its title, the outcome
  line and the lines above. Three levels: the entry by default; the rows open to the files and
  Tasks; the full feedback (the Feedback view) and, through Open session, the Session's transcript on request. When
  older attempts are cut off it says "Older attempts are not shown."
- What an attempt changed is listed on every entry that changed anything, from the paths its commit
  recorded. A commit that did not record its paths lists none: the checkout's dirty set holds the
  owner's and other attempts' files too, so it is never taken for the commit, and nothing is listed
  rather than a guess. The history read starts no Git process, so it never reads a commit back from
  Git.

### Close: agent work whose commit failed

An attempt whose commit failed holds the Close until it is committed. The Close dialog shows it as
its own group, **Agent work whose commit failed · N** (N counts its files), above the other
uncommitted files, alone or beside another specification's files or the repository's own problems.
The group explains "An agent finished its step, but Git did not accept its commit. The files stay
uncommitted until the commit is made." and lists per attempt which step of which Task (or "of this
specification") and which attempt, why in plain words with its code, its files (five, then "and N
more") and **Retry commit** (named for its step) inside the group. A successful retry checks the
Close again. The sentence above the groups says "An agent finished its work, but its commit failed.
Retry the commit below, then check again." (beside other files, each group says how to commit its
own files). The footer keeps only Dismiss and Check again; the dialog never offers to discard.
