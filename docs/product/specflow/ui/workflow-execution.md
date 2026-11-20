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
  - changing Ask agent (its Now block states, dialog, Stop, Continue, Take over, owner confirmation)
  - changing what Close lists as uncommitted changes
summary: >
  How a person runs a Specification and its Tasks entirely in the UI, without any Session: the
  projection-driven Now block with one main action, the Finish, Return and first-start dialogs, exit
  gates, Task authoring on the Full Task page (documents in the Secondary, context, dependencies,
  details), the lifecycle actions, and Close and Abandon with grouped blockers.
related:
  - product.specflow.ui.specification-overview
  - product.specflow.ui.interaction-model
  - product.specflow.ui.shell-geometry
  - reference.api.specification-workflow
  - reference.api.task-reads
  - adr.0024-tasks-are-resources
  - adr.0023-neutral-workflow-coordinator-and-manual-execution
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
   it continues; "Starting…" while a start is recorded).
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
5. **Blocking reasons**, one line each with a link to where it is fixed ("Waiting for 1 dependency ·
   See Depends on", a missing required context entry · See Context). An awaited process artifact is
   one neutral line.
6. **Latest hand-off** (Task): the last step, its result, who and when, and its feedback (how a failed
   review reads on the rework attempt). In the card it is a quote with a left rule ("Last: Review ·
   …"); in the Narrow band it is a labelled paragraph ("Last hand-off", then "Review · …") with no
   second rule inside the band's bar. The
   Overview leaves the hand-off to the history.
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

Back to the Specification, the title, `id · Task Type`, the preparation notice (draft, cancelled
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
  ([document state](documents-archetypes-ui.md#document-state-label)): the content state from the
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
- **Depends on.** Rows with the dependency's state; the add checklist disables existing dependencies
  and cycles with their reason. After the first start dependencies are fixed (a note, no add action).
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

## Ask agent

**Status: UX contract from the mock of 2026-11-20, not implemented, awaiting owner review.** It
follows the [Ask agent contract](../../../ideas/specflow-engine/reusable-workflow-manual-execution/agent-assisted-execution.md)
(D11 to D21) and is delivered by the slices of its
[delivery plan](../../../ideas/specflow-engine/reusable-workflow-manual-execution/ask-agent-delivery-plan.md).
The mock is the Storybook set **SpecFlow/Screens/Ask agent (mock)**, the real routed screens with
the mock's Now block and dialogs; device pairing is in [Device pairing](device-pairing.md). Ask
agent adds no new surface: it lives in the Now block, its dialogs, the Close dialog and the Task
history.

**Data dependency (planned, not in the projection yet).** Per subject the UI needs: the agent
option of the startable step (already `next.agent`, available or unavailable with its reason); the
Session resolution of a start (fresh or continued, the archetype's provider and model, an
independent step); the paths that refuse a start; the agent attempt's Session id and title; its
Turn state (running, stop requested, ended without a finish, proposal refused with its reasons,
Continue refused with the changed paths); the attempt commit result (`postActions`); a pending owner
confirmation with the proposal's result and feedback; and the attempt's partial work. The exact read
model belongs to slices 6 to 9; this contract names only what the person must see.

### Start step and Ask agent

- On a ready step whose `executors` include `agent`, the action row holds **Start step** (main) and
  **Ask agent** (the one button-styled secondary, `bot` icon). A step without `agent` shows Start
  step alone, with no disabled Ask agent. Ask agent only starts an attempt; it is never offered
  during a person's active attempt.
- Ask agent stays enabled when the projection says the agent is unavailable: its dialog explains
  the precondition before anything is sent. It is omitted only for `not-an-executor`.
- **Open for the owner (A/B, recommendation A):** B is a split button (Start step with a menu of Do
  it myself and Ask agent), the sketch of the earlier "Later" note. It hides the agent behind a
  second click and needs a split button the design system does not have.

### Ask agent dialog

Title "Ask agent: <step title>". The description says what happens: the agent does this step of
<subject> on its own (reads the step, its documents and context, writes what the step needs and
proposes a result); decisions that need a person stay with the person. Then, in order:

1. **What blocks the start**, only when something does: one attention `Alert` per precondition with
   what, why and what to do; the footer adds **Check again** and **Ask agent** is disabled until the
   check passes:
   - **Uncommitted changes** (clean baseline): "Commit or undo these changes first", why ("the agent
     starts from a committed checkout, so that everything that changes afterwards is its own work"),
     the paths as the Close dialog lists them (five, then "and N more"), the checkout's folder with
     **Copy path**, "Commit them, or undo the ones you do not need, then check again." No discard
     action.
   - **No agent chosen** (`archetype-missing`, `provider-not-chosen`, `model-missing`): which agent
     role does the step, that the project names no provider or model for it, and where to choose
     them.
   - **Pairing code waiting** (D21, headless or `--pair`): "Agents are paused while a pairing code
     is waiting", why (no agent runs while the one-time code can be read), what to do (pair a device
     with it, or restart the Runtime without `--pair`).
   - `session-unavailable` (the definition continues a Session that is gone): what happened, that
     no new Session replaces it (D10), and to return or fix the definition.
2. **Session** (D18). The workflow decides; the dialog never offers fresh versus continued:
   - **New session with <provider>**: the provider mark and the Composer's model picker
     (`ModelEffortPicker`), preselected from the agent role; only model and effort change, and the
     choice is recorded on the attempt.
   - **Continues <Session title>** (a link): read-only, with its model and why ("the workflow
     continues the session that did <step> before"), "Its model stays as it is."
   - **Independent step** (a review facet): a new session with the picker and "<step> is done
     independently: it always starts in a new session, never in the one that wrote the change."
3. **Commit disclosure** (D15), always: an info note with the commit icon, "When the agent finishes,
   SpecFlow commits its work on `<branch>` as one commit; changes of others are never included."

Footer: **Cancel**, (**Check again**), **Ask agent** (primary, last; on top when stacked).

### Running attempt

- The position line names the attempt and its Session: "Attempt 2 · agent working since 12:52 ·
  <provider mark> <Session title>"; the title opens the Session. Goal, "Done when" and the hand-off
  stay as for a person's attempt; the viewer has no Finish step.
- The action row holds **Stop agent** (secondary, `circle-pause`). Return stays in ⋯ and cancels the
  agent's Turn (F13).
- **Stopping**: "Attempt 2 · stopping the agent · <Session>", the button **Stopping…** (disabled,
  `aria-busy`) and an info note with a spinning icon: the step stays locked until SpecFlow sees the
  agent's process has ended. It never says stopped before that proof; then it becomes "ended
  without a finish".

### After the agent's Turn

- **Finished and committed**: Now moves on to the next step; the hand-off is the agent's (result,
  feedback, "<provider> · <model>"); an info note with the commit icon, "The agent finished <step>.
  Committed `<sha>` on `<branch>`: N documents and N files." and **Show commit**.
- **Finished, commit failed**: the step is published, so Now moves on as above; an attention note
  (`role="alert"`) "<step> is finished. The commit failed (`<code>`).", that the files stay
  uncommitted on `<branch>` and Close lists them until committed, the paths, then **Retry commit**.
  It never says Close includes them.
- **Ended without a finish**: "Attempt 2 · the agent stopped without finishing · <Session>"; an
  attention note "The agent's turn ended without a result." with what Continue and Take over do; a
  quiet line "Kept so far: <documents as links> and N changed files. **See the attempt**". Actions
  **Continue** (main) and **Take over** (secondary); Return in ⋯.
- **Result refused when it was applied**: "… the agent's result was not accepted …"; a danger note
  (`role="alert"`) "The agent proposed <result>, and SpecFlow did not accept it:" with one bullet
  per reason in plain words (a changed file the agent did not list; a file without a document type,
  "Give it a type or delete it"; a document edited past SpecFlow; a gate; an open Task), then what
  Continue and Take over do. Same actions.
- **Continue refused, files changed between turns**: shown before the click: an attention note "The
  agent cannot continue: N files changed since its last turn." with the paths, and "SpecFlow never
  counts someone else's edits as the agent's work. Commit or undo these changes, then continue. Or
  take over and finish the step yourself." **Continue** is disabled; **Take over** stays.

### Pending owner confirmation (D17)

- "Waiting for your confirmation · the agent finished at <time> · <Session>"; under the step's
  purpose the proposal as a labelled quote ("The agent proposes → <result> · <provider> · <model>",
  then its feedback) and an info note with what Confirm applies ("Confirming approves 5 draft tasks
  (t-01 to t-05) and moves to <next>", **See Tasks**). Actions **Confirm** (main), **Reject**.
- **Reject** opens "Reject the agent's result": what stays (the drafts and documents it wrote) and a
  required **What should change** field, which becomes the step's hand-off. **Cancel**, **Reject**
  (disabled until the field has text).

### Take over (F17) and the attempt's history

- **Take over**, allowed once the agent's process is proven stopped, confirms: "The agent's attempt
  ends as taken over, and your own attempt N starts", **The agent's work stays** with its paths
  (nothing is undone; uncommitted until finished or committed), and the Session stays readable but
  no longer works on the step. **Cancel**, **Take over**.
- Then Now is a person's attempt: "Attempt 3 · in progress since 12:31 · started by you · taken
  over from the agent", with Finish step.
- **Task history and Activity history**: the agent attempt is an ordinary entry (step, result line,
  "<time> · <provider> · <model> · Attempt N", Attempt details). Its result line says how it ended
  ("Taken over by you", "Stopped", "Returned", or its result), then **Agent work kept**: Documents
  (links, saved or created), Tasks (drafts, or none), Files (the declared paths) and "N turns in
  <Session> · stopped by you at <time>" when that applies.

### Close: one Uncommitted changes group (D16)

The Close preview shows every path Close would refuse as **one** group, **Uncommitted changes · N**,
replacing the separate "Uncommitted specification files" group and the "Held by uncommitted files
SpecFlow wrote" outcome above once slice 1 lands. Explanation: "Closing starts from a committed
checkout, and SpecFlow never discards work." Then one sub-group per kind, each with its paths (five,
then "and N more") and its remedy, a kind without paths omitted:

1. **Agent work whose commit failed · N**: which step of which Task, the code, **Retry commit**.
2. **Saved in SpecFlow, not committed yet · N**: documents and Task changes SpecFlow saved, **Open
   Documents** to commit them (another Specification's files name it as a link, as today).
3. **Changed outside SpecFlow · N**: commit them with Git in the checkout or move them, the folder
   with **Copy path**, and the discard warning.

There is no discard action. Footer **Dismiss** and **Check again**.
