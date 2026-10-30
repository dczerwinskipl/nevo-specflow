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
implementation, audit (without modifying) every `packages/specflow-ui` consumer relying on today's
single-flow `open()` semantics — found by re-scanning the package for this pattern at audit time,
not by trusting the fixed two-file list the contract's §8 recorded when it was written — and
promote the contract document's and the composition-gaps analysis's status lines from "specified,
implementation pending" to "implemented" once everything passes.

**Known at audit time (do not treat as exhaustive):** an independent review of a parallel Full
Session redesign (2026-10-30) found a third consumer of the same pattern, added after the contract
was written — `packages/specflow-ui/src/features/sessions/managed/context/SessionTasksInspector.tsx`
(two fixed stack ids opened via `navigation.open` purely to land on a different initial page). The
contract's §8 and this task's acceptance below are updated accordingly; re-scan regardless, since
more may land before W07 executes.

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
  single connected scenario: enter split with only Context-equivalent pinned tab open (narrow) ->
  open a second root tab (auto 50/50) -> switch tabs (no resize) -> open a dependent detail inside
  a tab's local stack (no resize) -> drag the splitter (manual wins) -> open/close further tabs
  (manual preserved) -> swap sides (everything preserved) -> close Secondary -> reopen (restored)
  -> shrink width below the dynamic minimums (falls back to existing stacked/narrow) -> widen back
  (restores clamped ratio).
- Every row of the contract's §5 table is traceable to a passing test or story from W01-W06 or
  this task; any row without coverage is a blocking gap, not a note for later.
- Every `packages/specflow-ui` consumer of the single-flow `open()` pattern — found by re-scanning
  the package (grep for `navigation.open`/`defineSecondaryStack` fixed-id usage), not just the
  files already named in the contract's §8 (`ManagedSession.tsx`, `SessionContextPanel.tsx`,
  `context/SessionTasksInspector.tsx` as of 2026-10-30) — is inspected against the generalized
  `open` semantics and the actual outcome (behavior-compatible vs. behavior-changed) is recorded
  factually per file; this task does not modify any of them — a behavior change found here is
  reported to the feature owner as follow-up, not silently fixed.
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
(for example a Full Session redesign) from treating this capability as available.

## Out of scope

No implementation fixes beyond what W01-W06's own review surfaces call for (if a material gap is
found here, it returns to the relevant W0N task or, if it reveals a wrong product-level
assumption, to Spec Writer/UX — this task does not redesign behavior to make a story pass); no
changes to `packages/specflow-ui`; no new product consumer of this capability (Full Session
adoption is separate, later work, as stated in the plan's README and the top-level task that
produced this contract).
