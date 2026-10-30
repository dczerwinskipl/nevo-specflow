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

**Revised 2026-10-30 after external review (Finding 2):** the pinned tab is not guaranteed to
exist (contract §3, §9 item 2 — a workspace with no declarative `AppWorkspace.Secondary` has none
until `open`/`openTab` creates one). "Exactly one open tab" below means whichever single entry is
present — the pinned one, or, in a workspace with no declarative Secondary, the sole `open()`/
`openTab()`-opened tab — not specifically the pinned one.

- With exactly one open tab, Secondary's header renders exactly as it does today for that case (no
  strip, no switcher button, no layout shift versus current behavior) — this is a pixel/DOM
  regression check, not just a logical one, and must hold whether or not that one tab is pinned.
- With two or more open tabs, `ItemTabs` renders in the Secondary header's content slot, left of
  header actions, using each tab's title (the pinned tab's declared title when one exists, every
  other tab's stack `title`); activating a tab calls `activateTab`; the pinned tab, when present,
  shows no close affordance (via W01's `closable: false`) — every other tab (the legacy `open()`
  slot or an `openTab()` entry) is closable.
- Below `ItemTabs`' switcher threshold, the strip collapses to its existing switcher button
  behavior unmodified.
- **Revised 2026-10-30 after W02 review:** this bullet originally required that "[s]witching tabs
  via the strip does not remount either tab's content, does not reset either tab's scroll/local
  stack" — a literal reading that is unachievable within this task's owner paths and contradicts
  the architecture `WorkspaceContextValue` (W02, shipped and independently reviewed) already has.
  Investigation of the current code confirms why: `WorkspaceContextValue.secondary` exposes
  exactly one active surface at a time (`WorkspaceContext.tsx`'s `value.secondary` is derived from
  `activeRuntimeTab(visibleTabsState)` alone — there is no API to read or render every open tab's
  content simultaneously), and `AppWorkspace.tsx`'s `AppWorkspaceRoot` renders exactly one
  `RuntimeSurfaceRegion` for Secondary, keyed by the active entry (`runtime-${instanceKey}`).
  Because the inactive tab's region is not present in the tree at all while backgrounded (not
  merely hidden), switching tabs necessarily unmounts the previously-active tab's subtree and
  mounts the newly-active one fresh — this is a real remount, not a defect this task introduces or
  could fix within its stated owner paths (`AppWorkspace.tsx`, `WorkspaceHeader.tsx` only;
  `WorkspaceContext.tsx`, which owns `secondary`'s single-surface shape, is explicitly not an owner
  path here and was already shipped/reviewed at W02). It is also exactly what the Content tabs host
  pattern specifies: a host "renders **the active item**" (singular;
  [item-tabs.md](../../../../../design-system/implementation/react/item-tabs.md#content-tabs-host-pattern-not-implemented-in-nevo-ui)),
  not every open item mounted-but-hidden. Building true mount-all-hide-inactive rendering would be
  a materially bigger architecture change than this plan scopes for (see the plan's own "Out of
  scope"). The corrected, achievable guarantees below replace the original bullet:
  - Switching tabs via the strip MUST remount the newly-activated tab's content (expected, not a
    regression) but MUST land it back on the same logical page/local-stack entry and the same
    `params` the tab held before the switch — this is already guaranteed today, unaffected by
    mounting, because `WorkspaceContext.tsx` keeps each tab's `SecondaryEntry`/stack in its
    `TabsSnapshot` independent of whether that tab's surface is currently rendered; `activateTab`
    only reads this state, it never resets it. Verify by asserting the remounted content's
    page/params match what was active before the switch, not by asserting the DOM node or a
    mount-counter stayed stable.
  - Scroll position is a separate, genuine gap, not something this task is required to close or may
    silently claim is solved: `WorkspaceContext.tsx` tracks no restorable scroll value for any entry
    today. The only comparable per-entry value that exists is a focus-target descriptor
    (`WorkspaceFocusTarget`, captured via `getActiveElement()`), and it is wired only to
    back/pop/close (`restoreFocus` in `WorkspaceContext.tsx`), not to `activateTab` or `openTab`
    re-activation. A remounted tab therefore legitimately renders with its scroll at the top; this
    task MUST NOT be verified against a "scroll position preserved" assertion. If scroll-position
    restoration across a tab switch is later wanted, it needs a new, explicitly scoped follow-up
    that adds a tracked, restorable scroll value to `WorkspaceContext.tsx`'s per-entry state (not an
    owner path of this task, and not currently scoped by any task in this plan) — see "Out of
    scope" below.
  - Switching tabs MUST NOT touch sizing state beyond what W04's resolver itself defines for a
    tab-count-driven resize (verified together with W04, since sizing depends on tab count/activity
    signals this task's `activateTab` calls produce).
- Keyboard/AT behavior matches `ItemTabs`' existing contract with no local reimplementation.

## Verification and review

Storybook interaction stories: "open a second root tab -> strip appears, pinned tab has no close
control"; "close down to the pinned tab -> strip disappears, header matches the single-Secondary
baseline exactly"; "no declarative Secondary, two `openTab` tabs open, close one -> strip
disappears, remaining tab's header matches the single-Secondary baseline exactly, with no pinned
tab present"; **(revised 2026-10-30 after W02 review, replacing the original "activate an existing
tab via strip -> no remount" scenario, which asserted an unachievable guarantee — see the
Acceptance revision above)** "activate an existing tab via strip, then switch back to a tab that
was pushed two pages deep before the switch -> content remounts (do not assert a mount-counter
staying at zero or stable DOM node identity), but the remounted content reflects that tab's stored
page/local-stack depth and params, not the definition's initial page — assert via the rendered
page's identity/params (e.g. a data attribute or rendered prop reflecting the stored page), not
scroll position, which is explicitly not preserved". Axe/a11y check on the strip inside the
Secondary header context specifically (header height/action-budget interaction, not just
`ItemTabs` in isolation, which `item-tabs.md` already covers).

Report actual PASS/FAIL/SKIP. Independent review (`nevo-agents:reviewer`) at the parent plan's W07
gate; no solo gate required for this task alone.

## Out of scope

No sizing/resize logic (W04); no splitter (W05); no side swap (W06). Do not add a second
horizontal section selector or any Context-specific content — this task renders tabs generically
by id/title, with zero knowledge of what "Context," "Tasks," or any other product tab means.

**Added 2026-10-30 after W02 review:** no mount-all-hide-inactive rendering of Secondary's tabs —
`WorkspaceContext.tsx`'s single `secondary` surface (W02, shipped) makes remount-on-switch the
real, expected mechanism; changing that is a `WorkspaceContext.tsx` change, not an
`AppWorkspace.tsx`/`WorkspaceHeader.tsx` one, so it is out of scope for this task and not currently
scoped by any task in this plan. No scroll-position restoration across a tab switch — nothing in
`WorkspaceContext.tsx` tracks a restorable scroll value today (only a focus-target descriptor
exists, and only for back/pop/close), so this is a genuine, pre-existing gap rather than a
regression this task causes; closing it, if ever wanted, needs a new follow-up task that extends
`WorkspaceContext.tsx`'s per-entry state to track and replay a scroll value, analogous to today's
`WorkspaceFocusTarget`, and wires it into `activateTab`/`openTab` re-activation — not assumed by
this document to already exist or to be this task's job to add.
