---
id: ideas.specflow-ui.screens.specification-creation
type: product
title: Specification creation, Documents and Session UX redesign
status: draft
scope: specflow
areas:
  - ui
tags:
  - specification
  - session
  - creation
  - worktree
  - mock
read_when:
  - reviewing Specification creation and manual or AI preparation in the demo
  - reviewing the Documents explorer and editor interactions
summary: >
  Owner-approved Create and Documents contract of the bounded demo: workflow-led single-column
  creation, first-session configuration, branch/worktree choice, preview-first documents in a larger
  Secondary, and folder-context inline file operations through bounded Runtime demo capabilities.
related:
  - ideas.specflow-ui.screens.specs-overview
  - ideas.specflow-ui.navigation-route-model
  - product.specflow.ui.interaction-model
  - product.specflow.ui.ai-session-ux
  - product.specflow.specification-creation
  - reference.api.specification-creation-demo
  - design-system.principles.system-boundary
---

# Create and Documents: UX contract of the demo

**Status.** The contract below is implemented in the bounded in-memory demo Runtime behind the
product API. Its screens are covered by Storybook stories and unit tests, but the demo has not had a
full manual walkthrough (physical keyboards, Android back, 200% zoom). The **project Runtime** Create
flow (real Git, worktrees, commits, progress page) is a different flow with its own authoritative
document: [Specification creation](../../../product/specflow/specification-creation.md). This
document stays in `ideas/` until the demo-only parts are either promoted or removed; it uses Polish
UI labels of the demo only where a label is quoted.

Nevo UI owns the look of controls and the App Shell. Prototypes and screenshots from the owner
handovers were used as examples of the task and the composition, never as a source of CSS, new headers,
mobile navigation or behaviour.

## Goal and path

The user chooses how to prepare the specification, names the change and chooses a workflow. The
workflow defines the required artifacts; suggested documents can be added later. A new specification
is a neutral scaffold, not ready-made requirements. The agent choice concerns the **first Session**
only; a specification can later have many Sessions with different agents. Documents belong to the
specification, not to a Session.

```text
Specs -> New specification -> With an agent / On my own
-> name + workflow + [first Session configuration] + branch/worktree
-> Create
   -> confirmed success: Session placeholder / Documents + toast
   -> error: the form is kept
   -> unknown outcome: reconcile the same operation, never a second Create
   -> specification exists, Session failed: Documents + retry of the Session only
Documents -> folder ... -> operation -> Runtime confirmation -> current tree
Editable document -> Preview -> Edit / Show preview icon -> the same current draft
```

Scope is the **in-memory demo Runtime**: no real Git/worktree, no provider execution, no durable
project operations. A project-mode Runtime never receives a mock of these capabilities.

## Regions

| Surface       | User question and hierarchy                                         | Composition                                                                               |
| ------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Create entry  | How do I want to work?                                              | Two large cards on a full page; no Secondary, no form in a modal.                         |
| Create config | What am I creating? What does the workflow need? Who starts? Where? | One Primary column: workflow description, first-Session setup (AI only), branch/worktree. |
| Documents     | Where is the file? What am I editing? Are there unsaved changes?    | Smaller Primary with the tree, larger Secondary with one active content.                  |
| Session       | Who do I work with? Where do I check the context?                   | Existing Session placeholder in Primary, one composer, general Context in Secondary.      |

Free space is not filled with extra metadata. Header, breadcrumb and document identity do not scroll
with the content; each region or editor has exactly one scroll owner. Proportions and breakpoints come
from `AppWorkspace`.

### Consistency with the application

- Navigation follows `ApplicationLocationIdentity` / `ApplicationContextLine`; the contextual Back/Close
  of a document is the host's Secondary Stack. No Back in a footer and no Back item in an overflow next
  to an existing one. Wide shows the route parent in the breadcrumbs, narrow uses the contextual Back.
  A local step (change of method) may have a contextual Back on wide too, because it is not a route.
- Back from the configuration returns to the method choice and keeps the data; leaving the method
  choice goes to Specs. A further Session returns to the Session list of its specification.
- Navigation keeps the incoming `collection`; only a newly created specification deliberately lands in
  Current.
- Loading, error and retry stay inside the standard Workspace with its header and Back; a refresh error
  never discards the draft.
- Leaving a changed configuration uses the DS Dialog (never `window.confirm`), protects significant
  changes (also model, mode or branch without a title and a further Session's setup), keeps data and
  focus on cancel, and pending or unknown operations still block a change (also before unload).
- The scroll viewport has no outer padding; padding has one owner (the content).
- On narrow, entering the form does not open the keyboard: focus goes to the heading or context.

## Create

### Entry and draft

- The first step is two fully active cards, **With an agent** and **On my own**. Wide: equal columns
  sized by the tallest content; narrow: stacked, icon next to the label, DS hit target and focus. No
  segments, radios or selects.
- The form is **Name, Workflow, first Session (AI only), Branch and worktree**, single column on every
  width. No Secondary, summary on the right, planned-file tree, upload or optional-file choice before
  Create.
- **Back to the method choice** keeps the name, workflow, branch/worktree and the last agent setup. The
  prompt is not sent from the form; the first message is written in the composer of the opened Session.

### Workflow and artifacts

One select for the workflow in the Primary column, the same in both paths: name, short description, the
really known flow and the text lists **Required** and **Suggested later**. No checkboxes on files and no
invented suggested documents in the tree. Create materialises the required documents; suggestions stay
suggestions until a document is added deliberately.

The data belongs to the Runtime catalogue (demo fixtures, clearly marked); the production workflow read
model is a missing dependency. A missing, stale or failed catalogue is not an empty workflow: it says why
Create is unavailable and offers retry without losing the draft.

### First agent Session

- The heading says **Initial agent Session**. Provider cards use the existing icons, name and profile;
  2 columns when the width allows, 3 only with a real catalogue and a wide Primary, 1 on narrow. No
  invented third provider.
- Model is a deliberate select without a forced choice; effort is a select beside it (below on narrow);
  Ask/Edit/Agent is one segmented selection matching the model's capabilities. A missing option is not
  hidden silently: unsupported values are disabled with a reason, a missing effort is described as a
  missing capability. Changing model or agent drops incompatible values.
- Connection, profile, availability and quota come only from a confirmed source. Unknown stays unknown
  (**No limit data**); a known value has a unit and a window. Example quotas, prices and versions from
  prototypes never enter the product. Demo fixtures are labelled as fixtures.
- An unavailable agent or a stale catalogue blocks an invalid configuration with a reason; the provider
  is never changed silently. Opening the Session only allocates an idle placeholder: no automatic turn.

### Branch and worktree

The shared section lists **New branch** first and preselected, then **Current: <branch>** (the real
name). A separate checkbox **Use a separate worktree** is ON by default when available and legal. The
new branch name is visible; the suggestion follows the title until the first manual edit and a manual
value survives back-navigation and method switches. `feature/{slug}` is a marked demo fixture pattern.

While the checkbox is available the current result is spelled out (**The specification will be created
in a new worktree on branch ...** or **... in the current folder ... on branch ...**). When the current
branch or a missing capability rules the worktree out, a concise note names the real place and the
reason instead of a dead disabled checkbox. A temporary pending or unknown state keeps the control
visible and blocks the operation; it is not a missing capability. In the demo, success only means a
prepared in-memory result, not an executed repository operation.

### Pending, success and recovery

| Outcome                              | Required behaviour                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pending Create                       | One request and logical operation; the CTA is disabled and double submit is guarded; the values stay.                                            |
| Confirmed manual success             | Straight to the Documents of the new specification, editing the first editable required document or a meaningful empty state.                    |
| Confirmed AI success                 | Straight to the initial idle Session with an empty composer; the context is passed by the system.                                                |
| Success (both paths)                 | A short accessible toast **Specification created**; no success screen, extra choice or blocking overlay.                                         |
| Validation or refusal                | The form stays with its data and configuration; the error sits at the right field or action.                                                     |
| Unknown outcome / lost response      | Recovery establishes the authoritative result of the same operation; no blind second Create; a retry reuses the same identity (idempotency key). |
| Specification exists, Session failed | Go to the Documents of the existing specification with **Could not open the Session** and a retry of the Session only; no second Create.         |

After a failed Create the values and the operation identity are kept; if the user stayed at the sent
action, feedback and retry are revealed in the existing scroll without capturing the scroll of a user who
moved away. An unknown outcome asks to establish the result, not to create again.

## Documents

### Regions and default document

The tree lives in the smaller Primary and one active document in the larger Secondary
(`split=secondary`); there is no third panel and no competing preview. The list holds only the files of
the specification; Markdown sections are headings of the content, not files.

Clicking a file row is the single ordinary way into its content. On narrow the standard **Secondary
Stack + Back** applies (no Files/Document tabs). Back, closing the panel and a breakpoint change keep the
selection, mode, draft, cursor/selection and scroll; a wide to narrow change hands the same active file
to the Stack and a deliberate Back is never undone by an automatic reopening. There are no competing
"Open document" and "Enlarge document" entries from the list, and a file row's own menu holds no copy of
its primary action.

An editable document opens in **Preview** using the whole content area. One compact bar identifies the
file and offers **one icon for the mode switch** (Edit / Show preview), using DS controls. The full path
stays reachable when a long name is shortened, through focus and deliberate touch (a `title` attribute
alone is not enough). Save and Cancel sit outside the scroll and stay reachable when dirty on narrow, as
directly named icon buttons, not only overflow entries. There is no extra footer saying "no unsaved
changes", no separate "Edit - Markdown" caption and no "Markdown - Ctrl/Cmd S" row: dirty, pending and
error states appear only when they carry information. Markdown has highlighting, a save shortcut,
history and ordinary selection; `.txt` is plain text. Fold gutter, line numbers and the active-line
background of `basicSetup` are switched off in the editor configuration (not hidden with CSS). Tab and
Shift+Tab keep normal focus navigation. **Save keeps the editor open with a clean draft**; it does not
switch to preview. After save or discard the focus stays at a sensible place in the editor or toolbar and
never takes back focus the user moved during the request.

Preview renders the current draft, including unsaved text; returning to Edit never reloads an older
version or resets the draft. A read-only format uses an allowed viewer or an explicit missing capability.

### Tree and folder actions

The root **Main** and every folder have a reachable **...** menu, the same by pointer and by touch. A
folder name click expands or collapses; the menu is a separate target. A file row and its menu are
siblings: no button in a button, no click that opens the file after a menu selection, no lost focus.

Folder menu: **New file**, **New folder**, **Upload files**, other operations only by capability. There
are no global "+ Document" / "+ Folder" actions, no permanent folder select and no dialog asking again
for the folder: the target is known from the context. The root cannot be moved, renamed or deleted. A
file menu offers **Rename**, **Move**, **Delete** by capability.

### Inline create and rename

After New file or New folder the menu closes, the target folder expands and a **temporary row** with an
input appears among its children and takes focus. It is a marked pending draft, not a durable file; only
one inline operation exists at a time and Enter plus blur never send two mutations.

| Event                                       | Contract                                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| New file `notes`                            | Without an extension the proposal is `notes.md`; the Runtime validates the result.                  |
| New file `notes.txt`                        | The explicit extension is kept; `.md` is not appended.                                              |
| New folder `plans`                          | No automatic extension.                                                                             |
| Rename an existing file                     | The name is explicit; `.md` is never appended automatically.                                        |
| Enter / non-empty blur                      | One request of the same operation; pending blocks a second send.                                    |
| Escape / empty Enter or blur                | Cancel without a request and without an entry in the durable tree.                                  |
| Invalid, duplicate, conflict, Runtime error | The name and the editable row stay with the error at the input; no phantom file.                    |
| Authoritative ACK                           | Only now the tree and indexes sync, the target element and focus follow; a new editable file opens. |
| Unknown outcome of a mutation               | Establish the result of the same operation before another create, so there is no duplicate.         |

Hidden or system names, trailing dots, separators, containment and case collisions are decided by the
Runtime validator, not by optimistic manifest manipulation in the UI. Supported formats are an operation
capability (`.md`/`.txt` in the demo), not a limit inside the component.

### Rename, move, delete and required paths

Rename prefers inline. Move picks an existing target folder through the DS Field/Select; it creates no
second global folder select. Delete asks for a confirmation naming the file or folder and the effect;
afterwards focus and the active document match the outcome, a deleted file never stays visible and a
cancel mutates nothing.

A required path is workflow policy. Delete, rename or move of a required file is blocked when it would
break the path, with a readable reason; the same protection covers its **ancestor folders** (also
recursive delete and renames that change the required path). The check lives in the Runtime, so a direct
request cannot bypass the disabled menu. A missing capability has a reason, never a button that fakes
success.

Every action that can change the active document or drop its content (new file, upload, rename, move,
delete, another file, navigation) goes through **Save / Discard / Cancel**. A failed save keeps the dirty
draft and stops the mutation; cancel keeps position and focus; an idempotent result does not reset the draft.

### Upload after Create

**Folder ... -> Upload files**: the native picker inherits the target folder and import exists only in
the Documents of an existing specification. The demo accepts UTF-8 `.md`/`.txt` within the batch and size
limits of the Runtime contract. A duplicate full path is not overwritten; every skipped file has its own
real reason (batch limit, size, format, read/UTF-8, path collision). Pending reads and writes block
colliding mutations and entries appear after the ACK. There is no frontend `fs` write, manifest editing or
self-made "durable upload", and the content is never sent to an agent automatically. PDF/DOCX and other
formats are outside the capability.

### Empty folders

The demo Runtime authoritatively keeps an explicit set of folders, empty ones included, **until the
process restarts**; the UI does not promise anything beyond that and there is no `.gitkeep`. The durable
policy for empty folders in a project is blocked on an Engine decision.

## Session stays a placeholder

No conversation, streaming or execution is designed here. The Session keeps its full Primary, a compact
provider identity and one composer. Opening sends nothing; a mock without an engine has a disabled Send
with a reason. The SpecFlow system context is independent of user text and never appended as a user
message. Secondary holds a general **Context** in which documents are one item beside the project and
instructions; drill-down and Back, and the trip to Documents and back, keep the composer draft. The open
Context action is needed on narrow or after the inspector was closed, not beside an already visible panel.
A further Session of an existing specification speaks about **this Session**, never about a "first" or
"initial" one or about creating the specification again.

## Components and owners

Nevo UI owns the look of the controls. The tree and the inline state are a deliberate product
composition of existing primitives (no local copy of Button/Menu, no new general DS Tree capability).

| Region                  | Existing pattern                               | Decision                                                                         |
| ----------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| Shell, regions, scroll  | `AppWorkspace`, `WorkspaceHeader`              | Reuse; Create is Primary only, Documents is `split=secondary`; no extra wrapper. |
| Mobile                  | Secondary Stack                                | The existing Stack; no prototype tabs.                                           |
| Two method cards        | Button/surface primitives                      | Product navigation cards; not a new SegmentedControl variant.                    |
| Workflow, model, effort | `Select`                                       | Reuse; the catalogue projection lives in SpecFlow.                               |
| Branch, worktree, modes | `RadioGroup`, `Checkbox`, `SegmentedControl`   | Radio for the branch, checkbox for an available worktree, segments for modes.    |
| Tree menu               | `Menu`, `OverflowMenu`, `IconButton`           | Product row + separate trigger; required policy comes from the Runtime.          |
| Document                | `MarkdownDocument`, the Markdown source editor | Read-only `MarkdownDocument` for the draft preview; the product editor edits.    |
| Feedback                | `Toast`, `Alert`, `Dialog`                     | Toast after success, inline errors, the existing guard dialog.                   |
| Session                 | `MessageComposer`, `SessionProviderIcon`       | Keep the placeholder and Context; no second engine.                              |

## Integration and dependencies

The API and payloads are owned by [the demo creation API reference](../../../reference/api/specification-creation-demo.md);
this document describes effects and requirements and does not copy endpoints.

| Capability                             | State in the demo                                                                             | Production boundary                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Create, location, Session allocation   | Existing demo with required-only documents, workflow projection, pending and partial recovery | No Git or provider execution; a production workflow read model is not confirmed. |
| Document create, import, save, folders | Demo API; the UI consumes the result, revisions and idempotency                               | Persistence and ingest have a later owner.                                       |
| Rename, move, delete, required paths   | Bounded Runtime demo commands, projections and contract tests                                 | Index, reference and lock consistency is not claimed for production.             |
| Empty folder                           | Runtime-memory lifetime                                                                       | Blocked on a durable Engine policy; no `.gitkeep`.                               |
| Quota and connection source            | Demo fixture or unknown, never pretended limits                                               | A real read model and fetch are out of scope.                                    |

The implementation must not bypass these dependencies with local manifests or success before the ACK.

## Acceptance checklist

Verification evidence lives in the stories and tests next to the code (Create, Documents explorer and
editor, Secondary Stack); this list only names what must hold, so each item is checked at 320, 390, tablet
and wide widths, with long names and at 200% zoom where the layout depends on it.

- Both Create cards open both paths; wide cards are equal, narrow cards stack; Back keeps shared and AI data.
- No documents, checkboxes or import appear before Create; the workflow comes from the catalogue.
- The agent applies to the first Session only; provider and quota facts are real or unknown; model, effort
  and mode follow the capabilities.
- New branch is first and preselected; the separate worktree is ON when legal; the result and the reasons are
  stated; pending blocks double submit.
- Success goes straight to the destination with a toast; errors keep the form; unknown outcomes reconcile
  the same operation; a failed Session after Create retries only the Session.
- Documents: small Primary tree and large Secondary document, narrow Stack with Back and a kept draft;
  preview first with one mode icon; preview shows the current draft; save goes through the Runtime.
- No global add or folder select; root and each folder have a menu with New file, New folder, Upload;
  file rename, move and delete follow the capabilities and the required-path rules (also for ancestors).
- Inline create and rename: right folder, autofocus, one submit for Enter plus blur, Escape and empty cancel
  without a request, extension rules, errors keep the input, the durable element appears after the ACK.
- Name and menu are separate click, tap and focus targets; long names, small widths and zoom cause no
  overlap or horizontal scroll.
- An independent review reports real PASS, FAIL, BLOCKED or NOT VERIFIED with the evidence and the limit of
  its scope; a real Engine, Git or provider and the missing production policies get no pretend PASS from
  tests of the demo adapter.
