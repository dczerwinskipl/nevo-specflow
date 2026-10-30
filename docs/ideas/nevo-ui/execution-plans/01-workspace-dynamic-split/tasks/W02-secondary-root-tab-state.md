---
id: ideas.nevo-ui.execution-plans.plan-01.task-02
type: engineering
title: 'W02 — Secondary root-tab state'
status: draft
scope: nevo-ui
areas: [ui, testing]
tags: [execution-task, temporary, implementation]
read_when:
  - implementing W02 for the workspace dynamic split plan
summary: >
  Dependency-complete task to generalize WorkspaceContext's single Secondary flow into a
  tab-keyed collection, with open() activating-or-creating a tab and close surviving hide/reopen.
related:
  - ideas.nevo-ui.execution-plans.plan-01
  - design-system.implementation.react.workspace-dynamic-split
  - design-system.implementation.react.secondary-navigation
---

# W02 — Secondary root-tab state

Temporary implementation task for [Plan 01](../README.md). The parent plan owns sequencing and
independent review gates. This is the highest-risk task in the plan: it changes
`WorkspaceContext`'s core model and its close semantics.

## Goal and ownership

Generalize `AppWorkspaceProvider`/`WorkspaceContext` from one nullable active flow to an ordered,
tab-keyed collection of flows (the pinned declarative Secondary content plus zero or more opened
stacks), with `open()` activating an already-open tab instead of discarding it, and with closing
the whole Secondary region preserving tabs/flows so they can be restored on reopen.

- Kind/profile: ui / nevo-agents:implementer-ui.
- Owner paths: `packages/nevo-ui/src/app/workspace/WorkspaceContext.tsx`,
  `WorkspaceContext.test.tsx`, `WorkspaceContext.contract.stories.tsx`,
  `secondaryNavigationModel.ts` (reused per tab, not rewritten),
  `secondaryNavigationModel.test.ts` (extend only if the per-flow model itself needs a new case).
- Prerequisites: [W01](W01-closable-item-set-extension.md).
- Minimal context:
  [workspace-dynamic-split.md §3, §4.1, §9 items 2-3](../../../../../design-system/implementation/react/workspace-dynamic-split.md),
  [secondary-navigation.md](../../../../../design-system/implementation/react/secondary-navigation.md).
- Acceptance coverage: workspace-dynamic-split.md §3 items 1-2, §4.1, §9 items 2-3, §5 rows for
  "only pinned tab open", "second tab open", "switch tabs", "close down to pinned tab", "Secondary
  explicitly closed/reopened".

## Authoritative design entry points

- [Workspace dynamic split contract §3 (Owned state) and §4.1 (Root tabs API)](../../../../../design-system/implementation/react/workspace-dynamic-split.md#3-owned-state) —
  the exact state shape and API this task implements.
- [Secondary navigation](../../../../../design-system/implementation/react/secondary-navigation.md) —
  the existing single-flow contract this generalizes; its push/pop/replace/stale-entry invariants,
  leave-guard, `preserveOnDataLoss`, and focus-restoration behavior must be preserved per tab, not
  reinvented.
- [Composition-gaps §5.2](../../../../specflow-ui/design-system-component-composition-gaps.md#52-p0--default-context-secondary-cannot-currently-be-dismissed-persistently) —
  the already-implemented default-Secondary open/close behavior this task must keep working for
  the pinned tab specifically.

## Acceptance

- `useSecondaryNavigation()` exposes `tabs: { tabs: Array<{id, closable, title}>, activeTabId }`,
  `activateTab(id)`, and `closeTab(id)`, alongside the existing `open`/`close`/`canLeaveScope`.
- `open(definition, params)`: if no tab with `definition.id` is open, creates one at its
  registered initial page and activates it; if one is already open, activates it and leaves its
  existing page/local-stack/scroll/focus untouched (its stored params are not replaced, matching
  `useOpenedItems.open`'s existing "keeps its stored value" rule).
- The pinned tab (`AppWorkspace.Secondary`'s declarative content) is always present in `tabs.tabs`
  with `closable: false`, is never created/destroyed by `open`/`closeTab`, and is the sole
  remaining tab whenever every opened tab has been closed.
- `closeTab(id)` on a `closable: false` tab is a no-op (resolves `false`); on a closable tab it
  consults that tab's own registered leave guard via the existing `registerGuard`/`passesGuard`
  mechanism, then removes it and activates its right neighbor, else its left one, matching
  `useOpenedItems`'s existing neighbor rule. Closing the last remaining opened tab leaves only the
  pinned tab active — it does not close the Secondary region by itself.
- Explicitly closing the Secondary region (today's `back`-at-root / Close action) hides it without
  clearing `tabs`/`activeTabId`/any flow; reopening restores the exact tab set, active tab, and
  each tab's local stack/scroll/focus, not just the pinned content. This is the specific behavior
  change from today's `publish(null, ...)`, called out in the contract's §9 item 3.
- A `scopeKey` change still invalidates everything immediately (todays's behavior, unchanged):
  scope invalidation is not an ordinary close and must not attempt to preserve tabs across scopes.
- Stale-callback invariants (a disposed screen's async callback cannot mutate a newer flow) hold
  per tab, independently — closing/replacing tab A must not affect an in-flight callback from tab
  B.
- `useSecondaryStack<TPages>()` continues to operate on "the flow that mounted this screen" with no
  signature change; it is unaware tabs exist.

## Verification and review

Extend `WorkspaceContext.test.tsx` and `WorkspaceContext.contract.stories.tsx` with cases for:
opening a brand-new tab vs. re-opening an already-open tab id (no remount, no param/page reset);
the pinned tab surviving `closeTab` attempts; neighbor-activation on close; Secondary close/reopen
preserving the full tab set (not just the pinned one); stale-callback isolation across two
concurrently open tabs; `scopeKey` change still discarding everything. Add a Storybook interaction
case demonstrating "2 tabs open -> close Secondary -> reopen -> both tabs and the previously
active one are back."

Report actual PASS/FAIL/SKIP and any intentional deviation from the contract (which must then
update the contract document). Independent review (`nevo-agents:reviewer`) is required at this
task's own gate per the parent plan, before W03/W04 begin — this is the plan's named high-risk
gate.

## Out of scope

No tab strip UI (W03); no sizing/resize changes (W04-W06); no change to
`secondaryNavigationModel.ts`'s algorithm itself beyond instantiating it per tab instead of once;
no change to `packages/specflow-ui` consumers (see the contract's §8 compatibility notes — this
task only changes `packages/nevo-ui`, and the consequence for `ManagedSession`/
`SessionContextPanel` is recorded there for the feature owner to act on separately).
