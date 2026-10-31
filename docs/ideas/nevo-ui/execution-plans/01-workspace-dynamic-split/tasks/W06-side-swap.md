---
id: ideas.nevo-ui.execution-plans.plan-01.task-06
type: engineering
title: 'W06 — Side swap'
status: draft
scope: nevo-ui
areas: [ui, testing]
tags: [execution-task, temporary, implementation]
read_when:
  - implementing W06 for the workspace dynamic split plan
summary: >
  Dependency-complete task to add secondarySide/onSecondarySideChange to AppWorkspace, swapping
  Primary/Secondary layout order while preserving every piece of sizing and tab state.
related:
  - ideas.nevo-ui.execution-plans.plan-01
  - design-system.implementation.react.workspace-dynamic-split
---

# W06 — Side swap

Temporary implementation task for [Plan 01](../README.md). The parent plan owns sequencing and
independent review gates.

## Goal and ownership

Add `secondarySide`/`onSecondarySideChange` to `AppWorkspace` so Secondary can render before or
after Primary, changing only flex order and which edge owns the divider border, with zero effect
on `secondaryRatio`, `mode`, `tabs`, `activeTabId`, or any tab's local stack/scroll/focus.

- Kind/profile: ui / nevo-agents:implementer-ui.
- Owner paths: `packages/nevo-ui/src/app/workspace/AppWorkspace.tsx` (layout-order branch),
  `AppWorkspace.css` (divider side), `AppWorkspace.test.tsx`,
  `AppWorkspace.stories.tsx`/a new `AppWorkspaceDynamicSplit.contract.stories.tsx` shared with W04.
- Prerequisites: [W04](W04-dynamic-split-resolver.md) (shares the dynamic sizing state this task
  must leave untouched).
- Minimal context:
  [workspace-dynamic-split.md §3 item 6, §4.2 (secondarySide), §5 ("secondarySide changes" row), §6](../../../../../design-system/implementation/react/workspace-dynamic-split.md#42-sizing-and-side).
- Acceptance coverage: workspace-dynamic-split.md §5's "`secondarySide` changes" row, §6 non-goal 3.

## Authoritative design entry points

- [Workspace dynamic split contract §4.2, last bullet, and §5](../../../../../design-system/implementation/react/workspace-dynamic-split.md#42-sizing-and-side) —
  "MUST NOT remount Primary, any tab, or any tab's content, and MUST NOT change `secondaryRatio`,
  `tabs`, `activeTabId`, or any tab's local stack/scroll/focus."
- [Workspace dynamic split contract §6](../../../../../design-system/implementation/react/workspace-dynamic-split.md#6-non-goals) —
  side swap is explicitly a pure layout operation, not a navigation/product-state operation.

## Acceptance

- `secondarySide?: 'start' | 'end'` (default `'end'`, today's only behavior) and
  `onSecondarySideChange?: (side) => void` follow the repository's existing controlled-prop
  convention (same shape as `AppWorkspace.Secondary`'s `open`/`onOpenChange`): omitted value prop
  means `AppWorkspace` owns the state; both passed means the product owns/persists it.
- Toggling `secondarySide` changes only the rendered order of Primary/Secondary and which side
  carries the surface divider border; `secondaryRatio`, `mode`, `tabs`, `activeTabId`, and every
  tab's local stack/scroll/focus are verified unchanged across the toggle (not just visually
  unchanged — assert via stable React element identity/mount counters, matching W03's remount
  check).
- The swap applies identically regardless of `split` value (not gated to `"dynamic"` only), since
  it is pure layout and nothing in the contract restricts it to the dynamic engine.
- No change to stacked-layout behavior: `secondarySide` has no visible effect when `state.mode ===
'stacked'` (there is only one visible surface at a time), matching the contract's framing of
  side swap as a split-layout-only concept.

## Verification and review

`AppWorkspace.test.tsx`: assert DOM order change on `secondarySide` toggle; assert no remount of
Primary/Secondary content (stable instance/ref identity) across the toggle; assert stacked mode is
visually unaffected. Storybook contract story: "swap sides with 2 open tabs and a manual ratio ->
both tabs, the active one, and the ratio survive; only the side changes."

Report actual PASS/FAIL/SKIP. Independent review (`nevo-agents:reviewer`) at the parent plan's W07
gate.

## Out of scope

No splitter changes (W05, parallel-safe with this task); no new sizing logic (reuses W04's state
verbatim); no animation/transition polish for the swap beyond what `AppWorkspace`'s existing
mobile/transition mechanics already provide for layout changes.
