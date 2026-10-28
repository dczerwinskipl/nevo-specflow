---
id: product.specflow.ui.documents-archetypes
type: product
title: Documents and Create with archetypes (UI)
status: draft
scope: specflow
areas: [ui]
tags: [documents, archetypes, requirements, create, editor]
read_when:
  - changing how the UI presents the archetype catalogue, document tree, document read or document operations
  - changing the Documents tree, its overview state, the New document or Assign type flows
  - changing the Archetype part of Create Specification or its progress page
  - changing read-only, save, conflict, image or binary states of a document tab
summary: >
  Product behaviour of the UI for Specification archetypes and documents on the existing screens: the Documents tree
  (registered, unclassified, dangling, protected overview, unmet requirements, Close-refusing issues),
  New document from a type and Assign type, the Archetype section of Create and its progress rows, and
  the document tab states (read-only reason on open, save, revision conflict, image, binary,
  missing file; tab labels stay file names).
related:
  - product.specflow.specification-documents
  - reference.api.specification-documents
  - product.specflow.ui.documents-editor-mode
  - product.specflow.specification-creation
  - product.specflow.ui.interaction-model
  - design-system.principles.layout-and-containment
  - design-system.principles.information-hierarchy
---

# Documents and Create with archetypes (UI)

`status: draft`. Recommended design, prepared for owner review. The product behaviour is owned by
[Specification archetypes and documents](../specification-documents.md) and the exact shapes by
[the HTTP contract](../../../reference/api/specification-documents.md) (both draft, PR #92); this
document owns only how the existing screens present them. It extends
[Documents editor mode](documents-editor-mode.md) and
[Create Specification](../specification-creation.md); everything those documents say stays in force
unless a section below replaces it.

Mock: Storybook `SpecFlow/Screens/Documents archetypes (mock)`
(`packages/specflow-ui/src/mocks/documents-archetypes/`). It uses the real AppShell, AppWorkspace,
WorkspaceHeader, ItemTabs, Dialog and tree recipes with static data; the Narrow stacked document page and
the Create shell are hand-composed approximations. **The Narrow stacked document page must be checked
against the real AppWorkspace during implementation:** there, Back is an icon button in the stacked
Secondary header, not the text button the mock draws above the content.

## 1. Scope

In scope, on existing screens only:

1. **Documents** tree and its idle (nothing open) state: registered documents with their type,
   unclassified files, dangling registry entries, the protected `overview.md`, unmet requirements,
   Close-refusing issues, **New document** from a type, **Assign type**, **Remove registration**.
2. **Create Specification**: the Archetype section of the form (both the project and the demo form), and
   two new rows on the progress page. The method choice, the workspace-place section, the footer and the
   progress steps do not change (one copy line excepted, see 7).
3. **Document tabs**: read-only with a reason shown on open, save (acknowledged once written; busy, success,
   conflict and other refusals), image and binary tabs, a tab for a missing (dangling) file, and tabs
   that follow an id change. Tab labels stay file names (today's rule).

Out of scope: owner-defined catalogue authoring (D-config), switching the archetype of an existing
Specification, adding own files at Create (`addedDocuments`), import (upload keeps today's behaviour,
files arrive unclassified), split view, history of a document.

## 2. Decisions (one design per screen)

| #   | Decision                                                                                                                                                                                                                                                                                     | Rejected alternatives (one line each)                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | A registered tree row **always shows its type as a quiet trailing label** (`login-flow.md · UX`, also `ux.md · UX` and `overview.md · Overview`); only a narrow row hides it as a whole.                                                                                                     | Type only when the name does not say it: read as inconsistent in use (the type appeared only after a rename). Type only in a tooltip: hover-only, unreachable on touch.                                                                           |
| D2  | **Unclassified** rows carry no label (their menu offers **Assign type…** first; Expected documents names what is missing); **dangling** rows keep their place in the tree with the warning glyph and `File missing`. Neither is grouped separately.                                          | A separate "Unclassified" / "Missing" group: moves files away from their folder, the user no longer finds them where they are on disk.                                                                                                            |
| D3  | The tree pane starts with what needs the user, and only that: Close-refusing **issues** (attention Alert), then **Expected documents** listing **unmet requirements only**, each with **Add**. When nothing is unmet and nothing blocks Close, the region does not exist.                    | A permanent completeness summary ("3 of 3", a progress bar, a green check): reads as approval or "done", which the product explicitly forbids. Showing met requirements too: noise for every built-in archetype (only `overview: 1`, always met). |
| D4  | **New document** is a type chooser (radio list: title + "use when", grouped "Suggested by <archetype>" / "Other types" / "No type"), a pre-filled editable **File name**, and the type instructions behind a disclosure. One `Dialog` at every width (see the scroll gap in section 11).     | Inline file-name entry in the tree (today): cannot carry a type, which is what satisfies a requirement. A type select: hides "use when", the criterion for choosing. A wizard: two steps for one decision.                                        |
| D5  | **Assign type** reuses the same chooser without "No type" and without a file name.                                                                                                                                                                                                           | Inline type select in the row: no room for "use when" in a 280-360 px tree.                                                                                                                                                                       |
| D6  | **Create** shows archetypes as a **radio list** (title + `useWhen`), then for the selected one its instructions behind a disclosure and **Documents to create** as checkboxes (preselected ticked). The archetype `description` is not repeated: the checklist already says what it creates. | Keep the select (today): hides `useWhen`. Choice tiles (as the workspace place): need an icon per archetype the catalogue does not have, and three tall tiles of long text. Keep the workflow phases: the real backend has none.                  |
| D7  | A tab shows **why it is read-only as one quiet line at the top of the document, on open**; the Edit action is not offered. The tree repeats the Specification-wide reason once above the tree.                                                                                               | A disabled Edit with a tooltip: hover-only, discovered late. Failing on Save: explicitly forbidden by the contract (UI impact 10).                                                                                                                |
| D8  | **Save** stays the promoted primary action; while the save runs it reads `Saving…` and is disabled, the editor stays editable, the dirty mark clears only on the response. A refusal is an Alert at the top of the document that keeps the draft.                                            | A toast for the conflict: transient, while the draft is at risk. A modal: blocks copying the user's own text.                                                                                                                                     |
| D9  | Image and binary files open as tabs like any document: image fit-to-area from `raw`, binary as a short file information list with **Download**. No Edit, no Save, never dirty.                                                                                                               | Opening binary files as a direct download: the user loses the tab context and the path.                                                                                                                                                           |

Tab labels keep today's rule (`documentTabs.ts`): the **file name**. The derived title
(`DocumentContent.title`) is the document's heading and part of the tab tooltip; it never renames a tab.

## 3. Documents tree and overview state

### 3.1 First scan (tree pane)

Ordered questions and their answers:

1. **Does something stop me from closing this specification?** Close-refusing issues (attention Alert),
   only when `issues[]` has `path-case-collision` or `archive-limit`.
2. **Can I change anything here?** The read-only reason line, only when the Specification-wide
   capabilities are all unavailable (existing behaviour, re-keyed reasons).
3. **Does the archetype expect a type that is missing?** Expected documents, unmet requirements only.
4. **What files are there, and what is each?** The tree.

Everything else is deeper: the type description and instructions (chooser), the path (tooltip / Show
path), revision, size and media type (binary tab only).

### 3.2 Layout

Unchanged geometry of [Documents editor mode](documents-editor-mode.md): tree in Primary
(`primaryMaxPx` 360), document area in Secondary; Narrow stacks. The new top region lives inside the
tree's scroll area, above the tree, so it scrolls away with it and costs nothing when empty.

```text
[Documents                         ...]   header: New document… / New folder / Upload files (menu)
 Single sign-on · Documents                context line (existing)
 ┌ ! Closing this specification will  ┐    attention Alert, only with Close-refusing issues
 │   be refused                       │
 │ • Two files differ only in letter  │
 │   case: notes/meeting-….md         │
 │ Fix this in the folder (for example│
 │ with Git), then refresh.           │
 └────────────────────────────────────┘
 Expected documents                        label-sm, only with an unmet requirement
 Team feature expects these types. Only file presence is checked.     body-sm muted
 Decisions   0 of 1               [+ Add]   Add only while capabilities.createFile is available
 ──────────────────────────────────        divider (only when the region above exists)
 SPECIFICATION DOCUMENTS            (o)   root section header (no chevron); small spinner while an operation runs long
 v architecture
     login-flow.md                    UX
     sequence.png                   Note
 v notes
     meeting-2026-10-20.md
     token-sample.bin
 ! backend.md               File missing   (warning glyph and label in attention tone)
   behaviour.md                Behaviour
   overview.md                  Overview
   ux.md                              UX
 1 entry in the folder could not be read.  muted line (skipped-entry; not shown as a Close refusal)
```

- **Wide (≥ 1080) and Compact (840-1079):** as above; Compact keeps the tree at 1/3. The trailing label
  uses the existing trailing-label track of the row (today's "Required" slot). **The state label (File
  missing) never hides: the file name truncates instead** (full name in the tooltip and Show path).
  Only a type-title label (UX, Note) may hide below the row's `@3xs` width.
- **Narrow (< 840):** the tree page is the same column at full width; nothing moves into a drawer.
  Verified at 390 px: no horizontal overflow, labels visible.
- **Ultra-wide:** unchanged; the tree stops at 360 px, the document gets the rest.

Order is unchanged (folders A-Z, then files A-Z); state never reorders. Dangling entries are placed at
their registered path.

### 3.3 Row grammar

| Entry                     | Glyph                        | Name             | Trailing label (muted unless noted) | Row press                      | Row menu                                                           |
| ------------------------- | ---------------------------- | ---------------- | ----------------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| Registered                | `file` (images too)          | file name        | type title (`UX`)                   | open tab                       | Rename, Move, Delete                                               |
| `overview.md` (protected) | `file`                       | file name        | type title (`Overview`)             | open tab                       | only the note with the `protected` reason (no dead disabled items) |
| Unclassified              | as above                     | file name        | none                                | open tab                       | **Assign type…**, separator, Rename, Move, Delete                  |
| Dangling                  | `triangle-alert` (attention) | file name, muted | `File missing` (attention tone)     | open a missing tab (3.6 / 5.5) | **Remove registration** (danger)                                   |

Every item of a row menu has its icon (New document, New folder, Upload files, Assign type, Rename, Move,
Delete, Remove registration). Other disabled items keep today's pattern: the menu note carries at most two
distinct reasons of the ActionReason set.

The tree starts with a root section header, **Specification documents**, that never collapses. Files of a main
folder without subfolders start at the row edge: they are not indented as if they were in a folder. A tree
operation that takes longer than a moment shows a small spinner in that header (never a text line under the
tree); its result is a toast, its failure stays where it was started. A rename the file system refuses because
only the letter case changes ("Renaming only the letter case is not supported on this file system.") is shown in
the rename field with the typed name kept; the UI does not block it in advance. After a refusal the message
never suggests refreshing when a refresh cannot help.

### 3.4 Unmet requirements (Expected documents)

- Source: `completeness.requirements[]` where `satisfied` is false, in catalogue order. Text:
  `<type title>   <count> of <minCount>` and an **Add** button (ghost, `plus`) whose accessible name is
  `Add a <type title> document`. Add opens New document with that type selected.
- **Add follows `capabilities.createFile`**: when it is unavailable (read-only Specification) the Add
  button is not rendered and the requirement row stays as information; the read-only line above the tree
  gives the reason.
- Helper line names the archetype (`tree.archetype.title`, else the id) and states that only file
  presence is checked. Never a check mark, never success colour, never a percentage, never "complete".
- When every requirement is satisfied, the whole region (heading, helper, divider) is absent.
- Unclassified files do not count (the contract counts registered files only); the region does not
  mention them, their rows do.

### 3.5 Close-refusing issues and skipped entries

- Source: `issues[]` with code `path-case-collision` or `archive-limit` (the codes `tree.ts` and the
  API reference say make Close refuse). The other codes (`dangling`, `unclassified`,
  `requirement-unmet`) are shown in rows or in Expected documents and are never listed here.
- One attention Alert titled **Closing this specification will be refused**, one bullet per collision path
  and one generic bullet for the archive limit, then the remedy line. No action button: the fix happens on
  disk.
- `skipped-entry` is **not** in that Alert: it is a neutral muted line after the last tree row, "N entries
  in the folder could not be read." (count from `skippedEntries`). The contract is inconsistent on
  whether it refuses Close; until the contract settles it, it is not presented as a refusal. If it does refuse, the line moves into the Alert.
- `truncated: true` adds a muted line after the last tree row: "Only the first entries are listed."

### 3.6 New document, Assign type, Remove registration

**New document** (header menu `New document…`, folder menu `New document…`, Expected documents **Add**):

- Title `New document`; description `In <folder>` or `In the main folder of <specification>`.
- Type chooser: `RadioGroup` of `RadioGroupOption` (label = type title, description = type `useWhen`).
  Groups (label-sm text, not headings): **Suggested by <archetype title>** = optional templates of the
  Specification's archetype; **Other types** = remaining catalogue types; **No type** last (creates an
  empty file without a type). `overview` is never offered. After the title, a muted fact when it helps
  the choice: `Expected · <count> of <min>` only while that requirement is unmet, else
  `<n> in this specification` when n > 0.
- Initial selection: the type passed by Add; else the first suggested type that is not present yet;
  else the first suggested type.
- **File name**: pre-filled with the template `filename`, else the type `defaultFilename`, else
  `<type id>.md`; editable; `.md` appended when no extension (today's rule); only the extensions in
  `capabilities.formats` (`md`, `txt`) are accepted; the existing name validation and collision check
  apply. Changing the type replaces the name only while the user has not edited it.
  Helper: "The type decides what the document counts as; the name is free."
- Guidance: a `Collapsible` "How to write a <type> document" with the type `instructions` and, when a
  template is used, the template `instructions` as a second paragraph. Closed by default; never stored.
- Footer: Cancel / **Create**. Create sends one document (`type`, `templateId` when the archetype has a
  template for the type, path) and, on success, opens the new document as a new tab **in edit**
  (today's rule for a new empty file) and announces it.
- One `Dialog` at every width; the body must scroll while header and footer stay. Measured in the mock
  at 390 × 844: the dialog is 810 px high with 934 px of content, `overflow: hidden` and no scrolling
  region, so **Create is cut off** until the shared `Dialog` lets its body scroll between a fixed header and footer.

**Assign type…** (unclassified row menu; also the tab `...` menu of an unclassified document): same
chooser without No type and without File name. Description: "<path> stays where it is. Its type decides what it
counts as in this specification." Primary: **Assign type**. On success the document id
changes (`u-…` → registered id): an open tab keeps its draft, scroll and position, the route
`documents/$documentId` is **replaced** (not pushed) with the new id, and focus returns to the tree row
under its new state.

**Remove registration** (dangling row menu and the missing tab): a confirmation dialog in the existing
delete-dialog pattern: "Remove the registration of backend.md? The specification will no longer list it.
No file is deleted." Confirm closes the missing tab.

**Failures of these three operations** use the existing tree-error pattern: the dialog stays
open, the chosen type and the typed file name are kept, the message is an attention Alert inside the
dialog above the footer, and the primary button is available again.

| Error                                                                       | Extra                                                 |
| --------------------------------------------------------------------------- | ----------------------------------------------------- |
| `DOCUMENT_PATH_CONFLICT`                                                    | focus returns to File name                            |
| `DOCUMENT_PATH_INVALID`                                                     | focus returns to File name                            |
| `DOCUMENT_ALREADY_CLASSIFIED`                                               | the tree is refetched; the row already shows its type |
| `DOCUMENT_REVISION_CONFLICT`                                                | the tree is refetched                                 |
| `DOCUMENT_OPERATION_CONFLICT`                                               | -                                                     |
| `SPEC_MANIFEST_DIRTY`                                                       | no ActionReason exists for it, so no advance warning  |
| `SPEC_BUSY`                                                                 | -                                                     |
| `BRANCH_PROTECTED`, `COMMIT_BLOCKED`, `GIT_POLICY_INVALID`, `SPEC_ARCHIVED` | the tree is refetched, so the read-only line appears  |
| `DOCUMENT_RECOVERY_REQUIRED`                                                | **Resume** retries with the same `operationId`        |
| `DOCUMENT_OPERATION_INVALID`, anything else                                 | -                                                     |

`DOCUMENT_PROTECTED` cannot be reached from these dialogs (the overview offers no such actions); if any
operation returns it, it is shown as the protected-document reason.

### 3.7 Idle document area (nothing open)

`DocumentsEmptyState` is the shared empty screen (the design-system `EmptyState`, centred in the
area, the same one as the empty Specifications list): the title "No document open", the line "Choose a
document from the tree or create a new one." and, when the capabilities allow them, the start actions
**New document…** (the one primary action) and **Upload files** (secondary, also when it is the only
one); when neither is available the line is only "Choose a document from the tree." It does not list
documents: the tree beside it already does, and Expected documents in the tree names what is missing. No
completeness, no issues here: they belong to the tree, which is also what Narrow shows first.

## 4. Create Specification

### 4.1 First scan of the Archetype section

1. Which shapes of work exist, and **which fits my work?** (`useWhen` under each title.)
2. What does the chosen one give me? (the documents it will create.)
3. Which suggested documents do I want now? (checkboxes, preselected ticked.)

How to work with the archetype (instructions) is available behind a disclosure.

### 4.2 Layout

Placed after Name and Goal and before **Where do you want to work?**, separated by the form's existing
`Separator`s (project form: new section between the name/goal group and the workspace section; demo form:
replaces the Workflow select and `ArchetypeSummary` inside `CreateBasicsSection`). The form width stays
`content-standard`.

```text
Archetype                                                    h2 title-md
The shape of the work: which documents the specification starts with and which are expected.
You can add, remove or classify documents later.             body-md secondary
( ) Minimal        The work is small, well understood, or exploratory, ...
(•) Feature        One change spans what the product does, how it looks and ...
( ) Architecture   The work reshapes modules, ownership or dependencies, ...
│ > How to work with a Feature specification                 Collapsible, closed
│ Documents to create                                        legend, title-sm
│ ✓ Overview (overview.md) is always created.                InlineNote, icon check
│ [x] Behaviour   behaviour.md · The change alters what the product does ...
│ [x] UX          ux.md · The change has a user-facing interface ...
│ [x] Backend     backend.md · ...
│ [ ] User story  ...
```

- The details of the selected archetype are indented under a single subtle left rule (the lightest
  grouping that ties them to the selection); no surface, no border box.
- One row per `include: always` template as an InlineNote; `optional` templates are `CheckboxField`s
  (label = template title, description = `filename · <type useWhen>`), ticked when `preselected`.
- When unticking a suggestion leaves a requirement of the archetype unmet (only owner-configured
  archetypes do this), the row adds a secondary line: "<archetype> expects a <type> document. Without it
  the specification lists it as missing until you add one." It never blocks Create.
- Changing the archetype restores that archetype's default ticks (ticks are per archetype within the
  visit; switching back restores the user's ticks for it).
- **Wide / Compact:** single column; radio descriptions wrap. **Narrow (390):** same order, no
  horizontal overflow (verified); the radio list is ~170 px for three archetypes.
- Catalogue loading: the section shows the existing options-loading line; Create's prerequisite reads
  "Archetypes are loading". Catalogue failure: Alert (attention) "The archetypes could not be loaded" with
  **Retry**; the rest of the form stays usable and the draft is kept.

### 4.3 Defaults and submit

- Initial selection: the catalogue's `defaultArchetypeId` when present (demo), else the only archetype
  of a catalogue with one, else none. With nothing selected the radio list has no checked option (its
  first radio is the Tab stop), the documents area shows the quiet prompt "Choose an archetype to see
  the documents Create makes." and Create stays unavailable with the reason "Choose an archetype."
  The same rule applies to a restored draft whose archetype no longer exists and after
  `ARCHETYPE_UNKNOWN`; a stored or chosen archetype that still exists is kept. (Decision Q1.)
- Submit adds `archetypeId`, `archetypeVersion`, `catalogueRevision` and `optionalDocumentIds` (the
  ticked optional template ids) to the Create request. The draft saved for "Back to form" stores the
  archetype id and the ticks.
- `CATALOGUE_STALE`: failure Alert "The archetypes changed while you were filling the form" with
  **Refresh archetypes**; refresh keeps the selected id when it still exists and resets its ticks to the
  new defaults, announcing the change. `ARCHETYPE_UNKNOWN`: same Alert text, the selection falls back to
  the initial rule above (the default, the only archetype, or none).

### 4.4 Method choice and progress page

- Method choice: only the manual card's text changes ("Create the documents of an archetype and edit
  them yourself."); the step is otherwise unchanged.
- Progress page **Configuration** list gains two rows after the name: **Archetype** (title, primary
  emphasis like other user choices) and **Documents** (the file names that will be created, comma
  separated, wrapping). Both come from the retained request/draft; a row whose value is unknown is not
  shown (today's rule). Steps, status tile, technical details, notes and actions do not change.

## 5. Document tab states

### 5.1 Read-only on open

- A document is read-only when `editable` is false or a Specification-wide write capability is
  unavailable (the contract has no per-document write action yet). The reason is chosen in this order: `archived`,
  `git-policy-invalid`, `branch-protected`, `branch-not-allowed`, `commit-blocked`, `not-editable`.
- The first line of the document content is an `InlineNote` (info): `Read-only: <reason>` plus the remedy
  for that reason. It is in the document flow, not sticky, not a box. The Edit action is not
  offered; Show path and Close tab stay.
- The same workspace renders in the demo and in a project Runtime; only the documents adapter differs.
- The same Specification-wide reason appears once above the tree (3.1, item 2); the per-document
  `not-editable` reason appears only in the tab.

### 5.2 Save

- Save is promoted only while dirty (today). While the request runs: label `Saving…`, disabled, the
  Discard action disabled, the editor stays editable (edits after the request are a new draft), the tab
  keeps its dirty mark. The live region announces "Saving…" once if the save takes longer than one
  second.
- Success: the save is acknowledged once the content is on disk (its commit is the Engine's, queued
  or made by the commit policy); the dirty mark clears and the live region announces "Saved". The commit
  state is not shown in this release. The document heading shows the new derived title; the tab label (file name)
  does not change.
- Refusals keep the draft and show an Alert (role `alert`) at the top of the document; focus stays in
  the editor. After DOCUMENT_REVISION_CONFLICT **Save is unavailable until the user chooses Copy my
  version or Load the version on disk** (saving again would only repeat the conflict); after Copy my
  version the editor reloads the disk version as the base and keeps the user's text on the clipboard, so
  the user merges by hand and Save returns. For the other refusals Save stays available unless the reason
  makes it pointless:

| Error                                                     | Alert title                                   | Body / actions                                                                                                                                                                              |
| --------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DOCUMENT_REVISION_CONFLICT`                              | Not saved: <file> changed on disk             | The file was changed outside this editor after you opened it. Nothing was overwritten and your changes are still here. **Copy my version**, **Load the version on disk…** (asks to discard) |
| `BRANCH_PROTECTED`, `GIT_POLICY_INVALID`, `SPEC_ARCHIVED` | Not saved: <reason>                           | Remedy line. The tab switches to read-only (5.1) but keeps the draft until the user closes or discards it.                                                                                  |
| `COMMIT_BLOCKED`                                          | Not saved: Git cannot take a commit right now | Remedy line; **Try again**.                                                                                                                                                                 |
| `SPEC_BUSY`                                               | Not saved: another change is in progress      | **Try again**.                                                                                                                                                                              |
| `DOCUMENT_RECOVERY_REQUIRED`                              | The save did not finish                       | "Finish the save before editing further." **Resume** (same operation id). Editing is locked until resumed.                                                                                  |
| `DOCUMENT_FILE_MISSING`                                   | Not saved: the file is missing                | The tab becomes the missing state (5.5) and keeps the draft.                                                                                                                                |

- Close tab / leave with a draft after a refusal uses the existing Unsaved changes dialog.

### 5.3 Image and binary

- **Image** (`kind: image`): the image from `raw` (`<img src>`, never inline SVG markup) fitted to the area;
  Fit ↔ Actual size in the Display group (text label, no zoom glyph in the registry), **Download**
  as a text action (no download glyph in the registry). It is the only action of an image tab, so it is
  marked `primary: true`: the header renders every direct text action as a filled button, so this is
  honest. No Edit, no Save, never dirty.
- **Binary** (`kind: binary`): left-aligned on the reading measure: "This file cannot be shown here.
  Download it to open it in another program.", a description list (Path, Type or No type, Size,
  Format = `mediaType`) and **Download** (secondary text button in the body only; the header action is
  `direct: 'never'`, so it appears in the "..." menu and the two Downloads never differ in weight). No
  centred empty-area composition.
- Text that is viewable but not editable (`kind: text`, `editable: false`) opens in the source/preview view
  with the `not-editable` read-only line.
- Text above the JSON read limit (`DOCUMENT_TOO_LARGE`): the binary composition with the line "This file
  is too large to show here."

### 5.4 Tab labels and ids

- Label = **file name** (today's rule, `documentTabs.ts`); the derived title is the document's
  heading and is added to the tooltip. Description (tooltip, Opened menu, narrow switcher list) = path.
- After a rename or move the label follows the new name in place; the tab does not move.
- An id change (classify; rename or move of an unclassified file, whose id derives from its path) keeps
  the tab, its draft and position, and **replaces** the route with the new id.

### 5.5 Missing (dangling) tab

- Opened from a dangling row, or when a document disappears (existing missing state). The tab shows the
  ItemTabs `missing` state with the file name as label.
- Content: attention Alert "<file> is missing", body "The specification lists <file> as a <type> document,
  but the file is not in the folder. It may have been moved or deleted outside SpecFlow." and "To keep it,
  restore the file (for example with Git) and refresh.", action **Remove registration** (opens the
  confirmation, 3.6). A kept draft adds today's missing-hint line.

## 6. Glue between the screens

1. **Create → Documents:** the created Specification opens as today; its tree shows the scaffolded
   documents; Expected documents is absent for every built-in archetype.
2. **Expected documents → Add → New document → new tab in edit:** the requirement row disappears as soon
   as the tree reports it satisfied; the live region announces "<type> added".
3. **Unclassified row → Assign type → row label clears, tab follows the id.**
4. **Dangling row → missing tab → Remove registration → tab closes, row disappears.**
5. **Read-only reasons** are the same strings in the tree line, the row-menu note, the tab line and the
   save refusals (one key per ActionReason).

## 7. States

| State                                    | Tree pane                                              | Document area                        | Actions changed                                         |
| ---------------------------------------- | ------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------- |
| All requirements met, no blocking issues | tree only                                              | idle or tabs                         | none                                                    |
| Requirement unmet                        | Expected documents; Add only with `createFile`         | -                                    | Add → New document (type preselected)                   |
| Close-refusing issue                     | attention Alert at top                                 | -                                    | none (fix on disk)                                      |
| Unclassified file                        | none (Assign type… in the row menu)                    | opens normally (edit if `editable`)  | Assign type… first in menu                              |
| Dangling entry                           | warning glyph, `File missing`                          | missing tab with Remove registration | only Remove registration                                |
| Overview                                 | no label                                               | normal                               | menu holds only the `protected` note                    |
| Specification read-only                  | read-only line above tree; New/Upload disabled; no Add | read-only line in every text tab     | no Edit, no Save                                        |
| Not editable file                        | -                                                      | read-only line `not-editable`        | no Edit                                                 |
| Saving                                   | -                                                      | Save `Saving…` disabled              | Discard disabled                                        |
| Save refused                             | -                                                      | Alert per 5.2, draft kept            | per 5.2                                                 |
| Image / binary                           | `file` glyph                                           | viewer / info + Download             | Download promoted; no Edit/Save                         |
| Tree truncated                           | muted line after the last row                          | -                                    | -                                                       |
| Skipped entries                          | neutral muted line after the last row                  | -                                    | -                                                       |
| Revision conflict on save                | -                                                      | Alert, draft kept                    | Save unavailable until Copy my version / Load from disk |
| Create: catalogue loading / failed       | -                                                      | -                                    | Create disabled with prerequisite / Alert with Retry    |
| Create: unticked required suggestion     | -                                                      | -                                    | informational line, Create allowed                      |

Geometry that stays stable across states: tree row height and tracks, header action slots, tab widths,
the Create form order.

## 8. Interaction and accessibility

- **Tree rows:** the trailing label is part of the row button's text, so the accessible name reads
  "login-flow.md UX" / "backend.md File missing". The warning glyph is decorative.
- **Expected documents:** a `section` labelled by its heading; each Add has its own accessible name.
  Not a live region (the tree refetch announces through the operation's own message).
- **Close issues Alert:** static (no `role="alert"`): it is present on load, not caused by an action.
- **Dialogs:** focus starts on the selected radio; Escape and Cancel return focus to the opener
  (menu item → the row's menu trigger; Add → the Add button; header menu → the tree, as today). Arrow
  keys move within the radio group (Radix); the type description is the radio's `aria-describedby`.
  Enter in the File name submits.
- **After create / classify / remove:** focus moves to the new tab panel (create), stays on the row
  under its new id (classify) or moves to the next row (remove registration); the live region announces
  the result (keys `created`, `done`).
- **Read-only line:** plain text in the reading order before the document, so screen readers reach the reason first.
- **Save:** the busy state is `aria-disabled` on the Save action with the label `Saving…`; the live
  region (polite) announces "Saving…" after one second and "Saved" on success. Refusal Alerts are `role="alert"` and do not move focus out of the editor.
- **Keyboard:** Ctrl/Cmd+S unchanged; it does nothing while a save runs or in a read-only tab (no
  error).
- **Create:** the archetype radios are one `radiogroup` labelled by the section heading; the documents are
  a `fieldset` with legend "Documents to create"; the informational line on an unticked expected type is
  part of the checkbox description.
- Touch: all row actions keep the 44 px hit area of the tree recipe; Add and Download are standard
  buttons.

## 9. Owner decisions and open points

| #   | Topic                  | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | Initial archetype      | **Decided (re-opened by the owner):** the catalogue's `defaultArchetypeId` when present (the demo), else the only archetype when there is exactly one, else none: the user chooses. Catalogue order carries no preference (the real catalogue is sorted by id and sends no default).                                                                                                                                                                                                                                                                                                                   |
| Q2  | Polish catalogue texts | **Decided:** the UI shows catalogue text as delivered (English for the built-ins), with no key-based translation in the UI. Translations of catalogue content will be added later through configuration, the client and the backend (probably with an expected-language header); the UI is expected to need no change beyond sending that language. Keep catalogue text out of `en.json`/`pl.json`.                                                                                                                                                                                                    |
| Q4  | User-facing term       | **Open.** Constraint decided: do not use "Workflow" for this concept (it is not a state machine definition). The concept will be shared by definitions of Specifications, Tasks and similar objects, so the final name has to be generic. Working term until named: "Archetype" / "Archetyp". All its UI text goes through the `create.archetype.*` and related keys listed in section 8, so a rename touches translations only. Collision to resolve with the name: "archetype/role" already labels the agent in Session and Task metadata (`docs/ideas/specflow-ui/screens/task-detail-ui-spec.md`). |
