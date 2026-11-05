---
id: ideas.nevo-ui.execution-plans.plan-01.task-05
type: engineering
title: 'W05 — Accessible splitter'
status: draft
scope: nevo-ui
areas: [ui, testing]
tags: [execution-task, temporary, implementation]
read_when:
  - implementing W05 for the workspace dynamic split plan
summary: >
  Dependency-complete task to build the new interactive WorkspaceSplitter primitive (keyboard,
  pointer and touch resize, ARIA window-splitter pattern) and wire it into AppWorkspace.
related:
  - ideas.nevo-ui.execution-plans.plan-01
  - design-system.implementation.react.workspace-dynamic-split
---

# W05 — Accessible splitter

Temporary implementation task for [Plan 01](../README.md). The parent plan owns sequencing and
independent review gates.

## Goal and ownership

Build `WorkspaceSplitter`, a focusable `role="separator"` window-splitter control supporting
pointer drag, keyboard resize, and touch drag without hijacking page scroll, and render it from
`AppWorkspace` between Primary and Secondary exactly when `split="dynamic"` resolves to
`layout: 'split'`, feeding drags into W04's `mode`/`manualRatio` state.

- Kind/profile: ui / nevo-agents:implementer-ui.
- Owner paths: new `packages/nevo-ui/src/app/workspace/WorkspaceSplitter.tsx` (+ its own test/
  Storybook files, matching the module's co-location convention), `AppWorkspace.tsx` (render-site
  wiring only), `AppWorkspaceLabels` (new label for the splitter's accessible name).
- Prerequisites: [W04](W04-dynamic-split-resolver.md).
- Minimal context:
  [workspace-dynamic-split.md §4.3, §7](../../../../../design-system/implementation/react/workspace-dynamic-split.md#43-workspacesplitter).
- Acceptance coverage: workspace-dynamic-split.md §7 ("`WorkspaceSplitter`" subsection) in full.

## Authoritative design entry points

- [Workspace dynamic split contract §4.3 and §7](../../../../../design-system/implementation/react/workspace-dynamic-split.md#7-accessibility) —
  the exact ARIA/keyboard/pointer/touch requirements; implement these, do not invent an
  alternative interaction model.
- [`Separator`](../../../../../../packages/nevo-ui/src/components/layout/Separator/Separator.tsx) —
  explicitly **not** reused/extended for this (contract §2): confirm the new component stays
  separate rather than adding interactive props to the decorative `Separator`.
- [`ItemTabs`' existing 44px coarse-pointer hit-area precedent](../../../../../design-system/implementation/react/item-tabs.md) —
  match this sizing convention for the splitter's touch hit area.

## Acceptance

- `WorkspaceSplitter` renders `role="separator"`, `aria-orientation="vertical"`,
  `aria-valuenow`/`aria-valuemin`/`aria-valuemax` reflecting the live split, and a non-empty
  accessible name sourced from `AppWorkspaceLabels` (new key, replaceable like existing
  Back/Close labels), defaulting to "Resize secondary panel" or equivalent.
- Focusable (`tabIndex=0`) with a visible focus-visible ring matching the DS convention used by
  `WorkspaceHeader` actions and `ItemTabs` tabs; does not trap focus (Tab/Shift+Tab move focus to
  the adjacent region).
- Left/Right arrow keys adjust the ratio by a fixed step; Home/End jump to the minimum/maximum
  valid ratio for the current `availableWidth` (from W04's constants); any keyboard adjustment
  sets `mode: 'manual'`.
- Pointer drag via `pointerdown`/`pointermove`/`pointerup` (not HTML5 DnD) sets `manualRatio` live
  during the drag and commits `mode: 'manual'` on drag start.
- Touch drag works identically (`touch-action: none` on the hit area) and does not scroll the page
  or either pane during the drag; the hit area meets the 44px coarse-pointer precedent even though
  the visual splitter line is thin.
- Rendered only when `AppWorkspace`'s resolved layout (W04) is `'split'` with `split="dynamic"`;
  absent in every other `split` value and in stacked layout.

## Verification and review

New `WorkspaceSplitter.test.tsx`: ARIA attributes present and update on value change; keyboard
Left/Right/Home/End behavior; focus-visible rendering; no focus trap. Storybook interaction
stories: pointer-drag resize (simulated pointer events) committing `mode: 'manual'`; a touch-drag
story asserting no scroll on the page/pane ancestors during the gesture; an axe/a11y check
specifically on the splitter (window-splitter pattern conformance), not just a generic pass.

Report actual PASS/FAIL/SKIP. Independent review (`nevo-agents:reviewer`) at the parent plan's W07
gate.

## Out of scope

No side-swap layout (W06, parallel-safe with this task); no persistence of the dragged ratio
across reloads (contract §6, left open); no non-vertical (horizontal split) orientation — Workspace
V2 only needs Primary/Secondary side-by-side resizing.
