---
id: ideas.nevo-ui.execution-plans.plan-01.task-03
type: engineering
title: 'W03 — Tab strip composition'
status: draft
scope: nevo-ui
areas: [ui, testing]
tags: [execution-task, temporary, implementation]
read_when:
  - implementing W03 for the workspace dynamic split plan
summary: >
  Dependency-complete task to render Secondary's root tabs via ItemTabs inside the existing
  Secondary header, hidden entirely while only the pinned tab is open.
related:
  - ideas.nevo-ui.execution-plans.plan-01
  - design-system.implementation.react.workspace-dynamic-split
  - design-system.implementation.react.item-tabs
---

# W03 — Tab strip composition

Temporary implementation task for [Plan 01](../README.md). The parent plan owns sequencing and
independent review gates.

## Goal and ownership

Render the `tabs` state from W02 as an `ItemTabs` strip inside `AppWorkspace`'s existing Secondary
header region, following the Content tabs host pattern: `AppWorkspace` stays content-blind, each
tab supplies its own title, and the strip is absent whenever only the pinned tab is open so the
one-tab case is pixel-identical to today's single default Secondary.

- Kind/profile: ui / nevo-agents:implementer-ui.
- Owner paths: `packages/nevo-ui/src/app/workspace/AppWorkspace.tsx`,
  `packages/nevo-ui/src/app/workspace/WorkspaceHeader.tsx` (header content slot only, no new
  action-budget behavior), `AppWorkspace.stories.tsx`, `AppWorkspace.test.tsx`.
- Prerequisites: [W02](W02-secondary-root-tab-state.md).
- Minimal context:
  [workspace-dynamic-split.md §4.1 (tab strip paragraph)](../../../../../design-system/implementation/react/workspace-dynamic-split.md#41-root-tabs),
  [item-tabs.md's Content tabs host pattern](../../../../../design-system/implementation/react/item-tabs.md#content-tabs-host-pattern-not-implemented-in-nevo-ui).
- Acceptance coverage: workspace-dynamic-split.md §4.1 last paragraph, §7 (tab strip a11y).

## Authoritative design entry points

- [Workspace dynamic split contract §4.1](../../../../../design-system/implementation/react/workspace-dynamic-split.md#41-root-tabs) —
  "the tab strip itself is rendered by `AppWorkspace`... following the Content tabs host
  pattern... MUST NOT render at all when exactly one tab is open."
- [Item tabs and content tabs host](../../../../../design-system/implementation/react/item-tabs.md) —
  reuse its placement, width, switcher, and a11y rules verbatim; do not re-specify or diverge from
  them here.

## Acceptance

- With exactly one open tab (the pinned one), Secondary's header renders exactly as it does today
  (no strip, no switcher button, no layout shift versus current behavior) — this is a pixel/DOM
  regression check, not just a logical one.
- With two or more open tabs, `ItemTabs` renders in the Secondary header's content slot, left of
  header actions, using each tab's title (pinned tab's declared title, opened tabs' stack
  `title`); activating a tab calls `activateTab`; the pinned tab shows no close affordance (via
  W01's `closable: false`).
- Below `ItemTabs`' switcher threshold, the strip collapses to its existing switcher button
  behavior unmodified.
- Switching tabs via the strip does not remount either tab's content, does not reset either tab's
  scroll/local stack, and does not touch sizing state (verified together with W04, since sizing
  depends on tab count/activity signals this task's `activateTab` calls produce).
- Keyboard/AT behavior matches `ItemTabs`' existing contract with no local reimplementation.

## Verification and review

Storybook interaction stories: "open a second root tab -> strip appears, pinned tab has no close
control"; "close down to the pinned tab -> strip disappears, header matches the single-Secondary
baseline exactly"; "activate an existing tab via strip -> no remount" (assert via a mount-counter
or stable DOM node identity, not just visual state). Axe/a11y check on the strip inside the
Secondary header context specifically (header height/action-budget interaction, not just
`ItemTabs` in isolation, which `item-tabs.md` already covers).

Report actual PASS/FAIL/SKIP. Independent review (`nevo-agents:reviewer`) at the parent plan's W07
gate; no solo gate required for this task alone.

## Out of scope

No sizing/resize logic (W04); no splitter (W05); no side swap (W06). Do not add a second
horizontal section selector or any Context-specific content — this task renders tabs generically
by id/title, with zero knowledge of what "Context," "Tasks," or any other product tab means.
