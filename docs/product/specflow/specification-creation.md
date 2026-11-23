---
id: product.specflow.specification-creation
type: product
title: Create Specification and select its workspace
status: current
scope: specflow
areas: [ui, workflow]
read_when:
  - designing the Create Specification screen
  - describing branch defaults, target selection or workspace placement
summary: >
  Create form choices, accessible blocked submission and workspace/branch defaults;
  links to the separate Git refusal and progress/retry owners.
related:
  - reference.api.specflow-specification-operations
  - reference.api.operation-progress
  - architecture.runtime.specflow-lifecycle
  - product.specflow.specification-create-admission-and-errors
  - product.specflow.specification-create-progress
---

# Create Specification and select its workspace

## Related Create contracts

- [Git admission and error feedback](specification-create-admission-and-errors.md): protected branches,
  not-applied refusals and uncertain outcomes.
- [Submission, progress and return paths](specification-create-progress.md): immutable operation identity,
  status monitoring, progress steps and reopening the retained draft.

## User choices

Creating a Specification requires a title (maximum 200 characters at HTTP). The three placement
choices are: **Current project checkout** (primary), **Existing workspace**, or **New workspace**
(managed Git worktree when available). A field being optional in the API does not itself mandate
a corresponding visible control in UI.

The **Create** action and the one reason it is unavailable (or the note about what Create does)
stay visible at the bottom of the screen at every width, on one line (the hint first, the action at
the end), in a bar as high as the navigation's account row; only the form above them scrolls. What
went wrong after a submit is explained at the end of the form, above that action.

**Layout.** The form is shown in the Focused frame (the design-system Bounded workspace rule). It is
one column below a 992 px form column (`62rem`) and two columns from it. The threshold is a container
query on the form column, never a viewport breakpoint: whether the navigation is open or closed,
at any window width or zoom, the form is two columns exactly when its column is at least 992 px
wide (a phone or 200% zoom is always one column). The left
column holds what is created: the name, the goal and the archetype with its documents. The right
column holds where it is created: the workspace place and its Git settings. DOM order is the reading
and keyboard order: Tab moves through the whole left column, then the right column, then the Create
button. Below the threshold the form keeps its reading column (`content-form`, left-aligned); from it
the form grows to at most two control widths and the gap between them (72rem), left-aligned, and the
Create button still ends on the form's edge. There is no preview panel and no Secondary. Controls
keep their maximum widths however wide the frame is: text inputs and text areas, the Git rows and
their fields, and the agent's provider cards and fields stop at about 34rem. In two columns each
column is at most 34rem, so everything in it, the workspace tiles included, shares one edge; in one
column the workspace tiles span the reading column (three side by side when it is wide enough).

**When Create is blocked.** A Create blocked by the form's own values stays a focusable submit button
marked `aria-disabled="true"` (it is announced as unavailable, never `disabled`). Activating it
(click, Enter or Space), or pressing Enter in a field, never submits and sends nothing: it announces
the blocking reason in the form's live region and moves focus to the first faulty field in the
form's order (the name, the archetype, then the workspace and Git fields: the tile, the existing
workspace, Start from, Merge into, the slug, the branch name), brought into view with its message.
The pinned footer sits under the scrolling form, never over it, so a field in view is never
covered.
The footer hint has a quiet **Go to the field** action that does the same. With several problems at
once it always leads to the first one in that order. Fields validate inline with `aria-invalid` and
a message tied to them by `aria-describedby`; a missing value (the empty name, an empty picker) is
flagged only once the owner typed and left the field empty, or tried Create, never before. A reason
no field can fix (options or archetypes loading, no permission, nothing installed) is named in the
footer without the action. Locked states (no permission, an operation in progress) still disable the
button.

**First-run availability.** A confirmed unavailable catalogue takes precedence over missing user
input: entering a name cannot repair definitions. The blocker belongs directly under Archetype,
not in a top-level alert or duplicated pinned-footer panel (owner refinement of package B).
Show a disabled field without an empty list affordance, one compact explanation and **How to add an
archetype?** (invalid definitions: **How to fix it?**). Keep name and goal editable. Create remains
unavailable and is associated with the inline reason through `aria-describedby`; activating it sends
nothing and does not blame the name field while project configuration blocks creation.

The instruction opens the existing responsive details pattern (right Drawer in split layout,
bottom sheet in stacked layout). Missing definitions: name Project Home and the non-overwriting
`nevo-specflow definitions install --add-missing` remedy, then refresh. Invalid installed definitions:
run `nevo-specflow definitions validate` and repair the reported files under `.nevo/definitions`.
The installer does not repair edited invalid files. Keep technical commands behind the details
action. A failed refresh explicitly reports failure, retains the draft and offers Retry. After
successful recovery, focus moves from a disappearing refresh control to the selected/first radio
only when the user has not moved focus elsewhere. Engine authorization and commit policy remain
authoritative for every command. Pending reads, failed reads and unavailable options stay distinct.

When New workspace is disabled because managed Git is off, its existing explanation identifies
`git.enabled: true` in Project Home's `.nevo/config.yaml`, saving the change in Git and refreshing the
options. It does not promise that enabling Git bypasses branch policy, filesystem availability or
other Engine checks. The three workspace cards keep their existing layout and selection behavior.

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

**Committed configuration of the starting point.** Before submit, every offered starting branch
reports whether its commit contains a regular `.nevo/config.yaml`, valid YAML and a `runtime`
object. The starting-branch picker gives the full option width to the branch name, followed by its
workspace metadata and then an explicit **Unavailable** danger badge with a short cause. Long branch
names wrap in full. Selection uses the shared Select/Combobox background and left accent; it takes
no column or checkmark gutter. This does not change the workspace cards.
An unusable branch stays visible but cannot be chosen by pointer or keyboard; this never depends on
whether the person reads its explanation. The badge identifies a blocking availability state, not
branch metadata or a warning that can be ignored. The cause names the specific reason:
missing file, non-regular file, invalid YAML or missing runtime configuration. The selected source has a short actionable error on the Start from row (also used by the footer):
"Cannot start from this branch. Choose another branch." A quiet **Why?** action opens the existing responsive details pattern: a right-side Drawer in
split workspace layout, a bottom sheet in stacked layout. It explains the problem only when requested: a new workspace starts from a saved commit and
needs SpecFlow configuration; uncommitted configuration changes in the current folder are not
copied. It states the specific configuration defect, then offers choosing another starting branch or fixing
`.nevo/config.yaml` and saving the change in that branch’s Git history (commit). Create
stays unavailable and leads to Start from using the existing blocked-submit focus guidance. If the
configured or remembered source is unusable, activating Create or submitting with Enter prepares and
sends no creation request. Detailed repair instructions stay in **Why?**, rather than in every option.
When the selected source is usable but other branches are not, the opened source row offers
**Unavailable branches** with the same explanatory Drawer and repair guidance. The person can inspect
that guidance without selecting an unusable branch.

When the configured source and every listed branch are unusable, Start from instead shows a
danger-colored blocking message above its value or picker: **Cannot create a new workspace. No
branch has valid SpecFlow settings.** Its **How to fix it?** action opens the same responsive
Drawer with repair and refresh instructions; neither the field nor its footer prerequisite
suggests choosing another unavailable branch. The picker remains inspectable, with all options
unavailable, and Create/Enter still send no request. A usable configured tag or commit prevents
this state even when all listed branches are unavailable.

In this all-unavailable state, the picker uses the message-only invalid appearance: its visible
error and accessible invalid/error associations remain, with a neutral resting border and one
normal focus border. The text-sized details action uses the action color, hover and focus
feedback. The Drawer opens with the specific cause, followed by **What this means** and **What
to do**; it does not repeat the form's blocking message.

The initial starting point prefers the configured default when usable (including `HEAD`, a tag
or a SHA); otherwise it prefers the usable integration branch, then the first usable local branch.
If none is usable, the configured default stays visible with the blocking explanation. An automatic
alternative is sent as an explicit `target.baseRef` override, so the displayed source and the source
Create uses always agree. Change prefills this preferred value and Restore default returns to it.
This check concerns only the starting commit of a **new workspace**; adding a Specification to an
existing/current checkout is unaffected. The Engine repeats the same check at admission, and
`GIT_BASE_CONFIG_MISSING` retains its dedicated post-submit explanation for a changed base.

**Merge into** names a **workspace** (the contract's `integrationTargetWorkspaceId` is a workspace
pin; the default is the primary workspace on the project's integration target branch): show the
workspace as the primary text and its branch as a secondary branch chip. **Start from** and
**Branch name** are branches. The settings of a new workspace are **three decision rows**: Start
from, Merge into and Branch name, under a quiet label that says whether Create uses the defaults or
which of them were changed. Each row shows its label, the value Create will use and one quiet text
action: **Change**, or **Restore default** while the row is changed. Changing Start from or Merge into
replaces the value with its picker in the row; changing Branch name reveals the slug and branch
fields under the row directly (no further switches). All three actions look the same, and each is
named for its row, starting with its visible text (for example _"Change: Start from"_). On a narrow
screen the label and the action share the first line and the value takes the second. The rows sit
in the section without an accent container, new separators or switches. Every branch in the section
uses one shared presentational piece (`BranchRef`: one icon size, the `code-md` token, no
parenthesised or colon variants). A caveat about the default merge target (for example uncommitted
changes in the primary workspace) is a quiet inline note on the Merge row; it never blocks Create.
A row with nothing to choose from (no local branch to start from, no workspace that can be a merge
target) has no action and says why on the row. Under the rows, quietly: where the files are
committed (Git enabled, see [commit presentation](specification-create-admission-and-errors.md)) and the worktree folder as one truncated line with the full path
as its tooltip.

**Uncommitted changes in a merge target.** Creating the specification is not affected. What it
affects is closing/integrating the specification into that workspace later: the Engine refuses to
integrate into a checkout with uncommitted changes (untracked files included) so as not to touch
the owner's work. The copy says exactly that in plain words and gives the action: _"This workspace
has uncommitted changes. You can still create the specification; commit or stash them before
merging into it."_ The same fact reads consistently everywhere the reason appears for a merge
target (the Merge row note, the unavailable item in the target select, the "unavailable as a
target" list, and the merge-back suggestion); there is no vague "not
available now" wording, and it stays a quiet inline note, never an alert.

**Change** starts each setting (Start from, Merge into, slug and branch name) from the **effective
default prefilled** (the listed ref of the default base, the default target workspace, the slug
derived from the name and the generated branch), so the user only adjusts it. An untouched or
default-equal value is never sent as an override (an explicit merge target would become an
immutable pin, omission follows the project); only a value that differs is. **Restore default**
restores the default and forgets the typed or picked value. A message about a value the owner has
to fix names the row action, never a switch, for example _"Choose a starting branch or use
“Restore default”."_

The optional `slug` names the Specification folder, the worktree folder and the generated branch
(`branchPattern` with `{slug}`). It is lowercase kebab-case ASCII (at most 80 characters, the
rule the Engine uses for derived slugs, shared as `deriveSpecSlug`/`specSlugProblem` in
`@nevo/specflow-contracts/specs`). The UI previews the slug live from the name until the user
edits it and validates a typed one inline; a taken slug answers `CREATE_CONFLICT` and is shown at
the field. The final branch and worktree location still belong to Engine: the UI shows only a
**preview** built from `branchPattern` and the slug, and it never promises that later integration
will succeed. The preview never shows template tokens such as `<key>`: a part that exists only once
the Specification is created (the key `{key}`, numbered at reservation, the optional random id
`{shortId}`, or the slug before there is a name) is written as a word in its own quiet style
(_feature/key-payment-limits_, with _key_ set apart) and a quiet note says what it is (_"The
specification key is assigned when it is created."_). In a sentence the same part is an ellipsis
(`feature/…-payment-limits`). The preview wraps rather than hiding its end.

**Goal** is sent as `goal`, persisted in the Create journal and written to the Specification
overview scaffold. The progress page shows it shortened (the first 160 characters, as one line of
text) and the field's help text says so; the full goal stays in the overview. The scaffold marks the
section with a comment under `## Goal` telling an agent that it is the initial goal from creation
and may be refined or rewritten freely.

## Workspace names and worktree folder

Every workspace in create-options has a `name` (checkout folder; the primary checkout uses the
repository folder) and a `path`; the UI shows the name instead of a generic "Current folder" or
"Workspace" label wherever a workspace is referred to. The new-workspace summary shows the effective
`worktreesRoot` as a read-only "Worktree folder" row, with a quiet note when it does not exist yet.

## Demo mode

A Runtime started with `--demo` serves Create through the bounded in-memory
[demo creation API](../../reference/api/specification-creation-demo.md): no real Git, worktree or
provider execution. The project Runtime never receives these capabilities. The demo Create keeps the
layout rules here and the linked [admission/error](specification-create-admission-and-errors.md) and
[submission/progress](specification-create-progress.md) contracts, and adds a method choice and a first Session.

The method choice, and with it **Create with an agent**, exists **only in demo mode**. The project
Create form has no method step and no agent fields, and the project Create operation allocates no
Session: a project Specification gets its first Session from New Session afterwards. Create with an
agent on a project Runtime is an open item in the
[SpecFlow UI ideas backlog](../../ideas/specflow-ui/README.md#open-items-without-their-own-document).

- **Method choice.** The first step (**Creation method**) is two fully active cards, **With an
  agent** (start a Spec Writer session) and **On my own** (create the archetype's documents and edit
  them). Wide: equal columns; narrow: stacked. No segments, radios or selects. **Change the way of
  working** returns to the choice and keeps the name, archetype, workspace choice and the last agent
  setup. Leaving the method choice returns to the Specifications list.
- **Form.** Name, archetype and the workspace place as in project mode; with an agent also the
  **first Session**: provider tiles and the labelled Model, Effort and Work mode fields (the Session
  start form groups the same fields, [Full Session](ui/full-session.md)). The agent applies to the first
  Session only; a Specification can later have many Sessions with other agents. Provider facts
  (availability, limits) come only from a confirmed source; unknown stays unknown. No prompt is sent
  from the form: the first message is written in the opened Session.
- **Action and outcome.** The button reads **Create and open session** or **Create specification**.
  On success the user goes straight to the destination with a short toast **Specification
  created**: with an agent to the allocated Session (`/sessions/:sessionId`,
  an idle Session with an empty Composer; no Turn starts automatically), on my own to the
  Specification's Documents, opening the first editable required document when there is one. An
  unknown outcome reconciles the same operation and never sends a second Create. When the
  Specification exists but the Session could not be opened, the user lands in its Documents with a
  Session recovery notice that retries only the Session.
