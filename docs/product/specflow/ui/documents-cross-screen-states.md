---
id: product.specflow.ui.documents-cross-screen
type: product
title: Documents UI cross-screen states and accessibility
status: current
scope: specflow
areas: [ui, workflow]
read_when:
  - reviewing Documents and Create consistency
  - changing Documents screen error/loading states or accessibility
summary: >-
  Shared document and archetype state matrix, transitions between Create, tree and editor, and screen accessibility guarantees.
related:
  - product.specflow.ui.documents-archetypes
  - product.specflow.ui.documents-tree
  - product.specflow.ui.create-archetypes
  - product.specflow.ui.documents-editor-mode
---

# Documents UI shared states and interactions

## Shared behavior

These rules apply consistently wherever the same document or archetype is presented. Surface-specific behavior belongs to [Documents tree](documents-tree.md), [Create archetypes](create-archetypes.md) and [Editor mode](documents-editor-mode.md).

- **Type identity:** A file row uses one icon slot. A recognized `documentTypes[].icon` takes precedence over the format icon; otherwise the format icon remains. Type identity is still available through the row's accessible name, tooltip, menu, document header and opened-tab metadata. Tabs retain the file name, not `DocumentContent.title`.
- **Unclassified and missing files:** Unclassified files remain in their folders, with **Assign type** first in the menu. Dangling registry entries remain in the tree with **File missing** and can be unregistered.
- **Required documents and blockers:** Close-refusing issues appear above unmet **Expected documents**, each with **Add**. Completed requirements and nonblocking summaries do not occupy this region.
- **Document actions:** **New document** selects a type and editable file name; **Assign type** uses the same type chooser without the file name or untyped choice. The selected archetype can suggest types.
- **Create:** Archetypes appear as a radio list with `useWhen`; selected instructions are disclosed on demand and optional document templates use preselected checkboxes.
- **Read-only:** The document header explains why editing is unavailable. The tree shows any Specification-wide reason once.
- **Saving:** Save is the primary action; while saving it reads `Saving…` and is unavailable. The editor stays editable, the dirty marker clears only after acknowledgement, and a refusal preserves the draft.
- **Non-text files:** Images and binary documents open in tabs, with an image viewer or file information and **Download**. They never enter Edit or Save.

## Cross-screen transitions

1. **Create → Documents:** the created Specification opens; its tree shows the scaffolded
   documents; Expected documents is absent for every built-in archetype.
2. **Expected documents → Add → New document → new tab in edit:** the requirement row disappears as soon
   as the tree reports it satisfied; the live region announces "<type> added".
3. **Unclassified row → Assign type → row label clears, tab follows the id.**
4. **Dangling row → missing tab → Remove registration → tab closes, row disappears.**
5. **Read-only reasons** are the same strings in the tree line, the row-menu note, the tab line and the
   save refusals (one key per ActionReason).

## State matrix

| State                                    | Tree pane                                              | Document area                                                                                                      | Actions changed                                                                                  |
| ---------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| All requirements met, no blocking issues | tree only                                              | idle or tabs                                                                                                       | none                                                                                             |
| Requirement unmet                        | Expected documents; Add only with `createFile`         | -                                                                                                                  | Add → New document (type preselected)                                                            |
| Close-refusing issue                     | attention Alert at top                                 | -                                                                                                                  | none (fix on disk)                                                                               |
| Unclassified file                        | none (Assign type in the row menu)                     | opens normally (edit if `editable`)                                                                                | Assign type first in menu                                                                        |
| Dangling entry                           | warning glyph, `File missing`                          | missing tab with Remove registration                                                                               | only Remove registration                                                                         |
| Overview                                 | first row, slightly stronger name                      | normal                                                                                                             | menu holds only the type and the `protected` note                                                |
| Specification read-only                  | read-only line above tree; New/Upload disabled; no Add | read-only line in every text tab                                                                                   | no Edit, no Save                                                                                 |
| Not editable file                        | -                                                      | read-only line `not-editable`                                                                                      | no Edit                                                                                          |
| Saving                                   | -                                                      | Save `Saving…` disabled                                                                                            | Discard disabled                                                                                 |
| Save refused                             | -                                                      | Alert as described in [Editor mode](documents-editor-mode.md#document-tab-behavior-and-refusal-states), draft kept | as described in [Editor mode](documents-editor-mode.md#document-tab-behavior-and-refusal-states) |
| Image / binary                           | `image` / `file-binary` glyph                          | viewer / info + Download                                                                                           | Download promoted; no Edit/Save                                                                  |
| Tree truncated                           | quiet note after the last row                          | -                                                                                                                  | -                                                                                                |
| Skipped entries                          | attention note under the search, before the rows       | -                                                                                                                  | -                                                                                                |
| Revision conflict on save                | -                                                      | Alert, draft kept                                                                                                  | Save unavailable until Copy my version / Load from disk                                          |
| Create: catalogue loading / failed       | -                                                      | -                                                                                                                  | Create disabled with prerequisite / Alert with Retry                                             |
| Create: unticked required suggestion     | -                                                      | -                                                                                                                  | informational line, Create allowed                                                               |

Geometry that stays stable across states: tree row height and tracks, header action slots, tab widths,
the Create form order.

## Accessibility and interaction

- **Tree rows:** the type (visually hidden) and the state label are part of the row button's text, so the
  accessible name reads "login-flow.md UX" / "backend.md File missing". The row tooltip opens on hover and
  on keyboard focus. The glyphs are decorative.
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
