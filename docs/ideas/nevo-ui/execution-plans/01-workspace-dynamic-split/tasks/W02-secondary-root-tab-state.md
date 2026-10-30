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
tab-keyed collection of flows (the pinned declarative Secondary content, if any, plus the legacy
`open()` slot, if used, plus zero or more `openTab()`-opened stacks), with closing the whole
Secondary region preserving tabs/flows so they can be restored on reopen.

**Revised 2026-10-30 after external review** (Findings 1-3 against
[the contract](../../../../../design-system/implementation/react/workspace-dynamic-split.md)):
this task now implements **two** public methods, not one generalized `open`. `open(definition,
params)` keeps its exact current signature and exact current observable behavior — it always
targets one reserved tab-collection slot shared across every call regardless of `definition.id`,
replacing that slot's content on every call, exactly like today's single nullable flow. `openTab
(definition, params)` is new and additive: it is the generalized "open-or-activate a tab keyed by
a derived `tabInstanceId`" operation the original draft of this task mistakenly assigned to `open`
itself (contract §4.1, Finding 1 — re-activating an already-open tab while silently ignoring new
params is correct for `openTab`'s contract but was wrong for `open`'s). This task also no longer
assumes a pinned tab always exists (Finding 2) — see Acceptance below.

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
  `activateTab(id)`, `closeTab(id)`, and `openTab(definition, params)`, alongside the existing
  `open`/`close`/`canLeaveScope`.
- `open(definition, params)` is behavior-unchanged from today: it always targets one reserved
  tab-collection slot shared by every `open` call regardless of `definition.id` or `params`. If
  that slot is empty, it creates a tab there (closable: true) at the registered initial page and
  activates it. If the slot already holds a tab, `open` **replaces** it — discards its local
  stack/scroll/focus and starts fresh at the new definition's initial page with the new params —
  then activates it. This reproduces today's single-flow `open` byte-for-byte; it is NOT the
  "activate unchanged" rule (that belongs to `openTab` below). See contract §4.1 (Finding 1) for
  why the two must not be conflated and §8 for the four confirmed-compatible
  `packages/specflow-ui` consumers this preserves without any change to those files.
- `openTab(definition, params)` is new: computes `tabInstanceId` from `definition.id` joined with
  `definition.instanceId(params)` when `definition.instanceId` is provided, else just
  `definition.id` (contract §4.1). If no tab with that id is open, creates one at its registered
  initial page and activates it; if one is already open, activates it and leaves its existing
  page/local-stack/scroll/focus untouched (its stored params are not replaced, matching
  `useOpenedItems.open`'s existing "keeps its stored value" rule) — this instance-identity contract
  is correct for `openTab` specifically because its whole point is that the id fully encodes the
  entity.
- **The pinned tab is optional** (contract §3, §9 item 2; Finding 2): present in `tabs.tabs` with
  `closable: false` only when `AppWorkspace.Secondary` is rendered with declarative children and
  `open !== false`; absent entirely otherwise. When present, it is never created/destroyed by
  `open`/`openTab`/`closeTab`, and remains whenever every `open`/`openTab`-opened tab has been
  closed. When absent, closing the last remaining tab leaves `tabs.tabs` empty and the Secondary
  region closes (no tab to fall back to) — verify this against `AppWorkspace.tsx`'s existing
  `resolveComposedWorkspace`, where `AppWorkspace.Secondary` is already optional, before assuming
  a pinned tab can be synthesized from nothing.
- `closeTab(id)` on a `closable: false` tab is a no-op (resolves `false`); on a closable tab (the
  legacy `open()` slot or any `openTab()` entry) it consults that tab's own registered leave guard
  via the existing `registerGuard`/`passesGuard` mechanism, then removes it and activates its right
  neighbor, else its left one, matching `useOpenedItems`'s existing neighbor rule. Closing the last
  remaining opened tab leaves only the pinned tab active if one exists, else leaves `tabs.tabs`
  empty and closes the Secondary region — it does not synthesize a pinned tab.
- Explicitly closing the Secondary region (today's `back`-at-root / Close action) hides it without
  clearing `tabs`/`activeTabId`/any flow; reopening restores the exact tab set, active tab, and
  each tab's local stack/scroll/focus, not just the pinned content (if any). This is the specific
  behavior change from today's `publish(null, ...)`, called out in the contract's §9 item 3.
- A `scopeKey` change still invalidates everything immediately (todays's behavior, unchanged):
  scope invalidation is not an ordinary close and must not attempt to preserve tabs across scopes.
- Stale-callback invariants (a disposed screen's async callback cannot mutate a newer flow) hold
  per tab, independently — closing/replacing tab A must not affect an in-flight callback from tab
  B.
- `useSecondaryStack<TPages>()` continues to operate on "the flow that mounted this screen" with no
  signature change; it is unaware tabs exist.
- **Consumer-compatibility audit is an exit criterion of this task** (contract §9 item 3; Finding
  3, not deferred to W07): re-scan `packages/specflow-ui` for `navigation.open`/
  `defineSecondaryStack` fixed-id usage (do not rely solely on the contract's §8 list) and confirm
  each caller of `open` observes no behavior change under this task's implementation, since `open`
  itself did not change semantics. Known at the time of this revision: `ManagedSession.tsx`,
  `SessionContextPanel.tsx`, `SessionTasksInspector.tsx`, and `TaskWorkspace.tsx`'s
  `taskWorkspaceMaterialStack`/`taskWorkspaceHistoryStack` usage (the last one found during this
  revision's own code review, added to the contract's §8). Any consumer found to actually change
  behavior blocks this task's review gate and is reported to the feature owner — it is not silently
  reconciled here.

## Verification and review

Extend `WorkspaceContext.test.tsx` and `WorkspaceContext.contract.stories.tsx` with cases for:
`open` replacing its slot in place on every call regardless of definition/params (no behavior
change from today, asserted explicitly, not just "still passes"); `openTab` opening a brand-new
tab vs. re-activating an already-open instance id (no remount, no param/page reset); a workspace
with no pinned tab (no `AppWorkspace.Secondary`) behaving correctly for create/close-to-empty; the
pinned tab (when present) surviving `closeTab` attempts; neighbor-activation on close; Secondary
close/reopen preserving the full tab set (not just the pinned one, and correctly when there is no
pinned one); stale-callback isolation across two concurrently open tabs; `scopeKey` change still
discarding everything. Add Storybook interaction cases demonstrating "2 `openTab` tabs open ->
close Secondary -> reopen -> both tabs and the previously active one are back" and "no declarative
Secondary, `open()` called twice with different params -> one tab, latest params, no second tab."

Also run the `packages/specflow-ui` consumer-compatibility audit described in Acceptance above
(read-only: grep/inspect, make no changes to that package) and report its factual per-file finding
alongside PASS/FAIL/SKIP.

Report actual PASS/FAIL/SKIP and any intentional deviation from the contract (which must then
update the contract document). Independent review (`nevo-agents:reviewer`) is required at this
task's own gate per the parent plan, before W03/W04 begin — this is the plan's named high-risk
gate, and the gate now includes the consumer-compatibility audit's outcome.

## Out of scope

No tab strip UI (W03); no sizing/resize changes (W04-W06); no change to
`secondaryNavigationModel.ts`'s algorithm itself beyond instantiating it per tab instead of once;
no change to `packages/specflow-ui` consumers' source (the audit above is read-only; any
behavior-changed finding is reported to the feature owner, not fixed here) — see the contract's §8
compatibility notes for the confirmed-compatible status this task's `open`/`openTab` split is
designed to preserve.
