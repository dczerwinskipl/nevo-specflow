---
id: ideas.nevo-ui.execution-plans.plan-01
type: engineering
title: 'Temporary execution plan 01 — Workspace dynamic split'
status: draft
scope: nevo-ui
areas: [ui, testing]
tags: [execution-plan, temporary, workspace, secondary, tabs, resize, design-system]
read_when:
  - implementing Secondary root tabs or the auto/manual dynamic split in packages/nevo-ui
  - selecting the next dependency-complete task for this capability
summary: >
  Implementation-ready decomposition of Secondary root tabs, the auto/manual dynamic split
  resolver, the accessible splitter and the side swap, all confined to packages/nevo-ui.
related:
  - design-system.implementation.react.workspace-dynamic-split
  - design-system.implementation.react.secondary-navigation
  - design-system.implementation.react.item-tabs
  - ideas.specflow-ui.design-system-component-composition-gaps
  - ideas.nevo-ui
---

# Plan 01 — Workspace dynamic split

## Ready handoff

Preparation is complete for this bounded delivery; implementation is not done. The
[Design System contract](../../../../design-system/implementation/react/workspace-dynamic-split.md)
owns the decision-complete behavior (owned state, public API, the auto/manual transition table,
non-goals and the accessible splitter contract). This plan owns only sequencing and independent
review gates for implementing it. Reopen a task only on a newly evidenced material contradiction
with that contract; draft status on this plan does not reopen already-accepted product behavior
in `ideas/specflow-ui/design-system-component-composition-gaps.md` §5.4/§6.2 or in the V10/V2
product documents it cites.

## Scope and result

A product workspace can opt a split-capable `AppWorkspace` into `split="dynamic"` and get: a
pinned non-closable root tab plus any number of independently opened root tabs in Secondary, each
with its own local back/detail stack; an auto/manual width split that resizes exactly on the
transitions the contract's table specifies and never otherwise; a real accessible splitter; and a
left/right side swap that preserves every piece of that state. Nothing here changes
`packages/specflow-ui`; Full Session (or any other consumer) adopts this capability as separate,
later, product-owned work.

## Task graph

| Task                                                                                                   | Dependencies                 | Kind / implementer           | Planning readiness                         |
| ------------------------------------------------------------------------------------------------------ | ---------------------------- | ---------------------------- | ------------------------------------------ |
| [W01 Closable item-set extension](tasks/W01-closable-item-set-extension.md)                            | None                         | ui / implementer-ui          | Ready for execution as planning assessment |
| [W02 Secondary root-tab state](tasks/W02-secondary-root-tab-state.md)                                  | W01                          | ui / implementer-ui          | Planned, dependent                         |
| [W03 Tab strip composition](tasks/W03-tab-strip-composition.md)                                        | W02                          | ui / implementer-ui          | Planned, dependent                         |
| [W04 Dynamic split resolver](tasks/W04-dynamic-split-resolver.md)                                      | W02                          | ui / implementer-ui          | Planned, dependent                         |
| [W05 Accessible splitter](tasks/W05-accessible-splitter.md)                                            | W04                          | ui / implementer-ui          | Planned, dependent                         |
| [W06 Side swap](tasks/W06-side-swap.md)                                                                | W04                          | ui / implementer-ui          | Planned, dependent                         |
| [W07 Verification and consumer-compatibility audit](tasks/W07-verification-and-compatibility-audit.md) | W01, W02, W03, W04, W05, W06 | integration / implementer-ui | Planned, dependent                         |

Profiles mean `nevo-agents:implementer-ui`. Independent review uses `nevo-agents:reviewer`.
These are planning metadata, not invented workflow manifest keys.

`W01 -> W02 -> (W03, W04) -> (W05, W06) -> W07` is acyclic. `W03` and `W04` are the only
parallel-safe pair after `W02` (independent files: `ItemTabs`/header composition vs.
`workspaceSizing.ts`). `W05`/`W06` are parallel-safe after `W04` for the same reason (a new
component vs. existing layout-order wiring), but both must land before `W07`'s end-to-end
contract stories can pass.

## Review and verification

Independent review gates: after W02 (the root-tab state generalization — highest risk, touches
`WorkspaceContext`'s close semantics), after W04 (the sizing resolver — must be provably free of
any active-content input per the contract's §6 non-goals), and at W07 (whole plan). Stop
dependent work at a failed gate. Each task reports changed owners, PASS/FAIL/SKIP, and any
intentional deviation from the contract (which must then update the contract document, not just
the task). Source-owned tests/stories stay co-located in `packages/nevo-ui/src/app/workspace/`
and `packages/nevo-ui/src/components/navigation/ItemTabs/`, matching existing file placement.

## Out of scope for this plan

No changes to `packages/specflow-ui` (Full Session or any other consumer adopts this separately);
no new product/UX decision (anything not already decided by the contract document stops and
returns to Spec Writer/UX, it is not decided inside a task); no persistence of manual
ratio/side across a reload (explicitly left open by the contract, section 6); no exact breakpoint
retuning beyond what each task's acceptance requires.

## Exit and cleanup

All of W01-W07's acceptance scenarios must pass, including the full transition table in the
contract's §5, before
[the composition-gaps analysis §5.4](../../../specflow-ui/design-system-component-composition-gaps.md#54-p1--workspace-v2-dynamic-automanual-split-and-tab-root-ownership-new)
and the contract document's own status line are promoted from "specified, implementation pending"
to "implemented." After promotion, retire this worklist and keep its stable task IDs referenced
from the contract document's §9 until independent review closes them.
