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

This document owns **cross-screen transitions, the state matrix and accessibility**. It does not repeat the complete UI contracts:

- [Documents tree](documents-tree.md) owns type icons, unclassified/dangling entries, requirements, blockers and the New/Assign/Remove dialogs.
- [Create archetypes](create-archetypes.md) owns archetype selection, instructions and template checkboxes.
- [Editor mode](documents-editor-mode.md) owns read-only, Save/refusal states, drafts, tab identity, binary previews and Download actions.

Across all surfaces, one `ActionReason` determines the same read-only explanation. A successful Save is the only event that clears the editor's dirty marker; refusal retains its draft.

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

### Focus after mutation

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
