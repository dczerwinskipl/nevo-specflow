---
id: ideas.specflow-ui.storybook-rework
type: engineering
title: Storybook rework — open follow-ups
status: draft
scope: specflow
areas: [ui, testing, docs]
tags: [storybook, design-system, components, testing, agents]
read_when:
  - planning a Storybook catalog clean-up or a story-policy check
  - retitling stories that break the Storybook tree-depth rule
  - deciding which SpecFlow components still need a focused component story
summary: >
  What is still open after the Storybook guideline change: a lightweight automated policy check,
  stories whose titles break the tree-depth rule, omnibus story files, component-story coverage
  gaps and the decisions not yet taken.
related:
  - ideas.specflow-ui
  - design-system.implementation.storybook.guidelines
  - engineering.shared.testing
---

# Storybook rework — open follow-ups

The authoritative rules are the [Storybook guidelines](../../design-system/implementation/storybook/guidelines.md)
(one level per subject, one visible `Default` per SpecFlow subject, hidden profile tags, no
omnibus story files). This note lists only what the code does not yet follow and what is not yet
decided. It is not a delivery authorization.

## 1. Titles that break the depth rule

The guidelines allow `Nevo UI/<Category>/<Component>` and `SpecFlow/<Brand|Components|Features|Screens>/<Subject>`
with no further level. Stories that do not follow it today (checked 2026-11-09):

| Title                                                                                                                  | File                                                                         |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `Nevo UI/Actions/Button/Label overflow`                                                                                | `nevo-ui/src/components/actions/Button/Button.contract.stories.tsx`          |
| `Nevo UI/Content/InformationList/Design Capture`                                                                       | `InformationList/InformationList.capture.stories.tsx`                        |
| `Nevo UI/Data/DataTable/Design Capture`                                                                                | `DataTable/DataTable.capture.stories.tsx`                                    |
| `Nevo UI/Data/Timeline/Design Capture`                                                                                 | `content/Timeline/Timeline.capture.stories.tsx`                              |
| `Nevo UI/Forms/Combobox/Contract`                                                                                      | `Combobox/Combobox.contract.stories.tsx`                                     |
| `Nevo UI/Forms/DateTime/{DatePicker, DateRangePicker, DateTimePicker, TimePicker, Overview}`                           | `forms/DateTime/**.stories.tsx`                                              |
| `Nevo UI/Internal/DateTime/{Overview capture, Radix compatibility}`                                                    | `DateTimePickersOverview.capture`, `DateTime.integration`                    |
| `Nevo UI/Internal/Workspace/{Dynamic split, Navigation contracts, Splitter}`                                           | `app/workspace/*.stories.tsx`                                                |
| `Nevo UI/Layout/Workspace/{Fit, Secondary local navigation}`                                                           | `AppWorkspaceFit.contract`, `SecondaryLocalNavigation.contract`              |
| `SpecFlow/Components/Work Inspector/{Bounded older load, Older page anchoring, Reading position, Tool group identity}` | `features/sessions/managed/WorkInspector.*.stories.tsx`                      |
| `SpecFlow/Screens/Specification Workspace/Overview columns`                                                            | `features/specs/workspace/SpecificationOverviewColumns.contract.stories.tsx` |

Non-canonical categories: `SpecFlow/Sessions/{Interaction Permission, Session Telemetry}` (should
be `SpecFlow/Components/…`); `Nevo UI/Design System/Hit area`; and Workspace stories split
between `Nevo UI/Workspace/*` and `Nevo UI/Layout/Workspace*`, which should become one category.

A contract or capture file of a subject shares that subject's title and is hidden by its profile
tag; it does not need its own sidebar level. Retitling changes story IDs, so check Chromatic
baselines and test references first.

## 2. Omnibus story files

`packages/specflow-ui/src/app/contracts/` holds `ConnectedConsistency.stories.tsx` (about 1,370
lines), `ConsistencyBaseline.stories.tsx`, `OwnerV5After.stories.tsx` and
`OwnerV5Review.stories.tsx`, all titled `SpecFlow/Screens/Application Shell` and not beside a
component. Each scenario should move to the owner it exercises, or the owner-review files should
be retired once their screens are verified.

## 3. Component-story coverage gaps

Several product components are covered only inside a full screen story. Examples without their own
story (2026-11-09): Session `WorkBlock`, `ToolActionHeader`/`ToolActionDetails`, `UnknownTurnNotice`,
`ArchivedSessionBar`, `ViewOnlySessionBar`, `SessionActionDialogs`; Task detail parts
(`TaskHistory`, `TaskStepInspection`, `TaskReferenceAvailability`); Documents explorer tree rows
(`DocumentNode`, `DocumentNodeMenu`, `TreeFilterBar`) and type dialogs. For each, decide first
whether a component story is useful at that boundary; never add a public export only for Storybook.

## 4. Lightweight automated guardrail (proposed)

A Storybook policy check on changed story files, reading the built story index (not regex):

- **Blocking, once validated:** a new title outside the canonical depth/categories without an
  accepted exception; duplicate title/story IDs; invalid tag combinations (a contract, integration
  or capture story inheriting `visual`); an assertion-bearing `play` on a capture or visual story;
  a production import of a Storybook-only module.
- **Advisory:** a new SpecFlow subject without a visible `Default`; many visible exports that
  differ only in args or viewport; a changed product component with no focused story.
- Never fail on file length, export count or missing `argTypes`. Use a baseline/ratchet: existing
  violations (§1, §2) are listed, new ones are reported in the PR, accepted exceptions carry a
  reason. The checker has tests for valid exceptions and real violations, and it runs without a
  full browser pass.

## 5. Decisions still to make

1. Which SpecFlow boundaries deserve component stories (start with Sessions, Tasks, Documents).
2. Which accepted Chromatic baselines depend on story IDs that §1 would change.
3. Which violations get an immediate blocking check and which a ratcheted warning.
4. Whether owner-review mocks (`OwnerV5*`, `(mock)` screens) stay as hidden captures or are retired.
5. Whether the story inventory is a CI artifact, an on-demand report, or both.
