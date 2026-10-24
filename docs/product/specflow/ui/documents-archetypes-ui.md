---
id: product.specflow.ui.documents-archetypes
type: product
title: Documents and Create with archetypes (UI)
status: draft
scope: specflow
areas: [ui]
tags: [documents, archetypes, requirements, create, editor]
read_when:
  - integrating the archetype catalogue, document tree, document read or document operations in the UI
  - changing the Documents tree, its overview state, the New document or Assign type flows
  - changing the Archetype part of Create Specification or its progress page
  - changing read-only, save, conflict, image or binary states of a document tab
summary: >
  UI contract for Specification archetypes and documents on the existing screens: the Documents tree
  (registered, unclassified, dangling, protected overview, unmet requirements, Close-refusing issues),
  New document from a type and Assign type, the Archetype section of Create and its progress rows, and
  the document tab states (read-only reason on open, synchronous save, revision conflict, image, binary,
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
3. **Document tabs**: read-only with a reason shown on open, save as a synchronous commit (busy, success,
   conflict and other refusals), image and binary tabs, a tab for a missing (dangling) file, and tabs
   that follow an id change. Tab labels stay file names (today's rule).

Out of scope: owner-defined catalogue authoring (D-config), switching the archetype of an existing
Specification, adding own files at Create (`addedDocuments`), import (upload keeps today's behaviour,
files arrive unclassified), split view, history of a document.

## 2. Decisions (one design per screen)

| #   | Decision                                                                                                                                                                                                                                                                                     | Rejected alternatives (one line each)                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | A tree row shows its **type as a quiet trailing label only when the file name does not already say it** (`login-flow.md · UX`, not `ux.md · UX`).                                                                                                                                            | Type on every row: repeats the file name on most rows and drowns the two states that matter (No type, File missing). Type only in a tooltip: hover-only, unreachable on touch.                                                                    |
| D2  | **Unclassified** rows read `No type`; **dangling** rows keep their place in the tree with the warning glyph and `File missing`. Neither is grouped separately.                                                                                                                               | A separate "Unclassified" / "Missing" group: moves files away from their folder, the user no longer finds them where they are on disk.                                                                                                            |
| D3  | The tree pane starts with what needs the user, and only that: Close-refusing **issues** (attention Alert), then **Expected documents** listing **unmet requirements only**, each with **Add**. When nothing is unmet and nothing blocks Close, the region does not exist.                    | A permanent completeness summary ("3 of 3", a progress bar, a green check): reads as approval or "done", which the product explicitly forbids. Showing met requirements too: noise for every built-in archetype (only `overview: 1`, always met). |
| D4  | **New document** is a type chooser (radio list: title + "use when", grouped "Suggested by <archetype>" / "Other types" / "No type"), a pre-filled editable **File name**, and the type instructions behind a disclosure. One `Dialog` at every width (see the scroll gap in section 11).     | Inline file-name entry in the tree (today): cannot carry a type, which is what satisfies a requirement. A type select: hides "use when", the criterion for choosing. A wizard: two steps for one decision.                                        |
| D5  | **Assign type** reuses the same chooser without "No type" and without a file name.                                                                                                                                                                                                           | Inline type select in the row: no room for "use when" in a 280-360 px tree.                                                                                                                                                                       |
| D6  | **Create** shows archetypes as a **radio list** (title + `useWhen`), then for the selected one its instructions behind a disclosure and **Documents to create** as checkboxes (preselected ticked). The archetype `description` is not repeated: the checklist already says what it creates. | Keep the select (today): hides `useWhen`. Choice tiles (as the workspace place): need an icon per archetype the catalogue does not have, and three tall tiles of long text. Keep the workflow phases: the real backend has none.                  |
| D7  | A tab shows **why it is read-only as one quiet line at the top of the document, on open**; the Edit action is not offered. The tree repeats the Specification-wide reason once above the tree.                                                                                               | A disabled Edit with a tooltip: hover-only, discovered late. Failing on Save: explicitly forbidden by the contract (UI impact 10).                                                                                                                |
| D8  | **Save** stays the promoted primary action; while the commit runs it reads `Saving…` and is disabled, the editor stays editable, the dirty mark clears only on the response. A refusal is an Alert at the top of the document that keeps the draft.                                          | A toast for the conflict: transient, while the draft is at risk. A modal: blocks copying the user's own text.                                                                                                                                     |
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
 v architecture
     login-flow.md                    UX
     sequence.png                   Note
 v notes
     meeting-2026-10-20.md       No type
     token-sample.bin            No type
 ! backend.md               File missing   (warning glyph and label in attention tone)
   behaviour.md
   overview.md
   ux.md
 1 entry in the folder could not be read.  muted line (skipped-entry; not a Close refusal, G10)
```

- **Wide (≥ 1080) and Compact (840-1079):** as above; Compact keeps the tree at 1/3. The trailing label
  uses the existing trailing-label track of the row (today's "Required" slot). **State labels (No type,
  File missing) never hide: the file name truncates instead** (full name in the tooltip and Show path).
  Only a type-title label (UX, Note) may hide below the row's `@3xs` width.
- **Narrow (< 840):** the tree page is the same column at full width; nothing moves into a drawer.
  Verified at 390 px: no horizontal overflow, labels visible.
- **Ultra-wide:** unchanged; the tree stops at 360 px, the document gets the rest.

Order is unchanged (folders A-Z, then files A-Z); state never reorders. Dangling entries are placed at
their registered path.

### 3.3 Row grammar

| Entry                      | Glyph                        | Name             | Trailing label (muted unless noted) | Row press                      | Row menu                                                           |
| -------------------------- | ---------------------------- | ---------------- | ----------------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| Registered, name says type | `file` (images too)          | file name        | none                                | open tab                       | Rename, Move, Delete                                               |
| Registered, other name     | as above                     | file name        | type title (`UX`)                   | open tab                       | Rename, Move, Delete                                               |
| `overview.md` (protected)  | `file`                       | file name        | none                                | open tab                       | only the note with the `protected` reason (no dead disabled items) |
| Unclassified               | as above                     | file name        | `No type`                           | open tab                       | **Assign type…**, separator, Rename, Move, Delete                  |
| Dangling                   | `triangle-alert` (attention) | file name, muted | `File missing` (attention tone)     | open a missing tab (3.6 / 5.5) | **Remove registration** (danger)                                   |

"The file name says the type" means the file stem equals the type id or the stem of the type's
`defaultFilename`. Other disabled items keep today's pattern: the menu note carries at most two distinct
reasons from the ActionReason copy (section 8).

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
  whether it refuses Close (G10); if the contract owner decides it does, the bullet moves into the Alert.
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
  region, so **Create is cut off** until the DS gap in section 11 is fixed.

**Assign type…** (unclassified row menu; also the tab `...` menu of an unclassified document): same
chooser without No type and without File name. Description: "<path> stays where it is. Its type decides what it
counts as in this specification." Primary: **Assign type**. On success the document id
changes (`u-…` → registered id): an open tab keeps its draft, scroll and position, the route
`documents/$documentId` is **replaced** (not pushed) with the new id, and focus returns to the tree row
under its new state.

**Remove registration** (dangling row menu and the missing tab): a confirmation dialog in the existing
delete-dialog pattern: "Remove the registration of backend.md? The specification will no longer list it.
No file is deleted." Confirm closes the missing tab.

**Failures of these three operations** use the existing `documents.tree.error.*` pattern: the dialog stays
open, the chosen type and the typed file name are kept, the message is an attention Alert inside the
dialog above the footer, and the primary button is available again.

| Error                                                                       | Message key                                                                                  | Extra                                                     |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `DOCUMENT_PATH_CONFLICT`                                                    | `documents.tree.error.pathConflict` (existing)                                               | focus returns to File name                                |
| `DOCUMENT_PATH_INVALID`                                                     | `documents.tree.error.pathInvalid` (new)                                                     | focus returns to File name                                |
| `DOCUMENT_ALREADY_CLASSIFIED`                                               | `documents.tree.error.alreadyClassified` (new)                                               | the tree is refetched; the row already shows its type     |
| `DOCUMENT_REVISION_CONFLICT`                                                | `documents.tree.error.revisionConflict` (existing)                                           | the tree is refetched                                     |
| `DOCUMENT_OPERATION_CONFLICT`                                               | `documents.tree.error.requestConflict` (existing)                                            | -                                                         |
| `SPEC_MANIFEST_DIRTY`                                                       | `documents.tree.error.manifestDirty` (new)                                                   | no ActionReason exists for it, so no advance warning (G9) |
| `SPEC_BUSY`                                                                 | `documents.tree.error.busy` (new)                                                            | -                                                         |
| `BRANCH_PROTECTED`, `COMMIT_BLOCKED`, `GIT_POLICY_INVALID`, `SPEC_ARCHIVED` | `documents.tree.error.refused` (new) + `documents.reason.*` of `details.reason` + its remedy | the tree is refetched, so the read-only line appears      |
| `DOCUMENT_RECOVERY_REQUIRED`                                                | `documents.tree.error.recovery` (new)                                                        | **Resume** retries with the same `operationId`            |
| `DOCUMENT_OPERATION_INVALID`, anything else                                 | `documents.tree.error.default` (existing)                                                    | -                                                         |

`documents.tree.error.required` is removed: `DOCUMENT_PROTECTED` cannot be reached from these dialogs (the
overview offers no such actions); if any operation returns it, it maps to `documents.reason.protected`.

### 3.7 Idle document area (nothing open)

Unchanged composition (`DocumentsEmptyState`): "Choose a document from the tree" and **Start with** (at
most five). The ordering rule changes: the protected overview first, then registered documents of a
suggested type in tree order, then other registered documents; unclassified and dangling entries are
never suggested. No completeness, no issues here: they belong to the tree, which is also what Narrow shows
first.

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

- Initial selection: the catalogue's `defaultArchetypeId` when present (demo), else `minimal` when it
  exists, else the first archetype. (Owner question Q1.)
- Submit adds `archetypeId`, `archetypeVersion`, `catalogueRevision` and `optionalDocumentIds` (the
  ticked optional template ids) to the Create request. The draft saved for "Back to form" stores the
  archetype id and the ticks.
- `CATALOGUE_STALE`: failure Alert "The archetypes changed while you were filling the form" with
  **Refresh archetypes**; refresh keeps the selected id when it still exists and resets its ticks to the
  new defaults, announcing the change. `ARCHETYPE_UNKNOWN`: same Alert text, the selection falls back to
  the default.

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
  unavailable (see contract gap G1). The reason is chosen in this order: `archived`,
  `git-policy-invalid`, `branch-protected`, `branch-not-allowed`, `commit-blocked`, `not-editable`,
  `not-implemented`.
- The first line of the document content is an `InlineNote` (info): `Read-only: <reason>` plus the remedy
  for that reason (section 8). It is in the document flow, not sticky, not a box. The Edit action is not
  offered; Show path and Close tab stay.
- The same Specification-wide reason appears once above the tree (3.1, item 2); the per-document
  `not-editable` reason appears only in the tab.

### 5.2 Save (synchronous commit)

- Save is promoted only while dirty (today). While the request runs: label `Saving…`, disabled, the
  Discard action disabled, the editor stays editable (edits after the request are a new draft), the tab
  keeps its dirty mark. The live region announces "Saving and committing…" once if the save takes longer
  than one second.
- Success: dirty mark clears, the live region announces "Saved" (or "Saved and committed" when
  `committed` is true). The document heading shows the new derived title; the tab label (file name)
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
| `DOCUMENT_RECOVERY_REQUIRED`                              | Saved to disk, but not committed              | "Finish the save before editing further." **Resume** (same operation id). Editing is locked until resumed.                                                                                  |
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
| Unclassified file                        | `No type`                                              | opens normally (edit if `editable`)  | Assign type… first in menu                              |
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

## 8. Copy

Keys extend the existing namespaces in `en.json` / `pl.json`. Catalogue texts (archetype and type
titles, descriptions, useWhen, instructions) come from the catalogue, not from these files (see Q2).

| Key                                      | English                                                                                | Polish                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `documents.tree.noType`                  | No type                                                                                | Bez typu                                                                                         |
| `documents.tree.fileMissing`             | File missing                                                                           | Brak pliku                                                                                       |
| `documents.tree.newDocument`             | New document…                                                                          | Nowy dokument…                                                                                   |
| `documents.tree.assignType`              | Assign type…                                                                           | Przypisz typ…                                                                                    |
| `documents.tree.removeRegistration`      | Remove registration                                                                    | Usuń rejestrację                                                                                 |
| `documents.tree.truncated`               | Only the first entries are listed.                                                     | Pokazano tylko pierwsze pozycje.                                                                 |
| `documents.requirements.title`           | Expected documents                                                                     | Oczekiwane dokumenty                                                                             |
| `documents.requirements.help`            | {{archetype}} expects these types. Only file presence is checked.                      | {{archetype}} oczekuje tych typów. Sprawdzana jest tylko obecność plików.                        |
| `documents.requirements.count`           | {{count}} of {{min}}                                                                   | {{count}} z {{min}}                                                                              |
| `documents.requirements.add`             | Add                                                                                    | Dodaj                                                                                            |
| `documents.requirements.addLabel`        | Add a {{type}} document                                                                | Dodaj dokument: {{type}}                                                                         |
| `documents.issues.title`                 | Closing this specification will be refused                                             | Zamknięcie tej specyfikacji zostanie odrzucone                                                   |
| `documents.issues.caseCollision`         | Two files differ only in letter case: {{path}}                                         | Dwa pliki różnią się tylko wielkością liter: {{path}}                                            |
| `documents.issues.archiveLimit`          | The folder is larger than the archive allows.                                          | Folder jest większy, niż pozwala archiwum.                                                       |
| `documents.tree.skipped`                 | {{count}} entry in the folder could not be read. (plural forms)                        | Nie udało się odczytać {{count}} pozycji w folderze. (formy liczby mnogiej)                      |
| `documents.tree.error.pathInvalid`       | This name or path cannot be used. Choose another name.                                 | Tej nazwy lub ścieżki nie można użyć. Wybierz inną nazwę.                                        |
| `documents.tree.error.alreadyClassified` | This file already has a type. The documents were refreshed.                            | Ten plik ma już typ. Dokumenty zostały odświeżone.                                               |
| `documents.tree.error.manifestDirty`     | specification.yaml has uncommitted changes. Commit or discard them, then try again.    | Plik specification.yaml ma niezacommitowane zmiany. Zacommituj je lub odrzuć i spróbuj ponownie. |
| `documents.tree.error.busy`              | Another change to this specification is in progress. Try again in a moment.            | Trwa inna zmiana tej specyfikacji. Spróbuj ponownie za chwilę.                                   |
| `documents.tree.error.refused`           | Not changed: {{reason}}                                                                | Nie zmieniono: {{reason}}                                                                        |
| `documents.tree.error.recovery`          | The files were changed but not committed. Finish the operation before the next change. | Pliki zostały zmienione, ale bez commita. Dokończ operację przed kolejną zmianą.                 |
| `documents.tree.error.resume`            | Resume                                                                                 | Wznów                                                                                            |

                   | Fix this in the folder (for example with Git), then refresh.                                              | Popraw to w folderze (na przykład w Git), a potem odśwież.                                                     |

| `documents.newDocument.title` | New document | Nowy dokument |
| `documents.newDocument.inFolder` | In {{folder}} | W folderze {{folder}} |
| `documents.newDocument.inRoot` | In the main folder of {{specification}}. | W głównym folderze specyfikacji {{specification}}. |
| `documents.newDocument.typeLabel` | Document type | Typ dokumentu |
| `documents.newDocument.suggestedBy` | Suggested by {{archetype}} | Sugerowane przez {{archetype}} |
| `documents.newDocument.otherTypes` | Other types | Inne typy |
| `documents.newDocument.expected` | Expected · {{count}} of {{min}} | Oczekiwany · {{count}} z {{min}} |
| `documents.newDocument.present` | {{count}} in this specification | W tej specyfikacji: {{count}} |
| `documents.newDocument.noType` | No type | Bez typu |
| `documents.newDocument.noTypeHelp` | Counts as no type. You can assign one later. | Bez typu. Typ możesz przypisać później. |
| `documents.newDocument.fileName` | File name | Nazwa pliku |
| `documents.newDocument.fileNameHelp` | The type decides what the document counts as; the name is free. | O tym, czym jest dokument, decyduje typ; nazwa jest dowolna. |
| `documents.newDocument.guidance` | How to write a {{type}} document | Jak napisać dokument: {{type}} |
| `documents.newDocument.create` | Create | Utwórz |
| `documents.newDocument.created` | {{type}} added | Dodano: {{type}} |
| `documents.classify.title` | Assign a type | Przypisz typ |
| `documents.classify.description` | {{path}} stays where it is. Its type decides what it counts as in this specification. | {{path}} zostaje na miejscu. Typ decyduje, czym ten plik jest w tej specyfikacji. |
| `documents.classify.confirm` | Assign type | Przypisz typ |
| `documents.classify.done` | {{name}} is now {{type}} | {{name}} ma teraz typ {{type}} |
| `documents.dangling.title` | {{name}} is missing | Brak pliku {{name}} |
| `documents.dangling.body` | The specification lists {{name}} as a {{type}} document, but the file is not in the folder. It may have been moved or deleted outside SpecFlow. | Specyfikacja wymienia {{name}} jako dokument typu {{type}}, ale pliku nie ma w folderze. Mógł zostać przeniesiony lub usunięty poza SpecFlow. |
| `documents.dangling.restore` | To keep it, restore the file (for example with Git) and refresh. | Aby go zachować, przywróć plik (na przykład w Git) i odśwież. |
| `documents.dangling.confirmTitle` | Remove the registration of {{name}}? | Usunąć rejestrację {{name}}? |
| `documents.dangling.confirmBody` | The specification will no longer list it. No file is deleted. | Specyfikacja przestanie go wymieniać. Żaden plik nie zostanie usunięty. |
| `documents.readOnly.line` | Read-only: {{reason}} | Tylko do odczytu: {{reason}} |
| `documents.tree.editingUnavailable` | Editing is unavailable: {{reason}} | Edycja jest niedostępna: {{reason}} |
| `documents.reason.note` | Unavailable: {{reason}} | Niedostępne: {{reason}} |
| `documents.reason.protected` | The overview is the main document: it can be edited, but not renamed, moved or deleted. | Przegląd to główny dokument: można go edytować, ale nie można zmienić jego nazwy, przenieść ani usunąć. |
| `documents.reason.root` | The main folder cannot be renamed, moved or deleted. | Folderu głównego nie można zmienić, przenieść ani usunąć. |
| `documents.reason.archived` | this specification is archived. | ta specyfikacja jest zarchiwizowana. |
| `documents.reason.branchProtected` | this branch is protected from SpecFlow commits. | ta gałąź jest chroniona przed commitami SpecFlow. |
| `documents.reason.branchNotAllowed` | SpecFlow may not commit on this branch. | SpecFlow nie może commitować na tej gałęzi. |
| `documents.reason.commitBlocked` | Git cannot take a commit right now. | Git nie może teraz przyjąć commita. |
| `documents.reason.gitPolicyInvalid` | the project's Git settings are invalid. | ustawienia Git projektu są nieprawidłowe. |
| `documents.reason.busy` | another change to this specification is in progress. | trwa inna zmiana tej specyfikacji. |
| `documents.reason.notEditable` | this file type can be viewed but not edited here. | ten typ pliku można tu oglądać, ale nie edytować. |
| `documents.reason.dangling` | The file is missing; only its registration can be removed. | Brak pliku; można tylko usunąć jego rejestrację. |
| `documents.reason.notImplemented` | not available in this version yet. | jeszcze niedostępne w tej wersji. |
| `documents.remedy.branch` | To edit, open the specification in a workspace on an allowed branch. | Aby edytować, otwórz specyfikację w środowisku pracy na dozwolonej gałęzi. |
| `documents.remedy.commitBlocked` | Finish or abort the merge or rebase in this workspace, then try again. | Dokończ lub przerwij merge albo rebase w tym środowisku pracy i spróbuj ponownie. |
| `documents.remedy.gitPolicy` | Fix the Git settings in the project configuration. | Popraw ustawienia Git w konfiguracji projektu. |
| `documents.remedy.notEditable` | Download the file to edit it elsewhere. | Pobierz plik, aby edytować go gdzie indziej. |
| `documents.save.saving` | Saving… | Zapisywanie… |
| `documents.save.committing` | Saving and committing… | Zapisywanie i commit… |
| `documents.save.saved` | Saved | Zapisano |
| `documents.save.committed` | Saved and committed | Zapisano i zacommitowano |
| `documents.conflict.title` | Not saved: {{name}} changed on disk | Nie zapisano: plik {{name}} zmienił się na dysku |
| `documents.conflict.body` | The file was changed outside this editor after you opened it. Nothing was overwritten and your changes are still here. | Plik zmienił się poza tym edytorem po jego otwarciu. Nic nie zostało nadpisane, a Twoje zmiany są nadal tutaj. |
| `documents.conflict.copyMine` | Copy my version | Kopiuj moją wersję |
| `documents.conflict.loadDisk` | Load the version on disk… | Wczytaj wersję z dysku… |
| `documents.save.refused` | Not saved: {{reason}} | Nie zapisano: {{reason}} |
| `documents.save.busy` | Not saved: another change is in progress | Nie zapisano: trwa inna zmiana |
| `documents.save.recoveryTitle` | Saved to disk, but not committed | Zapisano na dysku, ale bez commita |
| `documents.save.recoveryBody` | Finish the save before editing further. | Dokończ zapis, zanim będziesz dalej edytować. |
| `documents.save.resume` | Resume | Wznów |
| `documents.binary.cannotShow` | This file cannot be shown here. Download it to open it in another program. | Tego pliku nie można tu wyświetlić. Pobierz go, aby otworzyć w innym programie. |
| `documents.binary.tooLarge` | This file is too large to show here. | Ten plik jest zbyt duży, aby go tu wyświetlić. |
| `documents.binary.path` / `.type` / `.size` / `.format` | Path / Type / Size / Format | Ścieżka / Typ / Rozmiar / Format |
| `documents.actions.download` | Download | Pobierz |
| `documents.image.actualSize` | Actual size | Rzeczywisty rozmiar |
| `create.archetype.title` | Archetype | Archetyp |
| `create.archetype.intro` | The shape of the work: which documents the specification starts with and which are expected. You can add, remove or classify documents later. | Kształt pracy: od jakich dokumentów zaczyna się specyfikacja i jakich się oczekuje. Dokumenty możesz później dodawać, usuwać i klasyfikować. |
| `create.archetype.guidance` | How to work with a {{archetype}} specification | Jak pracować z archetypem {{archetype}} |
| `create.archetype.documents` | Documents to create | Dokumenty do utworzenia |
| `create.archetype.always` | {{type}} ({{file}}) is always created. | {{type}} ({{file}}) jest tworzony zawsze. |
| `create.archetype.expectedUnticked` | {{archetype}} expects a {{type}} document. Without it the specification lists it as missing until you add one. | {{archetype}} oczekuje dokumentu typu {{type}}. Bez niego specyfikacja pokaże go jako brakujący, dopóki go nie dodasz. |
| `create.archetype.loading` | Archetypes are loading | Wczytywanie archetypów |
| `create.archetype.loadFailed` | The archetypes could not be loaded | Nie udało się wczytać archetypów |
| `create.errors.catalogueStale` | The archetypes changed while you were filling the form | Archetypy zmieniły się w trakcie wypełniania formularza |
| `create.errors.refreshArchetypes` | Refresh archetypes | Odśwież archetypy |
| `create.subheading.withArchetype (new; replaces create.subheading.specification and create.project.subheading)` | Name the work, choose the archetype that matches it and where it lives. | Nazwij pracę, wybierz pasujący do niej archetyp i miejsce, w którym powstanie. |
| Create the documents of an archetype and edit them yourself. | Utwórz dokumenty archetypu i edytuj je samodzielnie. |
| `create.page.settings.archetype` | Archetype | Archetyp |
| `create.page.settings.documents` | Documents | Dokumenty |

`documents.reason.protected`, `.root` and `.dangling` are whole sentences shown alone (row-menu note).
The other reasons are lower-case fragments that are always wrapped: `documents.readOnly.line` in a tab,
`documents.tree.editingUnavailable` above the tree, `documents.reason.note` in a row-menu note,
`documents.save.refused` in a save refusal; the matching `documents.remedy.*` sentence follows when one
exists (`branch-protected` and `branch-not-allowed` share `remedy.branch`).

Removed keys: `create.workflowLabel`, `create.subheading.specification`, `create.project.subheading`,
`create.prerequisite.workflow`, `create.archetype.{info,phases,noPhases,noDescription,requiredDocuments,
suggestedLater,details,requiredNone,requiredCount_*,suggestedCount_*}`, `documents.tree.required`,
`documents.tree.requiredReason`, `documents.tree.reason.{required,rootProtected}`,
`documents.tree.error.required`. Reworded keys (the `workflow` word goes away):

| Key                                                                                                     | English                                                                                                            | Polish                                                                                       |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `create.method.intro`                                                                                   | Choose whether to start with a conversation with the Spec Writer or with the document skeleton from the archetype. | Wybierz, czy zaczniesz od rozmowy ze Spec Writerem, czy od szkieletu dokumentów z archetypu. |
| `create.method.manualText`                                                                              | Create the documents the archetype always includes and edit them yourself.                                         | Utwórz dokumenty, które archetyp zawsze zawiera, i edytuj je samodzielnie.                   |
| `create.archetype.unavailable`                                                                          | The selected archetype is unavailable. Choose another one.                                                         | Wybrany archetyp jest niedostępny. Wybierz inny.                                             |
| `create.prerequisite.archetype` (replaces `create.prerequisite.workflow`, used in `createReadiness.ts`) | Choose an available archetype.                                                                                     | Wybierz dostępny archetyp.                                                                   |

After this change no user-facing key says "workflow" for this concept.

## 9. Interaction and accessibility

- **Tree rows:** the trailing label is part of the row button's text, so the accessible name reads
  "meeting-2026-10-20.md No type" / "backend.md File missing". The warning glyph is decorative.
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
  region (polite) announces "Saving and committing…" after one second and "Saved"/"Saved and committed"
  on success. Refusal Alerts are `role="alert"` and do not move focus out of the editor.
- **Keyboard:** Ctrl/Cmd+S unchanged; it does nothing while a save runs or in a read-only tab (no
  error).
- **Create:** the archetype radios are one `radiogroup` labelled by the section heading; the documents are
  a `fieldset` with legend "Documents to create"; the informational line on an unticked expected type is
  part of the checkbox description.
- Touch: all row actions keep the 44 px hit area of the tree recipe; Add and Download are standard
  buttons.

## 10. Data mapping

| UI element                     | Contract field(s)                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Row type label                 | `documents[].type` → `ArchetypeCatalogue.documentTypes[].title` (fallback: the id)                                            |
| No type                        | `documents[].classification === 'unclassified'`                                                                               |
| File missing row / missing tab | `dangling[]` (`id`, `path`, `type`, `actions.delete`)                                                                         |
| Overview menu reason           | `documents[].protected`, `actions.{rename,move,delete}.reason === 'protected'`                                                |
| Assign type availability       | `documents[].actions.classify`, `capabilities.classify`                                                                       |
| Expected documents             | `completeness.requirements[]` where `!satisfied` (`documentType`, `count`, `minCount`); `archetype.title`                     |
| Close issues                   | `issues[]` with `path-case-collision` / `archive-limit`                                                                       |
| Skipped line                   | `issues[]` `skipped-entry`, `skippedEntries`                                                                                  |
| Add availability               | `capabilities.createFile`                                                                                                     |
| Truncated line                 | `truncated`                                                                                                                   |
| Read-only line (tree)          | `capabilities.{createFile,createFolder,import}.reason` when all unavailable                                                   |
| Read-only line (tab)           | `DocumentContent.editable`, Specification-wide reason (G1)                                                                    |
| New document chooser           | catalogue `documentTypes[]`, archetype `documents[]` (templates, G4), requirement results, per-type counts from `documents[]` |
| Create request                 | `CreateArchetypeSelection`: `archetypeId`, `archetypeVersion`, `catalogueRevision`, `optionalDocumentIds`                     |
| Create section                 | `archetypes[].{title, useWhen, instructions, requirements, documents[].{include, preselected, filename, type, title}}`        |
| Tab label / tooltip            | file name of `path` / `path` + `DocumentContent.title`; heading = `title`                                                     |
| Viewer choice                  | `DocumentContent.kind`, `mediaType`, `size`; image/download from `GET …/raw[?download=1]`                                     |
| Save                           | `SaveInput.expectedRevision` = last read `revision`; `SaveResult.{revision, committed}`                                       |
| Id follow                      | `DocumentOperationResult.documents[].id` (classify, rename, move)                                                             |

Freshness: the tree is refetched after every document operation and after a save (completeness can change); a refetch never moves focus. Loading and failure of the tree, the catalogue
and a document keep today's states.

## 11. Component and ownership map

| Region                     | Component                                                              | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tree rows                  | tree recipes (`treeLeafItemClassName`, …)                              | Reuse. **DS change:** `treeRequiredLabelClassName` / `treeRequiredMarkerClassName` become a generic trailing label (`treeTrailingLabelClassName`, keep the old names as aliases until the product stops using them). Not blocking.                                                                                                                                                                                                                                                                                                                                                                                          |
| Close issues               | `Alert tone="attention"`                                               | Reuse.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Expected documents         | product composition (Typography, Button ghost sm)                      | Product-owned; no surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Type chooser               | `RadioGroup` + `RadioGroupOption`, `Field`, `TextInput`, `Collapsible` | Reuse; product component `DocumentTypeChooser` shared by both flows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| New document / Assign type | `Dialog` at every width                                                | Reuse. **DS gap (blocking for Narrow):** `DialogContent` clips overflow and `DialogBody` does not scroll, so a tall body hides the footer at 390 × 844. Measured: the grid rows resolve to `40px 734px 80px` and the body never scrolls. **Fix (verified on all dialogs with header + body + footer, pixel-identical at 1440):** in `Dialog.tsx` change the `DialogContent` class `grid` to `flex flex-col` and keep `gap-5`; `DialogBody` keeps `min-h-0 overflow-y-auto`. Do not use `grid-rows-[auto_minmax(0,1fr)_auto]` (adds 20 px to two-section dialogs). Check the Figma capture story `dialog-capture` in the PR. |
| Read-only line             | `InlineNote`                                                           | Reuse.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Save busy                  | `WorkspaceHeader` action                                               | **DS gap:** a header action has no busy state; the mock only changes the label. Add `busy?: boolean` (Spinner in the icon slot, `aria-disabled`) to `WorkspaceHeaderAction`. The `status` slot does not render while `identityContent` holds the tabs (seen in the mock), so it is not an alternative. Not blocking: label-only works.                                                                                                                                                                                                                                                                                      |
| Save refusal               | `Alert role="alert"`                                                   | Reuse.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Binary info                | `DescriptionList`, `Button`                                            | Reuse.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Tabs                       | `ItemTabs` (`state: 'missing'`)                                        | Reuse. **DS bug to fix in the implementation PR:** `MiddleTruncate` (`ItemTabs.tsx` ~70-83) drops the space at the split point (the head span is a truncating flex item, so its trailing space collapses): "Single sign-on - UX" renders as "Single sign-on- UX".                                                                                                                                                                                                                                                                                                                                                           |
| Create archetype           | `RadioGroup`, `CheckboxField`, `InlineNote`, `Collapsible`             | Reuse; replaces `ArchetypeSummary` (AccentBlock) and the `LocalizedOptionPicker`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Progress rows              | `SummaryRow` in `CreateSettingsList`                                   | Reuse.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Icons: only names already in `iconRegistry` (`file`, `folder`, `triangle-alert`, `plus`, `check`,
`info`, `ellipsis`, `eye`, `save`, `close`, `chevron-down`). No Lucide import and no new registry
entry: image rows and tabs use `file`; Download and Actual size are text actions without a glyph. Edit
(`Pencil`) and Upload (`Upload`) stay exactly as the production code renders them today; this design
adds no use of them.

## 12. Contract gaps (for the contract owner)

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                            | Needed for                     | Proposal                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | No per-document **edit/save** Action. The tab must infer "read-only because of the branch" from `capabilities.createFile.reason`, and `DocumentContent` has only `editable` (kind).                                                                                                                                                                                            | Read-only reason on open (5.1) | `documents[].actions.save: Action` in the tree (and in `DocumentContent`).                                                                                                         |
| G4  | Creating a document of a type that has **no template in the Specification's archetype** (for example Architecture in a Feature spec) needs `templateId` xor `content`; the client would have to render the template rule itself. The tree also does not expose the Specification's archetype templates (only id, version, title), and the catalogue may be at a newer version. | New document (3.6)             | Allow `{ type }` alone (Engine renders the generic type template); expose the snapshot's templates (id, type, title, filename) in the tree, or the catalogue by archetype version. |
| G5  | No branch name with `branch-protected` / `branch-not-allowed`; copy cannot say which branch.                                                                                                                                                                                                                                                                                   | Read-only copy                 | Optional `details.branch` / a `git.branch` field in the tree. Copy works without it.                                                                                               |
| G6  | `archive-limit` carries no detail (which limit, actual value).                                                                                                                                                                                                                                                                                                                 | Close issues copy              | Optional `limit` / `value`, or accept the generic sentence.                                                                                                                        |
| G7  | Rename/move of an unclassified file changes its derived `u-` id; UI impact 9 mentions only classification.                                                                                                                                                                                                                                                                     | Id follow (5.4)                | State it in the contract; `DocumentOperationResult.documents[].id` already carries it.                                                                                             |
| G9  | `SPEC_MANIFEST_DIRTY` refuses every registry change (create with a type, classify, remove registration, rename/move of registered files), but `ActionReason` has no value for it, so the UI cannot warn before the user tries.                                                                                                                                                 | 3.6 failures                   | Add an ActionReason (for example `manifest-dirty`) reported in reads.                                                                                                              |
| G10 | `skipped-entry`: `tree.ts` and the API reference say only `path-case-collision` and `archive-limit` make Close refuse, while UI impact 14 also lists `skipped-entry`.                                                                                                                                                                                                          | 3.5                            | Decide; the design shows it as a neutral line until the contract says it refuses Close.                                                                                            |
| G8  | The catalogue requires the `create-options` capability; a reader with View only cannot show type titles.                                                                                                                                                                                                                                                                       | Type labels                    | Fall back to the id (designed), or include `type` titles in the tree.                                                                                                              |

## 13. Open questions for the owner

| #   | Question                                                                                                                                                                                                                                                                                                                                                                                                                                   | Recommendation                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Which archetype is selected when Create opens (the contract has no default)?                                                                                                                                                                                                                                                                                                                                                               | `minimal` when present, else the first: it creates the fewest files and never commits the user to documents they did not choose.                                                                                                                                     |
| Q2  | Are built-in catalogue texts translated in the UI (Polish), and how?                                                                                                                                                                                                                                                                                                                                                                       | Translate built-ins by key `catalogue.<id>.<field>` with fallback to the catalogue text; show owner-defined texts verbatim. Until decided: English.                                                                                                                  |
| Q4  | User-facing term for the Specification archetype. Collisions: (a) "archetype" already means an **agent archetype/role** in Session and Task metadata (`docs/ideas/specflow-ui/screens/task-detail-ui-spec.md`: "provider, archetype/role"); (b) the shipped UI calls this concept **"Workflow"** (`create.workflowLabel`, `create.subheading.specification`, `create.method.intro`, `create.prerequisite.workflow`, `create.archetype.*`). | Use "Archetype" / "Archetyp" (the word of the product document, the catalogue, the CLI and the agents) and retire "Workflow" for it everywhere in the UI (section 8). Keep agent archetypes labelled "role" in Session/Task surfaces so the two never share a label. |

## 14. Implementation notes

Production files that change (by owning area):

- `features/documents/explorer/`: `DocumentNode.tsx` (trailing label rule, dangling glyph),
  `DocumentTreeLevel.tsx` and `documentTreePolicy.ts` (dangling entries placed at their path; reasons
  re-keyed to ActionReason; `required` removed), `DocumentNodeMenu.tsx` (Assign type…, Remove
  registration, `protected` note), `DocumentsExplorer.tsx` (`documentRootActions`: New document… opens
  the chooser; inline entry kept for folders and rename), `useDocumentOperations.ts` (classify, remove
  registration, `operationId`, the failure mapping of 3.6), new `DocumentTypeChooser.tsx`, `NewDocumentDialog.tsx`,
  `AssignTypeDialog.tsx`.
- `features/documents/workspace/`: `DocumentsTreePanel.tsx` (issues, read-only line, Expected
  documents), new `ExpectedDocuments.tsx`, `CloseIssues.tsx`; `DocumentsEmptyState.tsx` (ordering by
  `protected`/type instead of `required`); `DocumentsWorkspace.tsx` (Secondary title from the tab label);
  `DocumentPane.tsx` (missing tab content for dangling).
- `features/documents/tabs/DocumentTabsProvider.tsx` and `documentTabs.ts`: labels stay file names (derived title
  only in the tooltip); id follow with route replace.
- `features/documents/content-kinds/documentContentKinds.ts`: image and binary kinds; no Edit when
  read-only. `editor/DocumentEditor.tsx`: read-only line, refusal Alerts. `editor/useDocumentSave.ts`:
  error mapping of 5.2, `committed`.
- `features/specs/creation/`: new `options/ArchetypeSection.tsx` replacing `options/ArchetypeSummary.tsx`
  (and its story/test); `options/CreateBasicsSection.tsx` (demo); `form/CreateProjectForm.tsx` and
  `form/createProjectReadiness.ts` (archetype required, catalogue state); `operation/startCreate.ts`,
  `operation/createOperationStorage.ts` (draft keeps archetype and ticks), `workspace/model/createRequest.ts`;
  `api/api.project.ts` (catalogue from `GET /api/specs/archetypes`); `errors/createSpecErrors.ts`
  (`CATALOGUE_STALE`, `ARCHETYPE_UNKNOWN`); `progress/createPageView.ts` and
  `progress/CreateSettingsList.tsx` (two rows); `options/CreateMethodChoice.tsx` copy key only.
- `i18n/locales/en.json`, `pl.json`: section 8.
- `packages/nevo-ui`: `design-system/treeRecipes.ts` (generic trailing label), `WorkspaceHeaderAction`
  busy state, and the `ItemTabs` `MiddleTruncate` whitespace bug (section 11).
- Docs: this document is listed in `docs/product/specflow/ui/README.md`.
- Docs: link this document from `documents-editor-mode.md` and `specification-creation.md`; regenerate
  the docs index. `related` names documents that exist only once PR #92 lands.

Validation scenarios for implementation fixtures: every row of the state table (section 7); a tree with
all three entry states in one folder; a long unclassified name at 280 px; an owner archetype with a
requirement on an optional suggestion; save conflict with a dirty draft on a non-active tab; classify of
the active tab with a draft; New document at 390 px with the keyboard open.
