---
id: design-system.implementation.react.workspace-dynamic-split
type: engineering
title: Workspace dynamic split and Secondary root tabs
status: draft
scope: nevo-ui
read_when:
  - adding more than one independently revisitable root area to a Secondary inspector
  - adding a draggable splitter or a left/right swap to AppWorkspace
  - implementing a screen that needs the Workspace V2 auto/manual split behavior
summary: >
  Decision-complete contract for Secondary root tabs and the auto/manual dynamic split: owned
  state, the public API surface built on top of the existing AppWorkspace/Secondary composition,
  the auto/manual transition table, explicit non-goals, and the accessible splitter contract.
  Implemented (W01-W07); see section 1 for the closing evidence and one open reconciliation point.
related:
  - design-system.implementation.react.secondary-navigation
  - design-system.implementation.react.item-tabs
  - design-system.implementation.react.component-authoring-contract
  - design-system.principles.system-boundary
  - design-system.principles.ui-ux-guidelines
  - architecture.principles.normative-language
  - ideas.specflow-ui.design-system-component-composition-gaps
  - ideas.specflow-ui.components.session-chat-v10-design
  - ideas.specflow-ui.full-session-screen-structure
---

# Workspace dynamic split and Secondary root tabs

## 1. Status and scope

This document specifies, at decision-complete detail, the Nevo UI capability that Full Session
(Workspace V2 / Session Chat V10) needs and that
[the composition-gaps analysis §5.4/§6.2](../../../ideas/specflow-ui/design-system-component-composition-gaps.md#54-p1--workspace-v2-dynamic-automanual-split-and-tab-root-ownership-new)
and the
[V10 dynamic-split section](../../../ideas/specflow-ui/components/session-chat-v10-design.md#7-dynamic-workspace-split-shared-design-system-capability-gap)
identified as missing. Full Session is the first consumer, but nothing here names Session,
Task, Spec, or any other product/workflow concept: this capability is pure layout/geometry and
belongs in Nevo UI per
[the system-boundary rule](../../principles/system-boundary.md).

**Status: implemented** (2026-10-31). W01-W06 landed every gap in section 9, and
[W07](../../../ideas/nevo-ui/execution-plans/01-workspace-dynamic-split/tasks/W07-verification-and-compatibility-audit.md)
proved the full section 5 transition table end-to-end as one connected Storybook scenario
(`AppWorkspaceDynamicSplit.contract.stories.tsx`'s `FullConnectedScenarioContract` and
`NoPinnedTabDynamicSplitContract`), re-confirmed every `packages/specflow-ui` single-flow consumer
is behavior-compatible, and found `packages/specflow-ui/src/features/sessions/managed/
ManagedSession.tsx` already adopting `split="dynamic"` and `openTab` in production. W07's report
had flagged one finding for independent review: `WorkspaceContext.tsx`'s `closeTab()` neighbour
selection activated the pinned tab whenever one existed, rather than the right-then-left runtime
neighbour section 4.1 describes, when another runtime tab remained open — undiscovered by W02's own
tests. That finding has since been fixed (`applyCloseTab` now applies the right-neighbour ->
left-neighbour rule first, falling back to the pinned tab only when no runtime tab remains at all)
and covered by a dedicated `WorkspaceContext.test.tsx` case plus the
`FullConnectedScenarioContract` story asserting it directly; current behavior matches this document
in full.

**Revised 2026-10-30 after external review** (independent of this repository's own review
process, which had already passed this document once): the review read this contract, the W01-W07
task breakdown, and the actual current `AppWorkspace`/`WorkspaceContext` source, and found four
problems in the contract itself — root-tab identity conflated "which stack" with "which specific
opened instance" (§4.1, §8), the pinned tab was specified as unconditionally present even though
`AppWorkspace` correctly supports a Secondary with no declarative content at all (§3, §9), the
single-flow-consumer compatibility audit was scheduled only at the end of the plan instead of at
the task that actually changes the risky behavior, and the execution plan's file-independence claim
for its "parallel-safe" task pairs was wrong. All four are addressed below; each change is marked
where it revises a prior decision rather than silently overwriting it. No implementation exists yet
for any of W01-W07, so there is no code to reconcile — this is a pre-implementation spec fix.

This document does not decide product behavior. It generalizes existing design-system mechanics
(`AppWorkspace`, `AppWorkspaceProvider`/`WorkspaceContext`, `secondaryNavigationModel`,
`workspaceSizing`, `useOpenedItems`/`ItemTabs`) to carry the already-accepted Workspace V2
contract. Where the product documents leave a value non-binding ("about 330px", "50/50" —
see V10 §7.2), this document keeps it non-binding and says so explicitly.

## 2. Precedent and reuse — what this extends, not duplicates

The repository rule for this capability is: do not invent a parallel tab/navigation engine.
Two existing product-neutral primitives already solve most of this problem for a different
consumer, and both generalize cleanly:

- **`useOpenedItems` / `ItemTabs`** (`components/navigation/ItemTabs/`) is already the
  product-neutral "open a set of independently revisitable items, one active, open-activates-
  existing-instead-of-duplicating" contract, with roving-tabindex keyboard behavior, a narrow-width
  switcher, and close/guard semantics already specified in
  [Item tabs and content tabs host](item-tabs.md). Secondary root tabs are an instance of exactly
  this problem: an independently revisitable root ("Tasks", "Files", an opened file, Context) is a
  tab; a dependent detail (a Task's attempt, a ToolAction) is not a new tab, it is a push onto that
  tab's local stack. Section 4.1 below is `useOpenedItems` applied to Secondary's root flows, not a
  new state model.
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
  [composition over configuration explosion](system-boundary.md).

## 3. Owned state

All of the following is owned by Nevo UI (`AppWorkspaceProvider` plus `AppWorkspace`'s layout
resolution), scoped exactly like today's Secondary flow: per `scopeKey`, reset when `scopeKey`
changes, independent of route/URL.

1. **Secondary open/closed** — already exists (`AppWorkspace.Secondary`'s `open`/`onOpenChange`,
   [§5.2](../../../ideas/specflow-ui/design-system-component-composition-gaps.md#52-p0--default-context-secondary-cannot-currently-be-dismissed-persistently)).
   Generalizes unchanged to "the whole tab region is shown or hidden"; tabs/flows/sizing survive
   while hidden (section 9.2 — this is a required behavior change from today's `close` semantics).
2. **Root tabs** — an ordered set, one entry per independently revisitable root. **Revised
   2026-10-30 after external review:** the set is composed from up to three independent sources,
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
   can be restored verbatim once conditions allow it again (V10 §7.2: "do not rewrite the user's
   manual preference").
6. **Side** — `'start' | 'end'` (Secondary before or after Primary). Default `'end'` (today's only
   behavior). Swapping changes only this value.

Explicitly **not** owned state, because it must not influence the above (section 6): which page is
active inside a tab's local stack, dependent-detail depth, scroll position inside a tab, or any
Session/product runtime fact (new message, new Work, new Turn).

## 4. Public API

### 4.1 Root tabs

**Revised 2026-10-30 after external review (Finding 1, P1/blocking):** the original draft of this
section identified a root tab only by `definition.id` and specified that re-`open()`-ing an already
open id activates it **unchanged**, ignoring the new `params`. That is wrong for the consumer
pattern this document itself records in §8: a product that calls `open(workStack, { turnId })` with
a fixed `workStack.id` once per inspected Turn needs the _second_ call (Turn B) to actually show
Turn B's data, not silently reactivate Turn A's stale tab. The root cause was conflating two
different things a product might want from one `open`-shaped call:

1. **One tab for this definition, always showing the latest params** (today's actual behavior:
   `ManagedSession.tsx`'s per-Turn Work flow, `SessionContextPanel.tsx`'s/`SessionTasksInspector
.tsx`'s fixed-id "different initial page of the same screen" trick, `taskWorkspaceMaterialStack`
   in `TaskWorkspace.tsx` — confirmed by reading these files, see §8).
2. **One tab per distinct entity, all independently open and revisitable at once** (a genuinely new
   capability — e.g. Work-for-Turn-A and Work-for-Turn-B open as two separate tabs simultaneously).

A single `open(definition, params)` cannot be both "replace this slot's params" and "leave this
instance's params untouched" depending on the caller's intent, so this revision splits it into two
methods that share the same tab-set state and the same `definitionId`/`tabInstanceId` distinction,
and gives the implementer (and any future consumer, including the Full Session screen) an explicit,
named choice between the two operations instead of one overloaded one:

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
  This is additive: no existing caller uses it, so it changes nothing for `packages/specflow-ui`
  until a consumer deliberately adopts it.
- `activateTab(id)` switches the active tab without touching any flow. Unknown ids are ignored,
  mirroring `useOpenedItems.activate`. Operates uniformly over pinned/legacy-slot/`openTab` entries.
- `closeTab(id)` closes one tab (consulting its own leave guard via the same mechanism
  `useSecondaryLeaveGuard` already registers per entry). Closing the pinned tab is refused
  (`closable: false`), matching how `useOpenedItems` would need a "closable" extension it does not
  have today (see 9.1). Closing the legacy `open()` slot or an `openTab` entry behaves identically
  (both are `closable: true`): the active tab's right neighbor activates, else its left one
  (reuses `useOpenedItems`'s existing neighbor rule verbatim); closing the last remaining tab closes
  the whole Secondary region if there is no pinned tab (§3, §4.2), else leaves only the pinned tab
  active, exactly like today's `back`-at-root behavior.
- `useSecondaryStack<TPages>()` is unchanged: it is already scoped to "the flow that mounted this
  screen," which continues to mean "this tab's flow," not the whole workspace.
- `AppWorkspace.Secondary`'s declarative children keep defining the pinned tab's static content and
  keep their existing `open`/`onOpenChange` props for the whole-region open/closed state (item 1 of
  section 3). No new required prop on `AppWorkspace.Secondary`. **Revised 2026-10-30 (Finding 2):**
  `AppWorkspace.Secondary` remains fully optional, exactly as today — a workspace with no
  `AppWorkspace.Secondary` child and no `open`/`openTab` call simply has no Secondary at all
  (confirmed against `AppWorkspace.tsx`'s `resolveComposedWorkspace`/`AppWorkspaceRoot`, which
  already treats `defaultSecondary` as optional and `secondaryPresentation` as possibly `undefined`
  — see §9 item 2 for the exact code this generalizes).
- The tab strip itself is rendered by `AppWorkspace` inside the existing Secondary header region
  using `ItemTabs`, following the already-specified
  [Content tabs host pattern](item-tabs.md#content-tabs-host-pattern-not-implemented-in-nevo-ui):
  `AppWorkspace` is the blind host; each tab supplies `label`/`title` from its stack definition (or
  the pinned content's declared title) and no close affordance when `closable: false`. The tab
  strip MUST NOT render at all when exactly one tab is open, whether that one tab is the pinned one
  (today's "only pinned Context open" case, pixel-identical to today's single default Secondary) or
  the sole `open()`/`openTab()`-opened tab in a workspace with no pinned tab at all (§4.2).

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
    // §9 item 2; revised 2026-10-30, Finding 2 — the pinned tab is not guaranteed to exist).
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
  pixel values are an implementation/visual-review detail, not a product decision — V10 §7.2 is
  explicit that 330px/50-50 "describe default behavior, not absolute CSS constraints" and that
  "[m]inimum widths must allow real Conversation and Composer usage, not be picked just to
  reproduce the screenshot." The default narrow Secondary width (≈330px, V10 §7.2) is one such
  tunable default, not a frozen constant.
- When `availableWidth` cannot fit both minimums at all, `resolveDynamicWorkspaceSplit` returns
  `layout: 'stacked'`; `AppWorkspace` renders through the **existing** stacked/narrow path
  (`supportsRuntimeWorkspaceSplit` / `state.mode === 'stacked'`) verbatim. This document does not
  add a second stacked implementation; it only adds one more reason `AppWorkspace` may choose that
  existing path (today: `availableWidth < WORKSPACE_SPLIT_MIN_WIDTH`; with `dynamic`: additionally,
  the current ratio's panes do not fit even after clamping).
- `secondarySide` only changes layout order (which side of the flex row Secondary renders on,
  which side its border sits on). It MUST NOT remount Primary, any tab, or any tab's content, and
  MUST NOT change `secondaryRatio`, `tabs`, `activeTabId`, or any tab's local stack/scroll/focus.

### 4.3 `WorkspaceSplitter`

A new primitive, rendered by `AppWorkspace` between Primary and Secondary only when
`split="dynamic"` and the resolved layout is `'split'`. Not a public standalone export that
products compose by hand into arbitrary layouts — `AppWorkspace` owns when and where it renders,
consistent with `AppWorkspace` already owning Back/Close placement. Contract in section 7.

## 5. Transition rules

This restates
[V10 §7.2](../../../ideas/specflow-ui/components/session-chat-v10-design.md#72-automanual-transition-rules)
as the resolver's exact behavior. Each row is a MUST unless marked otherwise.

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
| Secondary explicitly closed (whole region)                                                                                                                                                                                             | Region hidden; `tabs`, `activeTabId`, `mode`, and `manualRatio`/auto ratio are retained, not discarded (section 9.2)                                                                                       |
| Secondary explicitly reopened                                                                                                                                                                                                          | Restores the exact `mode`/ratio/tabs/`activeTabId` it had when closed, clamped to section 4.2's current valid range                                                                                        |
| `availableWidth` can no longer fit the current ratio's panes even after clamping                                                                                                                                                       | Fall back to the existing stacked/narrow model via the existing path; `manualRatio`/`mode` are preserved unrendered, not discarded                                                                         |
| `availableWidth` becomes split-capable again                                                                                                                                                                                           | Restore the preserved `mode`/ratio, clamped to the current valid range, not reset to the auto default                                                                                                      |
| Live Session/product update (new Turn, new Work, new message)                                                                                                                                                                          | MUST NOT appear in `DynamicSplitInput` at all; it cannot resize, switch tabs, or reopen a closed Secondary because the resolver and the tab-set have no input through which such an event could reach them |

Two rows are intentionally **not** a single frozen MUST, per
[V10 §10.2](../../../ideas/specflow-ui/full-session-screen-structure.md#102-desktop-geometry)
("default narrow sizing may be restored unless the user's manual setting intentionally remains in
force"): whether `closeTab()` down to only the pinned tab resets a **manual** ratio to the narrow
default, or preserves it, is left as a product-facing choice via `onSecondaryRatioChange`/
`secondaryRatio` (section 4.2) rather than hardcoded in the resolver. The resolver's own default
(uncontrolled usage) preserves the manual ratio, matching the "do not rewrite the user's manual
preference" language that recurs through V10 §7.2.

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
  layout operations (restated from V10 §7.3, which is already a product-level non-goal; this
  document inherits it as a structural constraint on the new API rather than re-deciding it).
- 330px and 50/50 are default values a product/visual reviewer may retune without a new product
  decision, not absolute CSS constants (V10 §7.2, carried into section 4.2).
- No third workspace pane. Root tabs multiply _within_ the single existing Secondary region; they
  do not add a sibling region to `AppWorkspace`.
- This document does not decide exact breakpoint values, persistence of manual width/side across a
  reload, or the exact Session-level API that supplies tab titles/content (V10 §7.2 leaves these
  open; they stay open here too).

## 7. Accessibility

### Tab strip

Reuses [`ItemTabs`'s existing contract](item-tabs.md) without modification to its a11y behavior:
`tablist`/`tab` roving tabindex, `manual` activation (arrows move focus, Enter/Space activates),
narrow-width switcher collapse, and per-tab status announcements. The pinned tab is an ordinary
`ItemTabs` item with `closable: false` (section 9.1): it has no close `x` and is never offered in
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
  browser interpreting the gesture as page scroll — V10 §7.2's "no accidental vertical-scroll
  hijacking on mobile" requirement is specifically about this control, since Secondary's own content
  already scrolls independently via `ScrollArea`/`AppWorkspaceBody`.
- The splitter MUST NOT trap focus: Tab/Shift+Tab move focus away from it into the adjacent region
  exactly as from any other interactive control in the workspace header/body.

## 8. Compatibility notes for existing single-flow consumers

**Revised 2026-10-30 after external review (Finding 1 and Finding 3):** the original draft of this
section assumed `open`'s semantics themselves would generalize to "open-or-activate a tab keyed by
`definition.id`", which — per §4.1's revision — was the P1 bug: it would have broken every listed
consumer, not preserved them. With §4.1's split (`open` keeps its exact current behavior; `openTab`
is the new, additive, multi-tab-capable method), every consumer below is **behavior-compatible by
construction**, not by luck: none of them call a method whose behavior changed. This section now
records that confirmed-compatible status per consumer and, where relevant, whether the consumer
_could_ opt into `openTab` later for a genuinely new capability — a product decision for the
feature owner, not something this document decides. This list is evidence captured at the time this
document was written, not a closed set — W02's audit (moved earlier per Finding 3 below) and W07's
final audit MUST each re-scan `packages/specflow-ui` for the pattern rather than trust it as
exhaustive, since consumers may be added before either executes (two already were since this
document's first version: `SessionTasksInspector.tsx`, and `TaskWorkspace.tsx`'s
`taskWorkspaceMaterialStack`/`taskWorkspaceHistoryStack`, confirmed by reading the file during this
revision):

- `packages/specflow-ui/src/features/sessions/managed/ManagedSession.tsx` calls
  `navigation.open(workStack, { sessionId, turnId })` once per inspected Turn's Work, with a fixed
  `workStack.id`. **Compatible, unchanged behavior**: `open`'s legacy slot is global and
  replace-on-every-call regardless of id or params, so Turn B's `open()` still replaces Turn A's,
  exactly as today. _Product option, not required:_ if the feature owner later wants Work-for-Turn-A
  and Work-for-Turn-B open as two independent, simultaneous tabs, that is a deliberate migration to
  `openTab(workStack, { sessionId, turnId })` with `workStack.instanceId = (params) => params
.turnId` added to the definition — a product decision outside this document's scope.
- `packages/specflow-ui/src/features/sessions/context/SessionContextPanel.tsx` defines three
  separate stack _ids_ (`demo-session-documents`, `demo-session-project`,
  `demo-session-instructions`) purely so that opening each one discards the others and lands on a
  different initial page of the same screen set. **Compatible, unchanged behavior**: because `open`
  never keys its slot by `definition.id`, calling `open` with any of these three definitions still
  replaces the same single legacy slot the other two also target — the "opening one discards the
  others" behavior this consumer relies on is preserved exactly, with no migration needed. (This
  file is the demo-era Context panel; a parallel Full Session redesign pass is expected to supersede
  it with `context/SessionContext.tsx` — see the next entry — so it may become moot independently of
  this compatibility finding.)
- `packages/specflow-ui/src/features/sessions/managed/context/SessionTasksInspector.tsx` (added
  2026-10-30) defines two fixed stack ids (`managed-session-tasks`, `managed-session-task-detail`)
  for the identical reason as `SessionContextPanel.tsx` above. **Compatible, unchanged behavior**,
  same reasoning: all `open` calls share the one global legacy slot regardless of definition id.
- `packages/specflow-ui/src/features/tasks/workspace/TaskWorkspace.tsx` calls
  `navigation.open(taskWorkspaceMaterialStack, { taskId, id })` with a fixed `id` varying per
  Material clicked, and `navigation.open(taskWorkspaceHistoryStack, { taskId })` from a different
  call site in the same flow (found during this revision's code review, not in the document's
  original consumer list). **Compatible, unchanged behavior**, same reasoning: both calls target the
  one shared legacy slot, so opening a second Material (or History) still replaces the first exactly
  as today.

This document does not change `packages/specflow-ui`. It records this as a confirmed-compatible
status, re-verified at W02 and again at W07 (Finding 3 below), so neither task treats this
reasoning as a substitute for actually re-scanning the package.

## 9. Gaps to close in nevo-ui

Concrete deltas required to make the above real, in dependency order. Each maps to one task in the
[implementation task breakdown](../../../ideas/nevo-ui/execution-plans/01-workspace-dynamic-split/README.md).
**Revised 2026-10-30 after external review:** items 2 and 3 below are rewritten for Finding 1
(`open`/`openTab` split) and Finding 2 (optional pinned tab); item 3's audit is additionally called
out as an exit criterion of its own task rather than deferred, per Finding 3 (see
[W02](../../../ideas/nevo-ui/execution-plans/01-workspace-dynamic-split/tasks/W02-secondary-root-tab-state.md)
and
[W07](../../../ideas/nevo-ui/execution-plans/01-workspace-dynamic-split/tasks/W07-verification-and-compatibility-audit.md)).

1. **`useOpenedItems` needs an optional `closable` per item** (default `true`); `close`,
   `requestClose`, and `closeAll` must skip non-closable items. This is a small, backward-compatible
   extension — existing `ItemTabs` consumers that never pass `closable: false` are unaffected.
2. **`WorkspaceContext`'s single nullable `flow` becomes a tab-keyed collection** built on the
   extended `useOpenedItems`, holding: the pinned entry (only when `AppWorkspace.Secondary`'s
   declarative children are present and `open !== false` — **not guaranteed to exist**, confirmed
   against `AppWorkspace.tsx`'s `resolveComposedWorkspace`/`AppWorkspaceRoot`, where
   `defaultSecondary` is already optional and `secondaryPresentation` already resolves to
   `undefined` when there is neither a declarative Secondary nor a runtime one — Finding 2); the
   legacy `open()` slot, implemented as a single reserved tab-collection key that every `open` call
   targets regardless of `definition.id`, preserving today's discard-and-replace behavior exactly
   (Finding 1); and `openTab()`-opened entries, keyed by the `definitionId`/`instanceId`-derived
   `tabInstanceId` from §4.1, each genuinely independent. `open` and `openTab` are two distinct
   public methods sharing this one collection, not two states of one method.
3. **Closing the Secondary region must stop discarding tabs.** Today's `navigate('close', ...)`
   calls `publish(null, ...)`, which drops `flowRef.current` entirely. Tabs/flows must survive while
   hidden so reopening restores them (section 5, "Secondary explicitly reopened") — this applies
   uniformly to the pinned entry (if any), the legacy slot, and every `openTab()` entry.
   **Audit exit criterion (Finding 3):** before this task's own review gate, confirm — by re-scanning
   `packages/specflow-ui` for `navigation.open`/`defineSecondaryStack` fixed-id usage, not just
   trusting §8's recorded list — that every existing caller of `open` is unaffected by this change,
   per §8's compatibility notes; a behavior-changed finding here blocks this task's gate and is
   reported to the feature owner, it is not deferred to W07 to discover first.
4. **`resolveDynamicWorkspaceSplit` in `workspaceSizing.ts`**, table-driven tests covering every row
   of section 5, and the new `WORKSPACE_DYNAMIC_*` minimum-width constants.
5. **`AppWorkspace` wiring for `split="dynamic"`**: consumes the resolver, exposes
   `secondaryRatio`/`onSecondaryRatioChange`, falls back to the existing stacked path on infeasible
   width.
6. **New `WorkspaceSplitter` component** implementing section 7, rendered by `AppWorkspace` only
   under `split="dynamic"` in `'split'` layout.
7. **`secondarySide`/`onSecondarySideChange` layout wiring** in `AppWorkspace` (flex order and
   border side), verified not to remount any region.
8. **Tab strip composition** inside the Secondary header via `ItemTabs`, following
   [item-tabs.md](item-tabs.md#content-tabs-host-pattern-not-implemented-in-nevo-ui)'s pattern,
   hidden entirely when only one tab (pinned or otherwise, §4.1) is open.

All of this landed across W01-W06, verified end-to-end by W07 (section 1); see the linked task
breakdown for the sequencing, ownership, and verification profile each item satisfied before being
marked implemented here and in the composition-gaps analysis.
