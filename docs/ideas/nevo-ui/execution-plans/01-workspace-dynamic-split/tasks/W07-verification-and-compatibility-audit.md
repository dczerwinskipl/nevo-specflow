---
id: ideas.nevo-ui.execution-plans.plan-01.task-07
type: engineering
title: 'W07 — Verification and consumer-compatibility audit'
status: draft
scope: nevo-ui
areas: [ui, testing]
tags: [execution-task, temporary, implementation]
read_when:
  - implementing W07 for the workspace dynamic split plan
summary: >
  Dependency-complete acceptance task proving the full §5 transition table end-to-end, auditing
  the recorded consumer-compatibility consequences, and promoting the contract/gaps-doc status.
related:
  - ideas.nevo-ui.execution-plans.plan-01
  - design-system.implementation.react.workspace-dynamic-split
  - ideas.specflow-ui.design-system-component-composition-gaps
---

# W07 — Verification and consumer-compatibility audit

Temporary implementation task for [Plan 01](../README.md). The parent plan owns sequencing and
independent review gates. This is the plan's whole-delivery acceptance gate.

## Goal and ownership

Prove the complete auto/manual transition table end-to-end across W01-W06's combined
implementation, **re-confirm** (without modifying) every `packages/specflow-ui` consumer of
`open()`/`openTab()` — found by re-scanning the package for the pattern at audit time, not by
trusting any fixed file list recorded earlier — and promote the contract document's and the
composition-gaps analysis's status lines from "specified, implementation pending" to "implemented"
once everything passes.

**Revised 2026-10-30 after external review (Finding 3):** this task is no longer the _first_ line
of defense against a consumer regression — W02 already performed this audit as its own exit
criterion once the contract's §4.1 `open`/`openTab` split made `open` behavior-unchanged (contract
§8, §9 item 3). This task's audit is now a **re-confirmation at the end of the whole plan**
(catching any regression introduced by W03-W06, or any consumer added or changed in the interim),
not the first discovery of whether `open`'s generalization was safe. It additionally surfaces,
without acting on them, any consumer that might benefit from migrating to the new `openTab` for a
genuinely new multi-tab capability (a product decision for the feature owner).

**Known at audit time (do not treat as exhaustive):** confirmed-compatible as of this contract
revision (2026-10-30): `packages/specflow-ui/src/features/sessions/managed/ManagedSession.tsx`,
`.../sessions/context/SessionContextPanel.tsx`,
`.../sessions/managed/context/SessionTasksInspector.tsx` (added 2026-10-30, two fixed stack ids
opened via `navigation.open` purely to land on a different initial page), and
`.../tasks/workspace/TaskWorkspace.tsx`'s `taskWorkspaceMaterialStack`/`taskWorkspaceHistoryStack`
usage (found during this same revision's code review). The contract's §8 and this task's
acceptance below are updated accordingly; re-scan regardless, since more may land before W07
executes, and W02's audit result should not simply be copied forward unverified.

- Kind/profile: integration / nevo-agents:implementer-ui.
- Owner paths: `packages/nevo-ui/src/app/workspace/**` (new end-to-end contract stories only,
  no new production code expected at this stage beyond fixing integration gaps W01-W06's own
  review surfaces), `docs/design-system/implementation/react/workspace-dynamic-split.md` (status
  line only), `docs/ideas/specflow-ui/design-system-component-composition-gaps.md` (§5.4 status
  line only).
- Prerequisites: W01, W02, W03, W04, W05, W06.
- Minimal context: the contract document in full; the consumer files named in its §8, plus a fresh
  re-scan of `packages/specflow-ui` for the same `open()` pattern before relying on that list.
- Acceptance coverage: workspace-dynamic-split.md's entire §5 table as one connected scenario per
  row sequence (not isolated unit assertions); §8 in full.

## Authoritative design entry points

- [Workspace dynamic split contract](../../../../../design-system/implementation/react/workspace-dynamic-split.md) —
  owns every behavior this task verifies; this task does not reinterpret or extend it.
- [Composition-gaps §5.4/§6.2](../../../../specflow-ui/design-system-component-composition-gaps.md#54-p1--workspace-v2-dynamic-automanual-split-and-tab-root-ownership-new) —
  the status line this task is authorized to update, and only after the acceptance below passes.

## Acceptance

- One or more Storybook contract stories exercise the full accepted sequence from V10 §7.2 as a
  single connected scenario: enter split with only one tab open (the pinned one, or — in a
  workspace with none, contract §4.1/§9 item 2 — the sole `open`/`openTab` tab) (narrow) -> open a
  second root tab via `openTab` (auto 50/50) -> switch tabs (no resize) -> open a dependent detail
  inside a tab's local stack (no resize) -> drag the splitter (manual wins) -> open/close further
  tabs (manual preserved) -> swap sides (everything preserved) -> close Secondary -> reopen
  (restored) -> shrink width below the dynamic minimums (falls back to existing stacked/narrow) ->
  widen back (restores clamped ratio). Include one story with no `AppWorkspace.Secondary` declared
  at all, driven purely by `open`/`openTab`, to prove contract §4.1/§9 item 2's optional-pinned-tab
  case renders and tears down correctly (Secondary absent when the last tab closes).
- Every row of the contract's §5 table is traceable to a passing test or story from W01-W06 or
  this task; any row without coverage is a blocking gap, not a note for later.
- Every `packages/specflow-ui` consumer of `open()`/`openTab()` — found by re-scanning the package
  (grep for `navigation.open`/`navigation.openTab`/`defineSecondaryStack` fixed-id usage), not just
  the files already confirmed in the contract's §8 as of this revision (`ManagedSession.tsx`,
  `SessionContextPanel.tsx`, `SessionTasksInspector.tsx`, `TaskWorkspace.tsx`) — is re-inspected
  against the (unchanged) `open` semantics and the (new, opt-in) `openTab` semantics, and the
  actual outcome (behavior-compatible vs. behavior-changed vs. an `openTab`-migration candidate
  worth flagging to the feature owner) is recorded factually per file; this task does not modify
  any of them — a behavior change found here is reported to the feature owner as follow-up, not
  silently fixed. This re-confirms W02's own exit-criterion audit rather than performing it for the
  first time (Finding 3) — report explicitly whether this audit's result matches W02's.
- `useOpenedItems`/`ItemTabs` existing (pre-W01) Storybook/unit suites still pass unmodified.
- Only after the above passes: update the contract document's §1 status line and the
  composition-gaps document's §5.4 status line from "specified, implementation pending" to
  "implemented," each with a one-line pointer to this task as the closing evidence.

## Verification and review

Run the full `packages/nevo-ui` test/Storybook suite, not just this plan's new files, to catch any
regression in unrelated `AppWorkspace`/`ItemTabs` consumers. Report actual PASS/FAIL/SKIP per row
of the contract's table, the consumer-compatibility audit's factual finding for each of the two
named files, and any intentional deviation from the contract discovered during end-to-end testing
(which must be reconciled with the contract document before this task closes, not papered over).

Independent review (`nevo-agents:reviewer`) at this task's gate is the plan's whole-delivery
review; a failed gate blocks promoting either status line and blocks any dependent product work
(for example a Full Session redesign) from treating this capability as available. Because W02
already gated on the consumer audit, a failure here specifically on the audit (as opposed to the
transition-table coverage) indicates either a regression introduced by W03-W06 or a new consumer
added since W02 — treat it with the same severity as a transition-table failure, not as a lesser
finding.

## Out of scope

No implementation fixes beyond what W01-W06's own review surfaces call for (if a material gap is
found here, it returns to the relevant W0N task or, if it reveals a wrong product-level
assumption, to Spec Writer/UX — this task does not redesign behavior to make a story pass); no
changes to `packages/specflow-ui`; no new product consumer of this capability (Full Session
adoption is separate, later work, as stated in the plan's README and the top-level task that
produced this contract).
