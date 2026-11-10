---
id: product.specflow.ui.shell-geometry
type: product
title: App Shell geometry decisions
status: current
read_when:
  - changing the width or position of the Specifications list, Create Specification or a Specification screen
  - changing AppWorkspace fit, the Focused frame or the Bounded workspace rule
  - adding a section to Specification Overview or changing its columns
  - picking up an open UX finding about the shell, the navigator or mobile
summary: >
  Owner decisions of November 2026 on SpecFlow screen geometry: one Focused frame that grows to
  1440 px for the Specifications list and Create, full width inside a Specification, a two-column
  Create and Specification Overview, the alternatives that were rejected and why, and the UX
  findings left open for later work.
related:
  - design-system.principles.layout-and-containment
  - design-system.implementation.react.secondary-navigation
  - product.specflow.specification-creation
  - product.specflow.ui.interaction-model
  - product.specflow.ui.specification-overview
  - product.specflow.ui.specs-overview
---

# App Shell geometry decisions

This record keeps what the November 2026 UX audit and its rendered layout prototypes decided. The
audit and the prototypes are not kept. The rules themselves live in the documents that own them:

- the Bounded workspace rule in
  [Layout and containment](../../../design-system/principles/layout-and-containment.md);
- Create in [Specification creation](../specification-creation.md);
- Specification Overview in [Specification overview](specification-overview.md);
- the Specifications list in [Specifications list](specs-overview.md).

## Problem

On wide desktops the shell changed geometry on almost every step: the navigation moved and the
workspace changed width between the Specifications list, Create, Specification Overview and
Documents (8 of 9 steps of one ordinary journey at 1920 px). Wide screens also showed large empty
bands, while the Create form and Specification Overview stayed in one narrow column.

## Decisions (owner, 2026-11-07)

| Topic                  | Decision                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Screen modes           | Two modes. **Focused**: the Specifications list and Create Specification, sharing one frame. **Workspace** (the screen mode, see [vocabulary](../../shared/vocabulary.md#git-and-workspace-vocabulary)): everything inside a Specification (Overview, Documents, Session), at full width.                                                      |
| Focused frame width    | `grow`: `min(available width, 1440 px)`, border included, centred only once it reaches 1440 px. Pure CSS on the existing shell clamp. No measurement or timer decides the width.                                                                                                                                                               |
| Specification boundary | One geometry change when entering or leaving a Specification is accepted. Below a 1708 px viewport there is none, because the Focused frame already fills. No extra breakpoint shrinks the jump.                                                                                                                                               |
| Specifications list    | Fills the frame with bounded column tracks, so related values stay together. Text blocks above the rows (search, notices) keep the title-column width.                                                                                                                                                                                         |
| Create Specification   | Stays Focused, keeping the creation process. Two columns from a 992 px form column, container-based: what is created on the left, who starts it and where on the right. Keyboard order equals reading order. No preview panel. Controls are capped at 34rem. The progress page keeps the frame and `content-form`, so nothing moves on submit. |
| Git settings in Create | Three decision rows: Start from, Merge into, Branch name. Each has one quiet action, Change or Restore default. No accent container and no switches. The commit note refers to the branch shown above. Git request semantics unchanged.                                                                                                        |
| Blocked Create         | The button stays focusable (`aria-disabled`). Activation leads to the first faulty field in form order, with an inline error and an announcement, and never sends a request.                                                                                                                                                                   |
| Specification Overview | Two columns from 1408 px of content width (container, not viewport), in the `side` hierarchy: Requires attention, then Tasks on the left; Continue session, then Documents on the right. One column below the threshold, or when one side has nothing to show. Continue session is one fully clickable row.                                    |
| Activity history       | Stays in the Secondary. An empty history does not open or reserve it; it is available on demand. The user's explicit choice persists per Specification for the visit.                                                                                                                                                                          |
| Design System          | The Bounded workspace rule changes together with the code: `fit="bounded"` is now the Focused frame.                                                                                                                                                                                                                                           |

## Rejected alternatives

| Alternative                                                                 | Why it was rejected                                                                                                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A fully pinned, full-width shell for every screen                           | It moved the problem into the content: forms and lists stretched across 2000 px.                                                           |
| `snap240`: anchor the shell left while less than 240 px is left over        | It caused a jump while resizing at 1610 px. Its JavaScript measurement also painted one wrong frame when leaving a Specification.          |
| `fill`: fill below 1610 px, then a fixed 1102 px frame                      | It was a breakpoint in effect: the frame shrank by 230 px at 1610 px.                                                                      |
| `center`: a fixed 1102 px frame, always centred                             | It was stable while resizing, but the navigation moved on every crossing of the Specification boundary. `grow` removes that up to 1708 px. |
| A 2200 px breakpoint to shrink the Specification-boundary jump              | It adds a breakpoint without removing the jump.                                                                                            |
| Create Specification in the Session shell, with a preview panel (variant E) | The preview only mirrored the form, and the creation process stays as it is.                                                               |
| Activity history inside the Overview page on very wide screens (A3h)        | It needed a viewport breakpoint and duplicated the Secondary.                                                                              |
| Spec Overview `left` (Continue session between attention and Tasks)         | It pushed Tasks about 180 px down, below the fold on ordinary windows.                                                                     |
| Spec Overview `row` (attention and Continue session side by side)           | It left empty bands whenever one of the two was missing.                                                                                   |
| The whole Specifications list capped at a reading width                     | It left a 320 px empty band inside the 1440 px frame.                                                                                      |

## Open findings for later work

These findings came from the audit and stay open. None of them is part of the geometry work.

- **A Session loses the Specification context.** The navigator recognises a Specification only from
  its own route. Opening a Session, even one started inside the Specification, drops Overview,
  Sessions, Tasks and Documents from the navigator. The root cause is that the managed Sessions
  contract has no durable Session-to-Specification association. This needs a contract design first;
  passing an id to the navigator is not enough.
- **The same Session appears three times:** in the navigator, in Requires attention and in Continue
  session. This needs an information-model decision. The navigator could show places with counts
  and state rather than full object lists, and "2 active" could split into waiting for you and
  working.
- **Tasks in the navigator is an anchor, not a view.** It scrolls Overview and moves the active
  highlight away from Overview.
- **Attention does not roll up** from a Task to its row or to the Specification.
- **The Specification switcher shows no state:** no attention or progress per item, and no New
  specification action.
- **Session start card:** the Composer placeholder asks to choose an agent that is already chosen.
- **A pending agent question adds a second active input** next to the Composer. The structured answer
  stays; the open problem is having two competing inputs.
- **Conversation width:** assistant messages are wider than the centred Composer.
- **Documents at 1280 px:** navigation, tree and document together leave little room. Possible
  directions are a collapsible tree or icon-only navigation.
- **Mobile:**
  - The Session has no header with its name and state.
  - The Specification header only says Overview.
  - The Session start card cuts off Start session.
  - Back from a pushed Task preview leaves the Specification instead of closing the preview.
- **Demo mode:** Managed Sessions are not configured, so Open session leads to an error.
- **Smaller items:**
  - A Task row shows its key twice.
  - The Sessions list shows developer text, and its button says New conversation while the header
    says New session.
  - Section headings skip a level when Requires attention is absent.
  - Fixtures mix English into the Polish UI.
- **Storybook:** default stories show edge cases. Each screen should get one ordinary, single-language
  default story; see the Storybook rework proposal (#113).
- **Implementation notes found on the way:**
  - `ScrollArea` leaves an animation-frame callback queued after unmount. It is harmless, because the
    callback checks its refs, but it is never cancelled.
  - Entering Documents can show one frame with a 1 px workspace width. This happened before this
    work as well.
