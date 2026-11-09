---
id: design-system.implementation.react.workspace-dynamic-split
type: engineering
title: Workspace dynamic split and Secondary root tabs
status: current
scope: nevo-ui
read_when:
  - adding more than one independently revisitable root area to a Secondary inspector
  - adding a draggable splitter or a left/right swap to AppWorkspace
  - implementing a screen that needs the auto/manual dynamic split behavior
summary: >
  Decision-complete contract for Secondary root tabs and the auto/manual dynamic split: owned
  state, the public API surface built on top of the existing AppWorkspace/Secondary composition,
  the auto/manual transition table, explicit non-goals, and the accessible splitter contract.
  Implemented in Nevo UI; Full Session is the first consumer.
related:
  - design-system.implementation.react.secondary-navigation
  - design-system.implementation.react.item-tabs
  - design-system.implementation.react.component-authoring-contract
  - design-system.principles.system-boundary
  - design-system.principles.ui-ux-guidelines
  - architecture.principles.normative-language
  - product.specflow.ui.full-session
---

# Workspace dynamic split and Secondary root tabs

## 1. Status and scope

This document specifies the Nevo UI capability for more than one independently revisitable root
area in a Secondary inspector and for an auto/manual dynamic split. Full Session is the first
consumer ([Full Session](../../../product/specflow/ui/full-session.md) owns the product behavior),
but nothing here names Session, Task, Spec, or any other product/workflow concept: this capability
is pure layout/geometry and belongs in Nevo UI per
[the system-boundary rule](../../principles/system-boundary.md).

**Status: implemented.** `WorkspaceContext` (root tabs), `workspaceSizing.ts`
(`resolveDynamicWorkspaceSplit`), `AppWorkspace` (`split="dynamic"`, `secondarySide`) and
`WorkspaceSplitter`. The section 5 transition table is proved end-to-end by
`AppWorkspaceDynamicSplit.contract.stories.tsx` (`FullConnectedScenarioContract`,
`NoPinnedTabDynamicSplitContract`); closing a tab activates the right neighbour, else the left one,
and the pinned tab only when no runtime tab remains (`WorkspaceContext.test.tsx`).

This document does not decide product behavior. It generalizes existing design-system mechanics
(`AppWorkspace`, `AppWorkspaceProvider`/`WorkspaceContext`, `secondaryNavigationModel`,
`workspaceSizing`, `useOpenedItems`/`ItemTabs`) to carry the accepted Full Session workspace
contract. Where the product leaves a value non-binding ("about 330px", "50/50"), this document
keeps it non-binding and says so explicitly.

## 2. Precedent and reuse — what this extends, not duplicates

The repository rule for this capability is: do not invent a parallel tab/navigation engine.
Two existing product-neutral primitives already solve most of this problem for a different
consumer, and both generalize cleanly:

- **`useOpenedItems` / `ItemTabs`** (`components/navigation/ItemTabs/`; items already carry an
  optional `closable`) is already the
  product-neutral "open a set of independently revisitable items, one active, open-activates-
  existing-instead-of-duplicating" contract, with roving-tabindex keyboard behavior, a narrow-width
  switcher, and close/guard semantics already specified in
  [Item tabs and content tabs host](item-tabs.md). Secondary root tabs are an instance of exactly
  this problem: an independently revisitable root ("Tasks", "Files", an opened file, Context) is a
  tab; a dependent detail (a Task's attempt, a ToolAction) is not a new tab, it is a push onto that
  tab's local stack. Section 4.1 below applies the same open/activate/close rules to Secondary's
  root flows; the tab collection itself lives in `WorkspaceContext`, which also owns each tab's
  flow, leave guards and scroll memory, and renders the strip through `ItemTabs`.
- **`secondaryNavigationModel.ts`** already owns one flow's push/pop/replace/stale-entry
  invariants (see [Secondary navigation](secondary-navigation.md)). A root tab's local stack is one
  instance of this existing model. Multiple tabs are multiple independent instances selected by the
  tab-set state above, not a new stack algorithm.
- **`workspaceSizing.ts`** already owns pure, testable resolvers for split/fit/content-width
  (`resolveWorkspaceSplit`, `resolveWorkspaceFit`, `capPrimaryWidth`). The auto/manual dynamic
  split is one more pure resolver in that module, consumed by `AppWorkspace` the same way the
  existing ones are, not a second sizing authority.
- **`Separator`** (`components/layout/Separator/`) is a decorative, non-interactive divider
  (`role="separator"`, no `tabIndex`, no value). It is not reused for the draggable splitter:
  a window-splitter is a distinct, focusable, value-bearing interaction pattern (section 4.3), so
  it is a new component rather than a configuration flag on `Separator`, consistent with
  [composition over configuration explosion](../../principles/system-boundary.md).

## 3. Owned state

All of the following is owned by Nevo UI (`AppWorkspaceProvider` plus `AppWorkspace`'s layout
resolution), scoped exactly like today's Secondary flow: per `scopeKey`, reset when `scopeKey`
changes, independent of route/URL.

1. **Secondary open/closed** — already exists (`AppWorkspace.Secondary`'s `open`/`onOpenChange`,
   so a dismissed default Secondary stays dismissed).
   Generalizes unchanged to "the whole tab region is shown or hidden"; tabs/flows/sizing survive
   while hidden (section 9, item 3).
2. **Root tabs** — an ordered set, one entry per independently revisitable root. The set is composed from up to three independent sources,
   all optional except that at least one must be present for Secondary to show anything:
   - **The pinned entry** — today's declarative `AppWorkspace.Secondary` content, present only
     when `AppWorkspace.Secondary` is rendered with `open !== false` (§9 item 2; see §4.1 for the
     no-pinned-tab case, which is real and already supported by today's `AppWorkspace`).
   - **The legacy `open()` slot** — at most one entry, present once `open()` has been called and
     not yet closed, regardless of which `SecondaryStackDefinition` was passed to it (§4.1).
   - **`openTab()`-opened entries** — zero or more, one per distinct computed **tab instance id**
     (§4.1).

   Each entry has:
   - a stable **tab instance id** (`id`), distinct from its **definition id**
     (`SecondaryStackDefinition.id`, which stack/root _kind_ this is — used for display/debugging
     and, for `openTab()`, as part of deriving the instance id; never used alone as the tab's
     identity — see §4.1 for why conflating the two was the P1 bug this revision fixes);
   - `closable: boolean` (`false` only for the pinned entry; the legacy slot and every `openTab()`
     entry are closable);
   - its own local navigation flow: current page, local back/forward stack, scroll, focus —
     exactly today's per-flow state, one instance per tab instead of one instance total.

3. **Active tab id** — which root tab is currently shown. Switching tabs changes only this value.
4. **Sizing mode** — `'auto' | 'manual'`, scoped to the workspace, independent of which tabs are
   open.
5. **Ratio** — the current Primary/Secondary split. In `auto` mode it is computed (section 4.2,
   never persisted); in `manual` mode it is the last value the user set by dragging, clamped to
   section 4.2's valid range for the current `availableWidth`. The last manual ratio set by the user
   is retained even while width or tab count would currently force a different rendered split, so it
   can be restored verbatim once conditions allow it again (a temporary clamp never rewrites the
   user's manual preference).
6. **Side** — `'start' | 'end'` (Secondary before or after Primary). Default `'end'` (today's only
   behavior). Swapping changes only this value.

Explicitly **not** owned state, because it must not influence the above (section 6): which page is
active inside a tab's local stack, dependent-detail depth, or any Session/product runtime fact (new
message, new Work, new Turn). The scroll offsets inside a tab are remembered per `(tab id, stack
entry)` and restored when it is shown again (see
[Secondary navigation, "Root tabs lifecycle"](secondary-navigation.md#root-tabs-lifecycle)), but
they never feed the sizing/side state above; selection and drafts remain product state.

## 4. Public API

### 4.1 Root tabs

A root tab's identity is not its definition id alone. Products want two different things from an
`open`-shaped call:

1. **One tab for this definition, always showing the latest params** (for example a Task
   workspace's Material or History detail, which replaces the previous one).
2. **One tab per distinct entity, all independently open and revisitable at once** (for example
   Work history of Turn A and of Turn B as two tabs).

A single `open(definition, params)` cannot be both, so there are two methods sharing the same
tab-set state and the same `definitionId`/`tabInstanceId` distinction:

```ts
interface SecondaryTabsState {
  tabs: ReadonlyArray<{ id: string; closable: boolean; title: string }>;
  activeTabId: string | null;
}

interface SecondaryStackDefinition<TRoot, TData, TPages> /* existing, extended */ {
  id: string; // definition id — "which stack/root kind", unchanged meaning
  /**
   * Opt-in: derives a tab's identity from its open params, so distinct params produce distinct,
   * independently-open tabs under `openTab`. Omit for a definition that only ever wants a single
   * tab (the common case today). Has no effect on `open` (see below) — `open` never multiplies.
   */
  instanceId?: (params: TRoot) => string;
  // ...existing initial/screens/useData fields, unchanged
}

interface WorkspaceContextValue /* existing, extended */ {
  // existing: secondary, secondaryDepth, canGoBack, transition, back, close, canLeaveScope
  // plus trail/backTo (breadcrumbs, secondary-navigation.md "Root tabs and local navigation")
  /**
   * Unchanged signature AND unchanged observable behavior from today: always creates-or-replaces
   * the single "legacy open slot" tab, regardless of which `definition` is passed and regardless
   * of `definition.instanceId` (which `open` never consults) — this is deliberately today's
   * discard-the-prior-flow-and-start-this-one semantics, now expressed as one tab in the
   * generalized tab set instead of the sole flow. Existing callers observe zero behavior change
   * (section 8).
   */
  open: <TRoot extends object, TData, TPages extends object>(
    definition: SecondaryStackDefinition<TRoot, TData, TPages>,
    params: TRoot,
  ) => Promise<boolean>;
  /**
   * New. Opens or activates a tab keyed by `tabInstanceId` (below), the generalized "one tab per
   * independently revisitable root" operation the rest of this section describes. Use this, not
   * `open`, for a product that wants multiple simultaneous tabs of the same definition.
   */
  openTab: <TRoot extends object, TData, TPages extends object>(
    definition: SecondaryStackDefinition<TRoot, TData, TPages>,
    params: TRoot,
  ) => Promise<boolean>;
  tabs: SecondaryTabsState;
  activateTab: (id: string) => Promise<boolean>;
  /** Consults the target tab's own leave guard, exactly like `back`/`close` do today. */
  closeTab: (id: string) => Promise<boolean>;
}
```

- **`tabInstanceId` derivation (used by `openTab` only):** when `definition.instanceId` is
  provided, `tabInstanceId` is `definition.id` joined with `definition.instanceId(params)` (for
  example `"work:turn-42"`); when it is omitted, `tabInstanceId` is just `definition.id`. Omitting
  `instanceId` on the definition means `openTab` behaves like a single named tab for that
  definition (create once, then activate unchanged on every later call with that id) — still a
  strict generalization, just not a multiplying one. Providing `instanceId` (e.g. `(params) =>
params.turnId`) makes every distinct derived value its own tab.
- **`open(definition, params)`** keeps its exact current signature **and its exact current
  observable behavior**: it always targets one reserved slot (not keyed by `definition.id` or any
  derived instance id) that is shared across every `open` call regardless of which definition is
  passed, exactly like today's single nullable flow. Calling it when the slot is empty creates a
  tab there at the registered initial page and activates it (now a `closable: true` entry in the
  tab set, so it participates in the tab strip/sizing like any other tab). Calling it again —
  with the same or a different definition, same or different params — **replaces** that slot's
  entry: discards its local stack/scroll/focus and starts fresh at the new definition's initial
  page with the new params, then activates it. This is deliberately NOT "activate unchanged";
  that rule belongs to `openTab` below. Because the slot is global and replace-on-every-call, this
  is the operation that preserves §8's recorded consumer patterns byte-for-byte (see §8).
- **`openTab(definition, params)`** is the generalized, multi-tab-capable operation: compute
  `tabInstanceId` as above; if no tab with that id is open, create one at its registered initial
  page and activate it; if one is already open, activate it and leave its existing flow (page,
  local stack, scroll, focus) untouched — this is `useOpenedItems.open`'s existing rule
  ("[o]pening an item whose id is already open activates it instead of adding another"; "[a]n
  existing item keeps its stored value") applied to flows instead of generic items, now correctly
  scoped to a method whose whole contract is "the instance id is the full identity," unlike `open`.
  It is additive and never retargets: an open id keeps its flow, so a stack that can show many
  objects needs an `instanceId` per object (Session: one Task tab per Task, one Work history tab per
  Turn). Consumers today: Session (Tasks, Work history, Context placeholders) and Documents.
- `activateTab(id)` switches the active tab without touching any flow. Unknown ids are ignored,
  mirroring `useOpenedItems.activate`. Operates uniformly over pinned/legacy-slot/`openTab` entries.
  **Leaving the visible tab consults its leave guard** (its screen unmounts when it stops being
  the active one): `activateTab`, `openTab` (switch to an open tab, or a new tab) and `open` (when it
  shows the slot over another visible tab) resolve `false` and keep the visible tab when the guard
  refuses.
- `closeTab(id)` closes one tab (consulting its own leave guard via the same mechanism
  `useSecondaryLeaveGuard` already registers per entry). Closing the pinned tab is refused
  (`closable: false`), the flag `useOpenedItems` items already carry (section 9, item 1). Closing the legacy `open()` slot or an `openTab` entry behaves identically
  (both are `closable: true`): the active tab's right neighbor activates, else its left one
  (reuses `useOpenedItems`'s existing neighbor rule verbatim); closing the last remaining tab closes
  the whole Secondary region if there is no pinned tab (§3, §4.2), else leaves only the pinned tab
  active, exactly like today's `back`-at-root behavior.
- `useSecondaryStack<TPages>()` is unchanged: it is already scoped to "the flow that mounted this
  screen," which continues to mean "this tab's flow," not the whole workspace.
- `AppWorkspace.Secondary`'s declarative children keep defining the pinned tab's static content and
  keep their existing `open`/`onOpenChange` props for the whole-region open/closed state (item 1 of
  section 3). No new required prop on `AppWorkspace.Secondary`, which remains fully optional — a workspace with no
  `AppWorkspace.Secondary` child and no `open`/`openTab` call simply has no Secondary at all
  (confirmed against `AppWorkspace.tsx`'s `resolveComposedWorkspace`/`AppWorkspaceRoot`, which
  already treats `defaultSecondary` as optional and `secondaryPresentation` as possibly `undefined`
  — see §9 item 2 for the exact code this generalizes).
- The tab strip itself is rendered by `AppWorkspace` inside the existing Secondary header region
  using `ItemTabs`, following the already-specified
  [Content tabs host pattern](item-tabs.md#content-tabs-host-pattern-not-implemented-in-nevo-ui):
  `AppWorkspace` is the blind host; each tab supplies `label`/`title` from its stack definition (or
  the pinned content's declared title) and no close affordance when `closable: false`. The strip
  renders whenever two or more tabs are open, and on a split layout already while the pinned tab is
  the only one: the pinned tab is a tab from the start, so opening or closing another tab never
  swaps the 56px header for the 36px rail (the content would jump). Stacked layouts and a lone
  `open()`/`openTab()` tab without a pinned one render no strip: their header carries the screen's
  own Back/Close and identity.

### 4.2 Sizing and side

```ts
type AppWorkspaceSplitMode = 'primary' | 'balanced' | 'secondary' | 'dynamic'; // existing + 'dynamic'

interface CommonAppWorkspaceProps /* existing, extended */ {
  split?: AppWorkspaceSplitMode;
  /** Only meaningful with split="dynamic". Controlled; omit for internal auto/manual state. */
  secondaryRatio?: number; // 0-1, Secondary's share
  onSecondaryRatioChange?: (ratio: number, mode: 'auto' | 'manual') => void;
  secondarySide?: 'start' | 'end'; // default 'end'
  onSecondarySideChange?: (side: 'start' | 'end') => void;
}
```

- `split="dynamic"` opts a workspace into the auto/manual engine instead of a fixed percentage
  preset. The existing `primary | balanced | secondary` presets are unchanged and remain the right
  choice for a workspace whose Secondary content does not need user resizing or multiple root tabs
  — `dynamic` is additive, not a replacement for the other three.
- Both `secondaryRatio`/`onSecondaryRatioChange` and `secondarySide`/`onSecondarySideChange` follow
  the repository's existing controlled-prop convention (same shape as `AppWorkspace.Secondary`'s
  `open`/`onOpenChange`): omit the value prop to let `AppWorkspace` own the state internally; pass
  both to let the product own/persist it (for example across a reload) without re-deriving the
  resolver's logic. `AppWorkspace` remains the only place that decides the width in px; a product
  that receives `onSecondaryRatioChange` must treat the value as opaque state to store and return,
  never recompute it.
- A pure resolver in `workspaceSizing.ts`, parallel to `resolveWorkspaceSplit`, computes the
  rendered split:

  ```ts
  interface DynamicSplitInput {
    availableWidth: number | undefined;
    // tabs.tabs.length from 4.1: pinned tab (if present) + legacy open() slot (if present) +
    // openTab() entries. A workspace with no pinned tab and nothing opened has openTabCount 0,
    // in which case the resolver is moot — AppWorkspace does not render Secondary at all (§4.1,
    // §9 item 2 — the pinned tab is not guaranteed to exist).
    openTabCount: number;
    mode: 'auto' | 'manual';
    manualRatio: number | null; // Secondary's share, 0-1, when mode is 'manual'
    previousOpenTabCount: number; // to detect "a tab was just opened" vs "switched/closed"
  }

  function resolveDynamicWorkspaceSplit(input: DynamicSplitInput): {
    layout: 'split' | 'stacked';
    secondaryRatio: number;
    mode: 'auto' | 'manual';
  };
  ```

  Behavior is fully specified by the transition table in section 5; this signature only fixes the
  inputs/outputs so the function stays free of any product/Session concept. `openTabCount` is the
  only tab-shaped input — never the active tab's identity or its stack depth, which is how section
  6's non-goal is enforced structurally rather than by convention.

- Minimum viable pane widths are new named constants beside the existing
  `WORKSPACE_SPLIT_MIN_WIDTH`/`WORKSPACE_WIDE_DOMINANCE_MIN_WIDTH`, for example
  `WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH` and `WORKSPACE_DYNAMIC_PRIMARY_MIN_WIDTH`. Their exact
  pixel values are an implementation/visual-review detail, not a product decision: 330px/50-50
  describe default behavior, not absolute CSS constraints, and minimum widths must allow real
  Primary usage (in Full Session, Conversation and Composer), not be picked to reproduce a
  screenshot. The default narrow Secondary width (≈330px) is one such tunable default.
- When `availableWidth` cannot fit both minimums at all, `resolveDynamicWorkspaceSplit` returns
  `layout: 'stacked'`; `AppWorkspace` renders through the **existing** stacked/narrow path
  (`supportsRuntimeWorkspaceSplit` / `state.mode === 'stacked'`) verbatim. This document does not
  add a second stacked implementation; it only adds one more reason `AppWorkspace` may choose that
  existing path. With `dynamic` the decision is the resolver's alone and is width-only: a
  Secondary that can stack (a runtime tab) splits from `WORKSPACE_DYNAMIC_PRIMARY_MIN_WIDTH` +
  `WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH` (400 + 330 = 730px), whereas the fixed presets and the
  default (non-stackable) declarative Secondary keep `WORKSPACE_SPLIT_MIN_WIDTH` (840px). A ratio
  never makes the panes "not fit": it is clamped first.

#### Resolved layout vs shell capability

Two different questions have two different answers between 730px and 839px:

| Question                                                           | API                                                      | Threshold                                          |
| ------------------------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------- |
| "Can the shell show a non-stacking Secondary at all?" (shell hint) | `useWorkspaceCapabilities().supportsSplit`               | 840px (`WORKSPACE_SPLIT_MIN_WIDTH`)                |
| "How is this workspace actually laid out right now?" (resolved)    | `useWorkspaceLayout()` -> `{ mode, primaryScrollOwner }` | the resolver's, from 730px for a runtime Secondary |

- The hint is for the shell-level decisions that exist _before_ and _outside_ the workspace: whether
  to register the pinned Context tab (`useRegisterPinnedSecondaryTab`) and whether the header offers
  the side-panel toggle or a "Context" button. Between 730 and 839 it is `false` and Context is
  opened as a runtime flow (option A). Owner decision, 2026-11-04: this stays. Below 840 px the
  Session uses the mobile navigation scheme (a "Context" button opening a runtime flow); root tabs
  and the pinned Context tab start at 840 px. Narrowing below 840 px hides the side panel even when
  runtime tabs wait in the background; nothing opens over the conversation without the user.
- `useWorkspaceLayout()` is published by `AppWorkspace` itself and read by content **inside** it
  (Primary/Secondary children): `mode` is `'split'` or `'stacked'`, `primaryScrollOwner` is
  `'ambient'` when `AppWorkspace` supplies the stacked page scroll viewport
  (`useWorkspacePrimaryScroll()` is non-null) and `'local'` when Primary content must own a scroll
  container (every split layout, or `scroll="content"`). Anything that depends on the layout the
  user sees — scroll ownership, `position: sticky` versus `fixed` overlays (a composer, a "jump to
  latest" pill), density, Enter behaviour — MUST read this hook, never `supportsSplit`: with the
  hint, a workspace split at 780px but "stacked" by the hint left Primary with no scroll owner and a
  `fixed` composer painting over the Secondary. A `fixed inset-x-0` overlay is only valid while
  `primaryScrollOwner === 'ambient'`. Outside an `AppWorkspace` the hook falls back to the shell
  hint.
- **Ratio contract** (`useDynamicWorkspaceSplit.ts`). The rendered ratio is always the resolver's
  clamped result, so Primary never drops below its minimum width and the splitter's
  `aria-valuenow` always lies within `aria-valuemin`/`aria-valuemax`:
  - _Uncontrolled_ (`secondaryRatio` omitted): the resolver's auto/manual value is rendered and
    every change of `(ratio, mode)` is reported through `onSecondaryRatioChange`.
  - _Controlled_ (`secondaryRatio` given): the value is a manual preference and goes through the
    same resolver (`mode: 'manual'`), so an out-of-range value (for example `0.95`, `0.05`, `1.5`)
    renders clamped, and the layout is stacked only when the width cannot hold both minimum panes.
    It is **never overwritten by auto values**: a restored value survives mount, a width change or
    a tab opening without any callback. The product is told only about (a) a user adjustment of the
    splitter, as `(ratio, 'manual')`, and (b) a later controlled value that the current width cannot
    honour, once, as its clamped value. The first value seen after the width is measured is a
    restored preference and is not corrected (it is rendered clamped; the stored preference is kept
    so it can come back when the window widens).
  - Nothing is reported before the width is measured.
- `secondarySide` only changes layout order (which side of the flex row Secondary renders on,
  which side its border sits on). It MUST NOT remount Primary, any tab, or any tab's content, and
  MUST NOT change `secondaryRatio`, `tabs`, `activeTabId`, or any tab's local stack/scroll/focus.

### 4.3 `WorkspaceSplitter`

A new primitive, rendered by `AppWorkspace` between Primary and Secondary only when
`split="dynamic"` and the resolved layout is `'split'`. Not a public standalone export that
products compose by hand into arbitrary layouts — `AppWorkspace` owns when and where it renders,
consistent with `AppWorkspace` already owning Back/Close placement. Contract in section 7.

## 5. Transition rules

The resolver's exact behavior. Each row is a MUST unless marked otherwise.

| Trigger                                                                                                                                                                                                                                | Required `AppWorkspace`/resolver behavior                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enter split-capable workspace, only one tab open (the pinned one, or — with no pinned tab, §4.1 — the sole `open()`/`openTab()` tab)                                                                                                   | `layout: 'split'`, `mode: 'auto'`, narrow default Secondary width (≈330px, tunable)                                                                                                                        |
| `open()` replaces its slot's content while that slot was already the only non-pinned tab (tab count unchanged), or `openTab()` creates a brand-new tab (tab count +1, not re-activating an existing instance), while `mode === 'auto'` | Replace-in-place (tab count unchanged): no resize. Brand-new tab (tab count +1): switch to 50/50 once — `secondaryRatio` becomes 0.5 for this render and stays `'auto'`                                    |
| `activateTab()` among already-open tabs, or `openTab()` re-activating an already-open instance unchanged                                                                                                                               | No resize: `secondaryRatio`/`mode` unchanged; only `activeTabId` changes                                                                                                                                   |
| Push/pop inside a tab's local stack (dependent Task/event/ToolAction detail)                                                                                                                                                           | No resize: the resolver never receives this as input (section 6)                                                                                                                                           |
| `closeTab()` reduces open tabs to just the pinned one (if one exists), while `mode === 'auto'`                                                                                                                                         | `mode` stays `'auto'`, ratio returns to the narrow default                                                                                                                                                 |
| `closeTab()` closes the last remaining tab in a workspace with no pinned tab                                                                                                                                                           | Secondary has none; `layout`/`secondaryRatio`/`mode` become moot until a tab opens again (§4.1, §9 item 2)                                                                                                 |
| User drags `WorkspaceSplitter`                                                                                                                                                                                                         | `mode` becomes `'manual'`; `manualRatio` is set to the dragged value and now wins                                                                                                                          |
| In `mode === 'manual'`, any `open()`/`openTab()`/`activateTab()`/`closeTab()`                                                                                                                                                          | `manualRatio` is preserved; no automatic 50/50                                                                                                                                                             |
| `secondarySide` changes                                                                                                                                                                                                                | `secondaryRatio`, `mode`, `tabs`, `activeTabId`, and every tab's local stack/scroll/focus are all preserved; only layout order changes                                                                     |
| Secondary explicitly closed (whole region)                                                                                                                                                                                             | Region hidden; `tabs`, `activeTabId`, `mode`, and `manualRatio`/auto ratio are retained, not discarded (section 9, item 3)                                                                                 |
| Secondary explicitly reopened                                                                                                                                                                                                          | Restores the exact `mode`/ratio/tabs/`activeTabId` it had when closed, clamped to section 4.2's current valid range                                                                                        |
| `availableWidth` can no longer fit the current ratio's panes even after clamping                                                                                                                                                       | Fall back to the existing stacked/narrow model via the existing path; `manualRatio`/`mode` are preserved unrendered, not discarded                                                                         |
| `availableWidth` becomes split-capable again                                                                                                                                                                                           | Restore the preserved `mode`/ratio, clamped to the current valid range, not reset to the auto default                                                                                                      |
| Live Session/product update (new Turn, new Work, new message)                                                                                                                                                                          | MUST NOT appear in `DynamicSplitInput` at all; it cannot resize, switch tabs, or reopen a closed Secondary because the resolver and the tab-set have no input through which such an event could reach them |

Two rows are intentionally **not** a single frozen MUST (default narrow sizing may be restored
unless the user's manual setting intentionally remains in force): whether `closeTab()` down to only the pinned tab resets a **manual** ratio to the narrow
default, or preserves it, is left as a product-facing choice via `onSecondaryRatioChange`/
`secondaryRatio` (section 4.2) rather than hardcoded in the resolver. The resolver's own default
(uncontrolled usage) preserves the manual ratio, matching the "do not rewrite the user's manual
preference" rule.

## 6. Non-goals

These are explicit exclusions, not omissions to revisit casually:

- The active tab's content, which page is active inside any tab's local stack, or dependent-detail
  depth MUST NOT be read by `resolveDynamicWorkspaceSplit` or by anything that decides
  `secondaryRatio`/`mode`. Section 4.2's `DynamicSplitInput` is the enforcement mechanism: it has no
  field through which this information could flow.
- Live/streaming product updates (a new message, Work item, Turn, or interaction) MUST NOT resize
  the workspace, MUST NOT change `activeTabId`, and MUST NOT reopen a Secondary the user explicitly
  closed. Only `open`, `openTab`, `activateTab`, `closeTab`, splitter drag, and `secondarySide`
  changes are legitimate triggers for any of owned-state items 1, 3, 4, 5, 6 in section 3.
- `secondarySide` and manual-ratio drag MUST NOT change the Session/product route, provider,
  current Turn, Composer draft, any tab's identity, or any tab's local stack — these are pure
  layout operations (a product-level non-goal this document inherits as a structural constraint
  on the API rather than re-deciding it).
- 330px and 50/50 are default values a product/visual reviewer may retune without a new product
  decision, not absolute CSS constants (section 4.2).
- No third workspace pane. Root tabs multiply _within_ the single existing Secondary region; they
  do not add a sibling region to `AppWorkspace`.
- This document does not decide exact breakpoint values, persistence of manual width/side across a
  reload, or the exact product-level API that supplies tab titles/content.

## 7. Accessibility

### Tab strip

Reuses [`ItemTabs`'s existing contract](item-tabs.md) without modification to its a11y behavior:
`tablist`/`tab` roving tabindex, `manual` activation (arrows move focus, Enter/Space activates),
narrow-width switcher collapse, and per-tab status announcements. The pinned tab is an ordinary
`ItemTabs` item with `closable: false` (section 9, item 1): it has no close `x` and is never offered in
any "close" affordance, but is otherwise identical in keyboard/AT behavior to any other tab.

### `WorkspaceSplitter`

A real interactive control, not a styled `Separator`:

- `role="separator"`, `aria-orientation="vertical"`, a non-empty accessible name (for example "Resize
  secondary panel", replaceable through `AppWorkspaceLabels` like the existing Back/Close labels).
- Focusable (`tabIndex=0`), with a visible focus ring following the same DS focus-visible treatment
  used elsewhere (`WorkspaceHeader`'s actions, `ItemTabs`' tabs).
- `aria-valuenow`/`aria-valuemin`/`aria-valuemax` reflect the current split (percentage or px);
  updated live as the value changes.
- **Keyboard**: Left/Right arrow adjust the ratio by a fixed step (for example 24px-equivalent);
  Home/End jump to the minimum/maximum valid ratio for the current `availableWidth`. Any keyboard
  adjustment enters `mode: 'manual'`, exactly like a pointer drag.
- **Pointer**: `pointerdown`/`pointermove`/`pointerup` drag (not HTML5 drag-and-drop), so it works
  identically with mouse, pen, and touch.
- **Touch**: the splitter's hit area MUST set `touch-action: none` and MUST be large enough
  (consistent with `ItemTabs`' existing 44px coarse-pointer precedent) to drag reliably without the
  browser interpreting the gesture as page scroll — the "no accidental vertical-scroll hijacking
  on mobile" requirement is specifically about this control, since Secondary's own content
  already scrolls independently via `ScrollArea`/`AppWorkspaceBody`.
- The splitter MUST NOT trap focus: Tab/Shift+Tab move focus away from it into the adjacent region
  exactly as from any other interactive control in the workspace header/body.

## 8. Consumers in SpecFlow UI

`open` keeps its single replace-on-every-call slot and `openTab` is additive, so a consumer that
only calls `open` is behavior-compatible by construction. Current consumers
(re-scan `packages/specflow-ui` for `navigation.open`/`openTab` before changing either method):

- `features/sessions/managed/ManagedSession.tsx`: on the split layout a Work block calls
  `openTab(workStack, { sessionId, turnId })` with `instanceId = turnId`, so Work history is one tab
  per Turn and Context's Work history row for the same Turn lands on the same tab; the stacked
  layout keeps `open` (one visible surface, Back closes it).
- `features/sessions/managed/context/SessionTasksInspector.tsx`: `managed-session-tasks` is the
  list tab and `managed-session-task` is one tab per Task (`instanceId` = the task id, label = the
  Task key), both opened with `openTab`; on the stacked Context flow they are pushes onto that flow.
- `features/tasks/workspace/TaskWorkspace.tsx`: `open(taskWorkspaceMaterialStack, …)` and
  `open(taskWorkspaceHistoryStack, …)` share the one legacy slot, so opening a second Material (or
  History) replaces the first.

## 9. Implementation map

1. **`useOpenedItems` has an optional `closable` per item** (default `true`): `close`,
   `requestClose` and `closeAll` skip non-closable items.
2. **`WorkspaceContext` owns a tab-keyed collection** (it follows `useOpenedItems`' open/activate/
   close rules but also carries each tab's flow, leave guards and scroll memory): the pinned entry
   (only when `AppWorkspace.Secondary`'s declarative children are present and `open !== false`; not
   guaranteed to exist), the legacy `open()` slot (one reserved key every `open` call targets,
   regardless of `definition.id`) and `openTab()` entries keyed by the `tabInstanceId` from §4.1.
3. **Closing the Secondary region does not discard tabs**: tabs and flows survive while hidden, so
   reopening restores them (section 5, "Secondary explicitly reopened"), for the pinned entry, the
   legacy slot and every `openTab()` entry.
4. **`resolveDynamicWorkspaceSplit`** in `workspaceSizing.ts`, with table-driven tests for section 5
   and the `WORKSPACE_DYNAMIC_*` minimum-width constants.
5. **`AppWorkspace` `split="dynamic"`**: consumes the resolver, exposes
   `secondaryRatio`/`onSecondaryRatioChange`, falls back to the stacked path on infeasible width.
6. **`WorkspaceSplitter`** implementing section 7, rendered only under `split="dynamic"` in
   `'split'` layout.
7. **`secondarySide`/`onSecondarySideChange`** (flex order and border side), without remounting any
   region.
8. **Tab strip** inside the Secondary header via `ItemTabs`, following
   [item-tabs.md](item-tabs.md#content-tabs-host-pattern-not-implemented-in-nevo-ui)'s pattern,
   shown per §4.1 (two or more tabs, or the pinned tab alone on a split layout).
