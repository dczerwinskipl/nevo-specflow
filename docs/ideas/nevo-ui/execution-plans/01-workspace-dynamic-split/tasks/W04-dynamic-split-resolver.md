---
id: ideas.nevo-ui.execution-plans.plan-01.task-04
type: engineering
title: 'W04 — Dynamic split resolver'
status: draft
scope: nevo-ui
areas: [ui, testing]
tags: [execution-task, temporary, implementation]
read_when:
  - implementing W04 for the workspace dynamic split plan
summary: >
  Dependency-complete task to add the pure auto/manual sizing resolver to workspaceSizing.ts and
  wire AppWorkspace's split="dynamic" mode, including the width-infeasible stacked fallback.
related:
  - ideas.nevo-ui.execution-plans.plan-01
  - design-system.implementation.react.workspace-dynamic-split
---

# W04 — Dynamic split resolver

Temporary implementation task for [Plan 01](../README.md). The parent plan owns sequencing and
independent review gates. This is a named independent-review gate: the resolver must be provably
free of any active-content input.

## Goal and ownership

Add `resolveDynamicWorkspaceSplit` (and its minimum-width constants) to `workspaceSizing.ts`, and
wire `AppWorkspace`'s new `split="dynamic"` mode, `secondaryRatio`/`onSecondaryRatioChange` props,
to consume it, including falling back to the existing stacked/narrow path when the current ratio's
panes cannot fit even after clamping.

- Kind/profile: ui / nevo-agents:implementer-ui.
- Owner paths: `packages/nevo-ui/src/app/workspace/workspaceSizing.ts`,
  `workspaceSizing.test.ts`, `packages/nevo-ui/src/app/workspace/AppWorkspace.tsx` (sizing branch
  only), `AppWorkspaceFit.contract.stories.tsx` or a new `AppWorkspaceDynamicSplit.contract.stories.tsx`.
- Prerequisites: [W02](W02-secondary-root-tab-state.md) (needs `tabs.tabs.length` as an input
  signal).
- Minimal context:
  [workspace-dynamic-split.md §3 items 4-5, §4.2, §5, §6](../../../../../design-system/implementation/react/workspace-dynamic-split.md#42-sizing-and-side).
- Acceptance coverage: workspace-dynamic-split.md's entire §5 transition table; §6 non-goals 1 and 4.

## Authoritative design entry points

- [Workspace dynamic split contract §4.2 (Sizing and side) and §5 (Transition rules)](../../../../../design-system/implementation/react/workspace-dynamic-split.md#42-sizing-and-side) —
  the exact `DynamicSplitInput`/output shape and every transition-table row this task must satisfy.
- [Workspace dynamic split contract §6 (Non-goals)](../../../../../design-system/implementation/react/workspace-dynamic-split.md#6-non-goals) —
  what `resolveDynamicWorkspaceSplit` must structurally be unable to read (active tab content,
  dependent-detail depth, any Session/product event).
- [`workspaceSizing.ts`](../../../../../../packages/nevo-ui/src/app/workspace/workspaceSizing.ts) —
  the existing pure-resolver style (`resolveWorkspaceSplit`, `resolveWorkspaceFit`,
  `capPrimaryWidth`) this task's function must match, including how `AppWorkspace` already
  chooses between split and stacked via `supportsRuntimeWorkspaceSplit`.

## Acceptance

- `resolveDynamicWorkspaceSplit(input: DynamicSplitInput)` takes exactly the fields specified in
  §4.2 (`availableWidth`, `openTabCount`, `mode`, `manualRatio`, `previousOpenTabCount`) and no
  others — in particular, no parameter through which an active tab id, a local-stack page, or a
  product event could be passed. This is checked by type signature, not just by test cases.
- Every row of §5's transition table has a corresponding test case using this function directly
  (table-driven test naming each row), including: entering split with only the pinned tab; a
  brand-new 2nd tab opened while `auto` (one-time 50/50); switching among open tabs (no resize,
  i.e. this function is not even called on `activateTab`, or is called with unchanged inputs and
  asserted to return unchanged output); closing down to the pinned tab while `auto` (returns to
  narrow default); entering `manual` and having it preserved across further tab opens/closes;
  width dropping below the fit threshold for the current ratio (returns `layout: 'stacked'`,
  preserving `manualRatio`/`mode` as an opaque "last known" value for restoration); width
  returning (restores clamped ratio, not the auto default, when a manual ratio exists).
- New `WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH`/`WORKSPACE_DYNAMIC_PRIMARY_MIN_WIDTH` constants
  (or equivalently named) are defined beside the existing sizing constants, with their values
  documented as tunable defaults, not frozen contracts — matching the contract's §4.2 language
  verbatim in a code comment.
- `AppWorkspace` with `split="dynamic"`: uncontrolled usage (no `secondaryRatio` prop) owns the
  mode/ratio internally and resizes exactly per the table; controlled usage
  (`secondaryRatio`+`onSecondaryRatioChange` both passed) never recomputes the value itself beyond
  calling the resolver and reporting its result — the product is free to persist/restore it.
- When `resolveDynamicWorkspaceSplit` returns `layout: 'stacked'`, `AppWorkspace` renders through
  the exact existing stacked code path (`state.mode === 'stacked'` branch in
  `AppWorkspaceRoot`/`useWorkspaceLayoutState`) — no duplicate stacked rendering is introduced.
- Live/product-event non-resize is structurally true (not just test-asserted): nothing in
  `AppWorkspace`'s dynamic-split wiring subscribes to Session/product state; the only inputs that
  can change `secondaryRatio`/`mode` are `activateTab`'s tab-count side effects (via W02),
  `closeTab`, splitter drag (W05, stubbed/no-op until W05 lands), and `availableWidth` changes
  from the existing `ResizeObserver`-driven measurement.

## Verification and review

`workspaceSizing.test.ts`: one test per §5 table row, named after the row's trigger, plus boundary
tests at exactly the minimum-width thresholds (fits / one px short). `AppWorkspace` contract
stories demonstrating the same transitions end-to-end with W02's tab state and W03's strip, at
the representative widths already used by the existing `AppWorkspaceFit.contract.stories.tsx`
(1108/1280/1440/1920/2560) plus a width chosen to be just above/below the new dynamic minimums.

Report actual PASS/FAIL/SKIP. **Independent review (`nevo-agents:reviewer`) is required at this
task's own gate**, specifically checking the non-goal enforcement (§6) by inspecting
`DynamicSplitInput`'s type and every call site, before W05/W06 begin.

## Out of scope

No splitter component (W05, which this task's `mode`/`manualRatio` output feeds but does not
implement); no side-swap layout (W06); no persistence of the ratio across reloads (contract §6,
left open).
