---
id: ideas.specflow-ui.components.secondary-tabs-redesign
type: product
title: Secondary tab rail and local Back — IDE-style redesign variants
status: current
scope: specflow
areas: [ui]
tags: [secondary, tabs, item-tabs, back, navigation, workspace, ide]
read_when:
  - reviewing or choosing the redesign of the split Secondary's tab rail or its local Back
  - promoting the chosen variant into ItemTabs and AppWorkspace
summary: >
  Decision record: the owner chose variant A (editor tabs) for the split Secondary's root-tab rail
  and local Back, implemented; this note keeps the three IDE-style variants that were weighed, the
  owner-decision history they reverse and the owner's changes to A. The normative rules live in
  secondary-navigation and item-tabs.
related:
  - design-system.implementation.react.secondary-navigation
  - design-system.implementation.react.item-tabs
  - design-system.principles.layout-and-containment
  - design-system.principles.information-hierarchy
  - ideas.specflow-ui.components.session-work-inspector
---

# Secondary tab rail and local Back — IDE-style redesign variants

**Status: decided and implemented (2026-11-03).** The owner chose **A, Editor tabs**, with four
changes: (1) no tab icons, so the "Context shrinks to its icon" and "drop icons" steps are gone and
overflow is: shrink the widest tabs, then the existing 120 px minimum, then the `Opened (N)` menu;
(2) the active tab's top edge is the neutral separator colour, not a primary accent line; (3) the
ToolAction detail gets a 20 px rhythm between its header, PARAMETRY and the response; (4) the
Documents tab strip keeps its current look (the editor look is `density="rail"` only). The
normative result is in
[Secondary navigation](../../../design-system/implementation/react/secondary-navigation.md), "Root
tabs and local navigation", and [Item tabs](../../../design-system/implementation/react/item-tabs.md);
the prototype was deleted. The text below is the history and rationale, kept as it was written
(rollout item and open-question wording refers to the proposal stage).

## 1. Problem

Owner, live review on desktop (2026-11-03): the tabs and the back row "look simply bad … should look
more like typical IDE tabs; now it is tiny and cramped". Measured cause in the current build:

- the rail is 32 px with 12 px / 600 labels (`text-label-sm`), 10 px side padding and 2 px gaps;
- the back row is 24 px with 12 px text, a link-style control in a bar of its own;
- both sizes come from one constraint — rail + back row = the Primary header's 56 px, so the
  dividers line up (round 3) — which forces two sub-control-height rows into 56 px.

The user question the rail answers is unchanged: _which of my open panel views am I looking at, and
how do I switch or get back?_ Only the presentation is in question; the tab model (root label,
pinned Context, close, overflow, tablist semantics, mobile header navigation) is not reopened.

## 2. Owner-decision history and what each variant does with it

| Round | Owner decision                                                                     | A Editor tabs                                                  | B Underline, IDE size            | C Header-aligned                       |
| ----- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------- | -------------------------------------- |
| 1     | Tabs must read as tabs: distinct tab backgrounds, small gaps                       | Kept: strip vs active surface; 1 px separators instead of gaps | Not met (no fills), as today     | Not met (no fills), as today           |
| 2     | Tabs were too big — shorter                                                        | 36 px, between round 2 and today                               | 40 px                            | **Reversed**: 56 px tabs               |
| 3     | No rounded tops, no free space above, full-height tabs                             | Kept                                                           | Kept                             | Kept                                   |
| 3     | Rail + back row = 56 px so dividers align with Primary                             | **Reversed**: 36 px rail, no back row                          | **Reversed**: 40 / 76 px         | Kept at every depth (back row removed) |
| 4     | Compact content-width tabs                                                         | Kept: content width, same fit policy                           | Kept                             | Kept                                   |
| 4     | Active = underline + text colour, no card-like rectangles                          | **Reversed in part**: active = panel surface + top accent      | Kept                             | Kept                                   |
| 4     | Simple "← Wróć do …" for shallow stacks; breadcrumbs opt-in only; no extra headers | Back kept, moved beside the detail title; no bar               | Back kept as a 36 px sub-toolbar | Back kept, beside the detail title     |
| —     | One panel-level X removed; Context pinned, not closable; mobile header unchanged   | Kept                                                           | Kept                             | Kept                                   |

A's "card-like" reversal is narrow: the round-4 objection was to separate rounded rectangles with
gaps; editor tabs are square, touch each other and the active one is not a card — it is the top of
the content surface. This is how round 1 (tabs read as tabs) and round 4 (no cards) are reconciled.

## 3. Reference patterns (public IDE defaults, approximate; not user research)

- **VS Code / Cursor** — 35 px editor tabs, 13 px regular labels, file icon, inactive tabs on a darker
  tab bar, the active tab in the editor's background (it merges into the content), 1 px tab borders,
  optional top accent on the active tab, `x` always on the active tab and on hover for others,
  pinned tabs first and optionally compacted to the icon.
- **Zed** — the same surface model on a slightly shorter bar; Back/Forward arrows sit at the start of
  the tab bar.
- **JetBrains (New UI)** — about 40 px tabs, regular labels with a file icon, no per-tab fill, the
  active tab marked by an accent underline.

In these products the panes' top bars generally share one height. Here the Primary header is 56 px
product-wide, which no IDE tab bar matches; see §6.

## 4. Shared rules (all variants)

- **Semantics unchanged.** `tablist` / `tab`, roving tabindex, manual activation, Delete and
  middle-click close, the `x` in a layer outside the tablist and out of the tab order, focus after
  close, the `Opened (N)` menu, tab label = stack root at every depth.
- **Typography.** Labels `body-md` (14 / 400) for every tab, active included (no width jump on
  activation), replacing `label-sm` (12 / 600). The Primary title stays `title-sm` (14 / 600), so
  the tabs sit below it in the hierarchy. Detail title `title-sm`, status `body-sm`, as today.
- **Icons.** Every tab carries its 14 px icon (`ItemTab.icon` already exists): Kontekst `book-open`,
  Historia pracy `clock`, Pliki / zmiany `branch` in the prototype (illustrative, see §8).
- **Close.** 24 px `x` in a 32 px end slot reserved on closable tabs, shown on the active tab, on
  hover and focus, always on coarse pointers (44 px hit area) — unchanged.
- **Pinned Context.** First, no `x`, no reserved end slot, never in the overflow menu. New:
  progressive compaction before any label truncates —
  1. the pinned tab compacts to its icon (accessible name and tooltip keep "Kontekst");
  2. the other tabs drop their icons;
  3. only then the existing `fitItemTabs` rule: long tabs shrink to 120 px, the rest go to the menu,
     the active tab always visible.

  Rendered result: at 330 px all three tabs show their full labels in every variant.

- **Width policy.** Content width, 64-240 px, as today, with the new chrome numbers (12 or 16 px
  padding, 14 + 8 px glyph, 32 px close slot, no gaps).
- **Mobile / stacked.** Not changed: its header Back + title + Close stay.

## 5. Variants

Prototype: Storybook `Design System/Proposals/Secondary tabs`
(`packages/nevo-ui/src/app/workspace/proposals/secondaryTabs/`), each at 330 / 450 / 585 px beside
the real 56 px Primary header, at a tab root and in a Work history → ToolAction detail.

| Property          | A Editor tabs                                                                                                                                     | B Underline tabs, IDE size                                                                                     | C Header-aligned tabs          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Rail height       | 36 px (`--spacing-control-height-default`)                                                                                                        | 40 px (new value)                                                                                              | 56 px (`h-14`, Primary header) |
| Tab padding       | 12 px                                                                                                                                             | 12 px                                                                                                          | 16 px                          |
| Strip vs tab      | Strip and inactive tabs: darker (`canvas` 60 %)                                                                                                   | No fills; rail divider under all tabs                                                                          | As B                           |
| Active tab        | Panel surface (no bottom border, merges into content) + 2 px `action-primary` top accent + `content-primary` text                                 | 2 px `action-primary` underline on the divider + `content-primary` text                                        | As B                           |
| Separators        | 1 px `border-subtle` on every tab's end edge                                                                                                      | None                                                                                                           | None                           |
| Hover (inactive)  | `surface-hover` + primary text                                                                                                                    | Same                                                                                                           | Same                           |
| Local Back        | `←` ghost `IconButton sm` leading the detail's identity row (title + status), tooltip and name "Wróć do: Historia pracy"; the row does not scroll | 36 px sub-toolbar under the rail: ghost control "← Historia pracy" (`body-md`), name "Wróć do: Historia pracy" | As A                           |
| Navigation height | 36 px at every depth                                                                                                                              | 40 px root, 76 px detail                                                                                       | 56 px at every depth           |
| vs Primary 56 px  | Deliberately not aligned                                                                                                                          | Not aligned                                                                                                    | Aligned always                 |

Trade-offs and failure modes:

- **A** answers the request literally (it is the VS Code / Cursor tab bar) and reads as tabs without
  cards. The rail height never changes with depth, and Back sits next to the title it returns from,
  so no thin bar is needed. Risks: the dividers no longer line up with Primary (a round-3
  reversal); the strip/surface contrast is subtle on the dark material (the strip fill may need a
  dedicated token value after a live look); and a Back control inside the content row needs a
  workspace-owned identity row (see §7).
- **B** is the smallest change: today's semantics at IDE size, which shows whether "tiny" was only
  about size. Risks: without fills it still reads as a link row more than tabs (the round-1
  complaint), and in a detail it adds a second bar (76 px of chrome), contrary to round 4's "no
  extra headers".
- **C** keeps the round-3 alignment at every depth and removes the separate back row. Risks: 56 px
  tabs are large for a 330 px panel (round 2 said "too big") and spend vertical space on every tab;
  it looks like page-level navigation rather than editor tabs.

Not prototyped, for the owner: **D — lower the Primary header to 36-40 px** so both panes share one
IDE height (true IDE alignment). Product-wide, outside this element's scope.

## 6. Recommendation: A, Editor tabs

A is the only variant that matches the reference the owner named, keeps tabs reading as tabs without
cards, and fixes "tiny" without adding chrome: one 36 px rail at every depth, 14 px labels with icons,
and Back as a real 32 px control beside the detail title. It reverses two earlier decisions, which
the owner must accept explicitly:

1. **Divider alignment with Primary (round 3).** Alignment caused the 32 + 24 px split. A trades it for
   a constant rail; C is the alternative if alignment matters more than tab size.
2. **Active marker (round 4).** Underline-only becomes panel surface + top accent (IDE editor
   tabs). B is the alternative if the underline must stay.

## 7. Rollout of A (after owner approval)

Design system (`@nevo/ui`):

1. `design-system.css`: `--spacing-tab-rail` becomes `var(--spacing-control-height-default)` (36 px);
   add `--color-tab-strip` (prototype: `canvas` at 60 %) for the strip and inactive tabs; rewrite the
   "together exactly the 56 px workspace header" comment. `--spacing-breadcrumb-row` stays only for
   the opt-in breadcrumb row.
2. `ItemTabs.tsx`: the editor look for both densities (`body-md`, `pl-3` / `pr-8` / `pr-3`, no gap,
   top accent, separators, strip fill on inactive tabs and a trailing filler that carries the strip
   and its divider); the measuring layer uses `body-md`; `density="rail"` root = full rail height
   (the strip draws its own divider). Add the progressive compaction (§4) as a step before
   `fitItemTabs`, with unit tests.
3. `itemTabsLayout.ts`: `ITEM_TAB_GAP` 0, padding 12, glyph 14 + 8, estimated char width for 14 px;
   update `itemTabsLayout.test.ts`. The secondary switcher threshold keeps its formula.
4. Tab icons: `defineSecondaryStack({ tabIcon })` and `useRegisterPinnedSecondaryTab({ title, icon })`,
   passed through `withSecondaryTabStrip` into `ItemTab.icon`.
5. `AppWorkspace.tsx`: the rail row drops `px-2` and its `border-b`. For `localNavigation: 'back'`,
   replace `SecondaryBackRow` with a workspace-owned, non-scrolling **detail identity row**:
   `BackAction`-style ghost `IconButton sm` (name and tooltip `labels.backToParent(parent)`) followed by
   the screen's declared `header` component (`WorkspaceHeaderIdentity`-like product content). The
   workspace keeps owning Back, as the agent checklist requires. Delete `SecondaryBackRow.tsx`.
6. Tests and contracts: `AppWorkspace.test.tsx` (rail class, back row), `ItemTabs.test.tsx`,
   `ItemTabs.contract.stories.tsx`, `SecondaryLocalNavigation.contract.stories.tsx` (`assertRail`:
   36 px, active surface + top accent instead of underline-only; back affordance in the identity
   row), `AppWorkspaceDynamicSplit.contract.stories.tsx`.

Product (`@nevo/specflow-ui`):

7. Session stacks declare tab icons; the single-ToolAction screen declares `ToolActionHeader` as its
   screen `header` instead of rendering it inside the content; update
   `ManagedSession.workDetail.stories.tsx` and the interaction stories.

Documents:

8. `DocumentTabStrip` (`density="header"`) inherits the new tab look because both densities share it
   (item-tabs.md). Its 36 px tabs then sit at the bottom of the 56 px header with a 20 px band above
   them, which is the "free space above" removed for the Secondary in round 3 — **owner decision**
   (§8). Fallback: scope the editor look to `density="rail"` and keep Documents unchanged.

Docs:

9. Promote the decided behaviour into `secondary-navigation.md` ("Root tabs and local navigation":
   Tab rail, Back, Heights) and `item-tabs.md` (Placement, Tab look, Width), update the Session Work
   inspector spec's back row wording, then delete the prototype folder and mark this document as
   history.

## 8. Open questions for the owner

1. Pick A, B or C (or D, a lower Primary header).
2. With A: accept that the rail no longer lines up with the 56 px Primary header?
3. Documents strip: same tab look (with a 20 px band above in its 56 px header), or keep it as is?
4. Tab icons for Kontekst / Historia pracy / Pliki / zmiany (prototype glyphs are placeholders).
