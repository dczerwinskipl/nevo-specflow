---
id: ideas.nevo-ui.execution-plans.plan-01.task-01
type: engineering
title: 'W01 — Closable item-set extension'
status: draft
scope: nevo-ui
areas: [ui, testing]
tags: [execution-task, temporary, implementation]
read_when:
  - implementing W01 for the workspace dynamic split plan
summary: >
  Dependency-complete task to add an optional non-closable item to useOpenedItems/ItemTabs,
  the first prerequisite for a pinned Secondary root tab.
related:
  - ideas.nevo-ui.execution-plans.plan-01
  - design-system.implementation.react.workspace-dynamic-split
  - design-system.implementation.react.item-tabs
---

# W01 — Closable item-set extension

Temporary implementation task for
[Plan 01](../README.md). The parent plan owns sequencing and independent review gates.

## Goal and ownership

Add an optional per-item `closable` flag (default `true`) to `useOpenedItems`, and make
`ItemTabs` omit the close affordance for a non-closable item, with no behavior change for any
existing caller that never sets it to `false`.

- Kind/profile: ui / nevo-agents:implementer-ui.
- Owner paths: `packages/nevo-ui/src/components/navigation/ItemTabs/useOpenedItems.ts`,
  `useOpenedItems.*.test.ts` (if split out), `ItemTabs.tsx`, `ItemTabs.test.tsx`.
- Prerequisites: none.
- Minimal context: [item-tabs.md](../../../../../design-system/implementation/react/item-tabs.md),
  [workspace-dynamic-split.md §9.1](../../../../../design-system/implementation/react/workspace-dynamic-split.md#9-gaps-to-close-in-nevo-ui).
- Acceptance coverage: workspace-dynamic-split.md §3 item 2, §9 item 1.

## Authoritative design entry points

- [Workspace dynamic split contract, §9](../../../../../design-system/implementation/react/workspace-dynamic-split.md#9-gaps-to-close-in-nevo-ui) —
  why this extension is needed and what it must guarantee.
- [Item tabs and content tabs host](../../../../../design-system/implementation/react/item-tabs.md) —
  the existing contract this extends; do not restate its unrelated behavior here.

## Acceptance

- `OpenedItem` (or the type `useOpenedItems` accepts) gains an optional `closable?: boolean`,
  defaulting to `true` when omitted, with no required change to any existing call site.
- `close(id)`, `requestClose(id)`, and `closeAll()` MUST NOT remove an item whose `closable` is
  `false`; `requestClose` on such an item resolves `false` without consulting `canClose` (there is
  nothing to guard — the refusal is unconditional).
- `ItemTabs` renders no close `x`, no `Delete`-key close, and no middle-click close, and omits the
  row's "Close `<label>`" entry in the `Opened (N)` menu, for a non-closable item. Its tab/row
  otherwise looks and behaves exactly like a closable one (icon, label, status, menu description).
- A non-closable item remains fully keyboard/AT reachable and activatable; only its close path is
  removed.
- Existing `ItemTabs`/`useOpenedItems` Storybook/unit coverage continues to pass unmodified except
  for additive new cases; no existing test's expected behavior changes.

## Verification and review

Unit tests in `useOpenedItems.test.ts` (new or extended) covering: default `closable` is `true`;
`close`/`requestClose`/`closeAll` skip a `closable: false` item; mixed closable/non-closable sets
close only the closable ones on `closeAll`. `ItemTabs` Storybook/test coverage for a tab with
`closable: false`: no close `x`, no menu close row, full keyboard reachability.

Report actual PASS/FAIL/SKIP. Independent review uses `nevo-agents:reviewer` at the parent plan's
W02 gate (this task is low-risk enough not to need its own solo gate, but W02 cannot start review
until this task's tests pass).

## Out of scope

No Secondary/`AppWorkspace` changes (that is W02+); no new ItemTabs visual treatment for
"pinned" beyond omitting the close affordance — a distinct pinned icon/badge, if ever wanted, is a
separate visual decision, not required by the workspace-dynamic-split contract.
