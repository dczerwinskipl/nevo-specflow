---
id: product.specflow.ui.documents-tree
type: product
title: Documents tree, classification and expected files
status: current
scope: specflow
areas: [ui, workflow]
read_when:
  - changing Specification Documents tree or its visual hierarchy
  - reviewing expected, missing, unclassified or skipped document rendering
summary: >-
  Tree scan, registry and unclassified/missing states, type/registration actions, close-refusing issues and required documents.
related:
  - product.specflow.ui.documents-archetypes
  - product.specflow.ui.documents-cross-screen
  - architecture.runtime.document-manifest-and-registry
---

# Documents tree and expected files

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
 [Search files                ] [filter]   search by name or path; type filter (multiple choice), only with 2+ types
 ! 1 entry in the folder could not be read. attention note before the rows (skipped-entry; not a Close refusal)
   overview.md                             main file first: its type icon in the folders' chevron column,
                                           the name right after it, slightly stronger, room below
 v architecture
     login-flow.md                         tooltip: UX
     sequence.png                          image glyph; tooltip: Note
 v notes
     meeting-2026-10-20.md
     token-sample.bin                      other-file glyph
 ! backend.md               File missing   (warning glyph and label in attention tone)
   behaviour.md                            tooltip: Behaviour
   ux.md                                   tooltip: UX
 i Only the first entries are listed.      quiet note after the last row (truncated)
```

- **Wide (≥ 1080) and Compact (840-1079):** as above; Compact keeps the tree at 1/3. **The state label
  (File missing) never hides: the file name truncates instead** (full name in the tooltip and Show path).
- **Narrow (< 840):** the tree page is the same column at full width; nothing moves into a drawer.
  Verified at 390 px: no horizontal overflow, labels visible.
- **Ultra-wide:** unchanged; the tree stops at 360 px, the document gets the rest.

Order: the specification's main file (the protected `overview`) first, then folders A-Z, then files A-Z
(its tooltip and its `...` say why: the specification's main document, always first, not deletable);
state never reorders. Dangling entries are placed at their registered path.

- **Search and type filter.** Above the tree: a search by file name or path and, when the tree has at least two types, a multiple choice of types (with **No type** for unclassified files) behind one small filter button that shows how many are chosen (**No type** last, apart).
- While a filter is on, the folders holding a match are open, a status line says how much is shown ("Showing 1 of 7 files") beside **Clear filters (n)**, the rows keep their indentation, and a missing file the filters hide is announced ("The filters hide 1 missing file.") so a problem is never hidden silently.
- Nothing matching: the tree pane's shared empty search result (`TreeSearchEmpty`, the same as the documentation reader's) with Clear filters.
- Expected documents and the Close issues above the tree are never filtered.
- The search bar, the empty result and the order and tones of the tree's messages (status, attention notes, the list or the empty result, quiet notes) follow [Tree pane](../../../design-system/implementation/react/component-tree-and-scrolling.md#tree-pane).

**Rename refusal.** A refused name is shown at the field, over the rows below (the list does not shift),
with the full text; the field keeps focus and the typed name.

### 3.3 Row grammar

| Entry                     | Glyph                                                        | Name                                | Trailing label (muted unless noted) | Row press                      | Row menu                                               |
| ------------------------- | ------------------------------------------------------------ | ----------------------------------- | ----------------------------------- | ------------------------------ | ------------------------------------------------------ |
| Registered                | the type's icon, else format: `file`, `image`, `file-binary` | file name (type in the tooltip)     | the document state label (below)    | open tab                       | **Type: UX** label, Rename, Move, Delete               |
| `overview.md` (protected) | `file`                                                       | file name, slightly stronger, first | none                                | open tab                       | only the note with the type and the `protected` reason |
| Unclassified              | as above                                                     | file name                           | none                                | open tab                       | **Assign type**, separator, Rename, Move, Delete       |
| Dangling                  | `triangle-alert` (attention)                                 | file name, muted                    | `File missing` (attention tone)     | open a missing tab (3.6 / 5.5) | **Remove registration** (danger)                       |

**Data for the document state.** The read carries both facts the shared document state label is
composed from; the tree never derives them. The content state is the tree document's `contentState` (`baseline` / `authored`)
(registered documents; the same value as the Overview's workspace read; absent in demo mode, so no
label). The relation to the workflow is the Specification's workflow projection `documentRelations`
(`reference.api.specification-workflow`), matched to a row by `documentId` within its `scope`. The
label is described below ([Document state label](#document-state-label)).

#### Document state label

One label vocabulary on every surface that lists documents (this tree, the Overview Documents, Task
documents), from one pure function (`documentStateLabel`, `features/documents/workflow`) rendered by
the shared tree row. It composes two separate facts; neither implies the other, and the label names
both only when both apply.

#### Document content state

- **Content state.** `baseline`: the file is still the initial content the Engine wrote (from an
  archetype template or generated, for example a new `task.md`) → **Initial content only**. It
  describes the current content relative to that baseline, not whether an edit happened.
  `authored` → nothing. Unknown (no `contentState`) → nothing.

#### Workflow relations

- **Relation.** How the workflow's gates use the document now: **Needed to finish <step>**,
  **Needed to start <step>**, **Used in <step>**. Where the active step is on screen (Overview, Task
  detail) its gates read "this step"; this tree names the step. "Needed to start" is the next step's
  gate and always names that step. A row shows the relations of its own registry only (`scope`): a
  Task step's gate on a Specification document is not shown on the Specification's rows.

#### Combined row label

- **Together.** "Initial content only · needed to finish Write the specification": the content state
  first, then the relation.

| Content state | Relation                                                       | Label (this tree)                                         | Tone                             |
| ------------- | -------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------- |
| baseline      | none                                                           | Initial content only                                      | muted (a standing fact)          |
| authored      | none                                                           | none                                                      | —                                |
| any           | needed to finish / needed to start, blocking now (`blocksNow`) | [Initial content only · n]eeded to finish / start <step>  | attention, with its warning icon |
| any           | needed to start, not blocking now; used                        | [Initial content only · n]eeded to start / used in <step> | secondary (the work at hand)     |

- The attention tone is only for a relation whose gate refuses the action the run waits for now (`blocksNow`); the content state never adds attention.
- The tooltip adds the full label, the gate and the sections it still lacks ("Needs the Acceptance section").
- In a narrow row (under `28rem`) the Overview and Task detail shorten the label: the relation drops its step ("Needed to finish", "Initial content · needed to finish"; "Used in this step" stays as it is), since Now beside it names the step.
- This tree keeps the step: only a label that does not fit beside the name takes its own line under it, right-aligned, and wraps there over more lines when it needs them (never cut); the name is not cut for it.

- While the workflow projection loads, the rows show their content state only (no layout change when the relations arrive).
- When it cannot be read, the rows keep their content state and a quiet note after the list says that the workflow's requirements could not be loaded, so no row silently reads as "not needed". (The Overview shows no label until the projection has answered, then the final ones: its header never flips between "N · initial content only" and per-row labels.) A save or a tree operation refreshes the projection, so a gate the change satisfies stops saying "needed".
- Once the run ended no gate relates a document, so a closed Specification shows only **Initial content only**.
- Rows are never reordered by their label.
- The archetype's expected types (3.4) are a separate, type-level fact and never say "needed".

Every item of a row menu has its icon (New document, New folder, Upload files, Assign type, Rename, Move,
Delete, Remove registration). Other disabled items keep today's pattern: the menu note carries at most two
distinct reasons of the ActionReason set.

- The tree starts with a root section header, **Specification documents**, that never collapses.
- Files of a main folder without subfolders start at the row edge: they are not indented as if they were in a folder.
- A tree operation that takes longer than a moment shows a small spinner in that header (never a text line under the tree); its result is a toast, its failure stays where it was started.
- A rename the file system refuses because only the letter case changes ("Renaming only the letter case is not supported on this file system. Rename it to a different name first, then to the one you want.") is shown in the rename field with the typed name kept; the UI does not block it in advance.
- After a refusal the message never suggests refreshing when a refresh cannot help.

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
- `skipped-entry` is **not** in that Alert: it is an attention note (`InlineNote tone="attention"`: a read failure the reader may need to act on) at the top of the tree, under the search and
  before the rows or the empty result, "N entries in the folder could not be read." (count from
  `skippedEntries`). The contract is inconsistent on
  whether it refuses Close; until the contract settles it, it is not presented as a refusal. If it does refuse, the line moves into the Alert.
- `truncated: true` adds a quiet note (`InlineNote`, info tone) after the last tree row: "Only the first
  entries are listed."

### 3.6 New document, Assign type, Remove registration

**New document** opens from header/folder menu or Expected documents **Add**.

- **Dialog:** title `New document`; context `In <folder>` or `In the main folder of <specification>`.
- **Types:** radio list with type title/`useWhen`. Group archetype templates under `Suggested by <archetype title>`, remaining types under `Other types`, then **No type** for an unclassified empty file. Never offer `overview`.
- **Counts:** show unmet `Expected · <count> of <min>`; otherwise `<n> in this specification` only when nonzero.
- **Default:** Add's type, otherwise first suggested type not yet used, otherwise first suggested type.

#### New document name

- Prefill from template `filename`, type `defaultFilename` or `<type id>.md`. Allow editing; append `.md` when no extension. Accept only `capabilities.formats` (`md`, `txt`) and reject collisions/invalid names.
- Changing type updates the suggested filename only before the user edits it. Explain that type controls classification, not the chosen filename.

#### Instructions and actions

- Optional `How to write a <type> document` disclosure contains type/template `instructions`, closed by default, never stored.
- **Create:** send type, applicable archetype `templateId` and path. On success announce the document and open it in a new **edit** tab.

#### Dialog layout and focus

Use one dialog at every width, with scrollable body and fixed header/footer. Create must remain reachable at 390 × 844; the 810 px-high mock with 934 px of content otherwise cuts it off.

**Assign type** uses the chooser without No type or filename. It never moves the file. On success the `u-` ID becomes a registered ID; preserve an open tab's draft/scroll, **replace** its URL, then return focus to the updated tree row.

**Remove registration** confirms removal of the dangling entry without deleting a file; close its missing tab.

**Refusals:** keep dialog, selected type and filename; show an attention Alert above the footer and reenable the action. Existing error-specific behavior:

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

### 3.7 Opening the main file, idle document area

- **Entering Documents.** On Narrow, the bare Documents route shows the tree with its search and type filter. Choosing a file opens the stacked reader; Back returns to the same tree.
- On split layouts a bare entry opens the protected overview beside the tree, replacing the navigation entry. The initial choice is made once per visit. Closing a tab or resizing the workspace does not repeat it.
- A route naming a document opens that document; drafts are not touched.

- **Idle document area.** `DocumentsEmptyState` is the shared empty screen (the design-system `EmptyState`, centred in the area, the same one as the empty Specifications list): the title "No document open", the line "Choose a document from the tree or create a new one." and, when the capabilities allow them, the start actions **New document** (the one primary action) and **Upload files** (secondary, also when it is the only one); when neither is available the line is only "Choose a document from the tree." It does not list documents: the tree beside it already does, and Expected documents in the tree names what is missing.
- No completeness, no issues here: they belong to the tree, which is also what Narrow shows first.
