---
id: docs.design-system-react-readme
type: hub
title: React documentation
status: current
summary: >
  React implementation conventions — component composition, module organization, hooks,
  and state ownership.
---

# React

React implementation conventions for Nevo SpecFlow UI. Visual/design rules are in
[`../ui-ux-guidelines.md`](../../principles/ui-ux-guidelines.md); class-composition mechanics are in
[`../tailwind/`](../tailwind/).

| Doc                                                                   | Covers                                                                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [Component guidelines](component-guidelines.md)                       | Small focused components, composition over configuration, feature-local ownership, hooks, state placement, testing.    |
| [Feedback and content patterns](component-feedback-and-content.md)    | Initial appearance, status, empty states, alerts, and Markdown reading.                                                |
| [Input and overlay patterns](component-input-and-overlay-patterns.md) | Choices, fields, dialogs, drawers, menus, and viewport insets.                                                         |
| [Tree and scrolling patterns](component-tree-and-scrolling.md)        | Tree recipes, pane sizing, scroll ownership, and virtualized content.                                                  |
| [Component authoring contract](component-authoring-contract.md)       | Public API, refs, state, fields, localization, styling, accessibility, stories, tests, Figma, and the artifact matrix. |
| [Secondary navigation](secondary-navigation.md)                       | In-memory contextual screen stack, live data, Back/Close, guard and canonical React usage.                             |
| [Item tabs](item-tabs.md)                                             | ItemTabs strip, useOpenedItems and the content tabs host pattern (views, promoted actions, complete menu).             |
| [Workspace dynamic split](workspace-dynamic-split.md)                 | Secondary root tabs (pinned, `open`/`openTab`), auto/manual split, side swap and the accessible `WorkspaceSplitter`.   |
