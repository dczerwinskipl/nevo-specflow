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
  Specified; implementation is pending (see section 9).
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

**Status is `draft`: specified, implementation pending.** No code in `packages/nevo-ui/src` has
been changed to match this document yet. Section 9 lists the concrete deltas an implementer must
make; nothing here should be read as a description of current behavior. Current behavior remains
exactly what [the Secondary navigation contract](secondary-navigation.md) and `workspaceSizing.ts`
describe until those deltas land.

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
2. **Root tabs** — an ordered set, one entry per independently revisitable root: the pinned entry
   (today's declarative `AppWorkspace.Secondary` content) plus zero or more opened entries (today's
   single runtime flow, now plural). Each entry has:
   - a stable `id` (the pinned entry's id is fixed by the host; an opened entry's id is its
     `SecondaryStackDefinition.id`, exactly as today);
   - `closable: boolean` (`false` only for the pinned entry);
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

`useSecondaryNavigation()` keeps its existing shape and gains tab-set fields, mirroring
`useOpenedItems`'s shape so a reader already familiar with `ItemTabs` recognizes it immediately:

```ts
interface SecondaryTabsState {
  tabs: ReadonlyArray<{ id: string; closable: boolean; title: string }>;
  activeTabId: string | null;
}

interface WorkspaceContextValue /* existing, extended */ {
  // existing: secondary, secondaryDepth, canGoBack, transition, back, close, canLeaveScope
  open: <TRoot extends object, TData, TPages extends object>(
    definition: SecondaryStackDefinition<TRoot, TData, TPages>,
    params: TRoot,
  ) => Promise<boolean>;
  tabs: SecondaryTabsState;
  activateTab: (id: string) => Promise<boolean>;
  /** Consults the target tab's own leave guard, exactly like `back`/`close` do today. */
  closeTab: (id: string) => Promise<boolean>;
}
```

- `open(definition, params)` keeps its exact current signature. Its semantics change from
  "discard the prior flow and start this one" to **"open or activate the tab whose id is
  `definition.id`"**: if that tab is not open, create it at its registered initial page and
  activate it; if it is already open, activate it and leave its existing flow (page, local stack,
  scroll, focus) untouched — this is `useOpenedItems.open`'s existing rule
  ("[o]pening an item whose id is already open activates it instead of adding another"; "[a]n
  existing item keeps its stored value") applied to flows instead of generic items. This is a
  breaking semantic change from today's single-flow `open` (section 8).
- `activateTab(id)` switches the active tab without touching any flow. Unknown ids are ignored,
  mirroring `useOpenedItems.activate`.
- `closeTab(id)` closes one tab (consulting its own leave guard via the same mechanism
  `useSecondaryLeaveGuard` already registers per entry). Closing the pinned tab is refused
  (`closable: false`), matching how `useOpenedItems` would need a "closable" extension it does not
  have today (see 9.1). Closing the active tab activates its right neighbor, else its left one
  (reuses `useOpenedItems`'s existing neighbor rule verbatim); closing the last remaining tab closes
  the whole Secondary region, exactly like today's `back`-at-root behavior.
- `useSecondaryStack<TPages>()` is unchanged: it is already scoped to "the flow that mounted this
  screen," which continues to mean "this tab's flow," not the whole workspace.
- `AppWorkspace.Secondary`'s declarative children keep defining the pinned tab's static content and
  keep their existing `open`/`onOpenChange` props for the whole-region open/closed state (item 1 of
  section 3). No new required prop on `AppWorkspace.Secondary`.
- The tab strip itself is rendered by `AppWorkspace` inside the existing Secondary header region
  using `ItemTabs`, following the already-specified
  [Content tabs host pattern](item-tabs.md#content-tabs-host-pattern-not-implemented-in-nevo-ui):
  `AppWorkspace` is the blind host; each tab supplies `label`/`title` from its stack definition (or
  the pinned content's declared title) and no close affordance when `closable: false`. The tab
  strip MUST NOT render at all when exactly one tab (the pinned one) is open — this is the existing
  "only pinned Context open" case and must look identical to today's single default Secondary, not
  a one-tab strip.

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
    openTabCount: number; // tabs.tabs.length from 4.1; pinned tab counts as one
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

| Trigger                                                                                               | Required `AppWorkspace`/resolver behavior                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enter split-capable workspace, only the pinned tab open                                               | `layout: 'split'`, `mode: 'auto'`, narrow default Secondary width (≈330px, tunable)                                                                                                                        |
| `open()` creates a brand-new 2nd root tab (not re-activating an existing one) while `mode === 'auto'` | Switch to 50/50 once: `secondaryRatio` becomes 0.5 for this render and stays 'auto'                                                                                                                        |
| `activateTab()` among already-open tabs                                                               | No resize: `secondaryRatio`/`mode` unchanged; only `activeTabId` changes                                                                                                                                   |
| Push/pop inside a tab's local stack (dependent Task/event/ToolAction detail)                          | No resize: the resolver never receives this as input (section 6)                                                                                                                                           |
| `closeTab()` reduces open tabs to just the pinned one, while `mode === 'auto'`                        | `mode` stays `'auto'`, ratio returns to the narrow default                                                                                                                                                 |
| User drags `WorkspaceSplitter`                                                                        | `mode` becomes `'manual'`; `manualRatio` is set to the dragged value and now wins                                                                                                                          |
| In `mode === 'manual'`, any `open()`/`activateTab()`/`closeTab()`                                     | `manualRatio` is preserved; no automatic 50/50                                                                                                                                                             |
| `secondarySide` changes                                                                               | `secondaryRatio`, `mode`, `tabs`, `activeTabId`, and every tab's local stack/scroll/focus are all preserved; only layout order changes                                                                     |
| Secondary explicitly closed (whole region)                                                            | Region hidden; `tabs`, `activeTabId`, `mode`, and `manualRatio`/auto ratio are retained, not discarded (section 9.2)                                                                                       |
| Secondary explicitly reopened                                                                         | Restores the exact `mode`/ratio/tabs/`activeTabId` it had when closed, clamped to section 4.2's current valid range                                                                                        |
| `availableWidth` can no longer fit the current ratio's panes even after clamping                      | Fall back to the existing stacked/narrow model via the existing path; `manualRatio`/`mode` are preserved unrendered, not discarded                                                                         |
| `availableWidth` becomes split-capable again                                                          | Restore the preserved `mode`/ratio, clamped to the current valid range, not reset to the auto default                                                                                                      |
| Live Session/product update (new Turn, new Work, new message)                                         | MUST NOT appear in `DynamicSplitInput` at all; it cannot resize, switch tabs, or reopen a closed Secondary because the resolver and the tab-set have no input through which such an event could reach them |

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
  closed. Only `open`, `activateTab`, `closeTab`, splitter drag, and `secondarySide` changes are
  legitimate triggers for any of owned-state items 1, 3, 4, 5, 6 in section 3.
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

Today, `open(stack, params)` always discards the prior flow (section 4.1). At least these patterns
in `packages/specflow-ui` rely on that today and will observe a behavior change once `open`'s
semantics generalize to "open-or-activate a tab". This list is evidence captured at the time this
document was written, not a closed set — W07 MUST re-scan `packages/specflow-ui` for the pattern
rather than trust it as exhaustive, since consumers may be added before W07 executes (one already
was, see the third entry below, added 2026-10-30 during a parallel Full Session redesign pass):

- `packages/specflow-ui/src/features/sessions/managed/ManagedSession.tsx` calls
  `navigation.open(workStack, { sessionId, turnId })` once per inspected Turn's Work. Today, opening
  a second Turn's Work discards the first; under this contract it instead opens a second tab unless
  `workStack`'s `id` is turn-invariant (today it is a fixed `'work'`-style id, so distinct Turns
  reuse the same tab id and continue to replace each other — but this must be verified, not
  assumed, once the generalization lands).
- `packages/specflow-ui/src/features/sessions/context/SessionContextPanel.tsx` defines three
  separate stack _ids_ (`demo-session-documents`, `demo-session-project`,
  `demo-session-instructions`) purely so that opening each one discards the others and lands on a
  different initial page of the same screen set. Under this contract those three opens would
  instead create three independent tabs (since their ids differ), which is very likely not the
  intended V2 behavior for this consumer and should be revisited by the feature owner once this
  capability lands — not solved speculatively here, since it is product-owned feature code outside
  this document's scope. (This file is the demo-era Context panel; a parallel Full Session redesign
  pass is expected to supersede it with `context/SessionContext.tsx` — see the next entry — so this
  consequence may become moot rather than need fixing; W07 verifies which is actually true at audit
  time instead of assuming either.)
- `packages/specflow-ui/src/features/sessions/managed/context/SessionTasksInspector.tsx` (added
  2026-10-30) defines two fixed stack ids (`managed-session-tasks`, `managed-session-task-detail`)
  for the identical reason as `SessionContextPanel.tsx` above — landing on a different initial page
  of the same Tasks inspector via `navigation.open`, not actually wanting two independent tabs.
  Same consequence, same disposition: revisit under the generalized `open`, not solved here.

This document does not change `packages/specflow-ui`. It records this as a known consequence so
the implementer and reviewer of section 9's tasks do not treat current green tests on these files
as proof that the generalized `open` is behavior-compatible by accident.

## 9. Gaps to close in nevo-ui

Concrete deltas required to make the above real, in dependency order. Each maps to one task in the
[implementation task breakdown](../../../ideas/nevo-ui/execution-plans/01-workspace-dynamic-split/README.md).

1. **`useOpenedItems` needs an optional `closable` per item** (default `true`); `close`,
   `requestClose`, and `closeAll` must skip non-closable items. This is a small, backward-compatible
   extension — existing `ItemTabs` consumers that never pass `closable: false` are unaffected.
2. **`WorkspaceContext`'s single nullable `flow` becomes a tab-keyed collection** built on the
   extended `useOpenedItems`, with the pinned entry's content sourced from `AppWorkspace.Secondary`'s
   declarative children instead of being a separate `defaultSecondary` code path mutually exclusive
   with the runtime flow.
3. **Closing the Secondary region must stop discarding the flow.** Today's `navigate('close', ...)`
   calls `publish(null, ...)`, which drops `flowRef.current` entirely. Tabs/flows must survive while
   hidden so reopening restores them (section 5, "Secondary explicitly reopened").
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
   hidden entirely when only the pinned tab is open.

None of this is implemented yet; see the linked task breakdown for sequencing, ownership, and the
verification profile each item must satisfy before it can be marked implemented in this document
and in the composition-gaps analysis.
