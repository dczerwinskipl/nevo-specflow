---
id: docs.product-specflow-ui-readme
type: hub
title: SpecFlow UI product documentation
status: current
summary: >
  The Nevo SpecFlow UI — who uses it, how navigation and surfaces behave, and how
  AI sessions are presented. React/Tailwind implementation guidance is under
  design-system/.
---

# SpecFlow UI product

Product behavior of the UI. How the UI is _built_ is under
[`../../../design-system/`](../../../design-system/) — keep implementation detail out of
these files.

| Doc                                                                            | Covers                                                                                                                        |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| [Personas](personas.md)                                                        | Who opens the UI and what they need.                                                                                          |
| [Interaction model](interaction-model.md)                                      | Responsive shell, product hierarchy and routes, reachability, Session start and navigator, Back/Close, surface types.         |
| [Application architecture](application-architecture.md)                        | Runtime composition, routing, ownership boundaries, and current foundation screens.                                           |
| [App composition details](../../../architecture/ui-application-composition.md) | Router, feature ownership, service injection, Query state and Runtime read integration.                                       |
| [Navigation and authentication](application-navigation-and-auth.md)            | Product routes, shell, login/recovery, localization and accessibility.                                                        |
| [Data/loading/integration](data-loading-and-integration.md)                    | Read-model coherence, API readiness, freshness, loading, refresh, batching, and failure ownership.                            |
| [AI-session UX](ai-session-ux.md)                                              | Turn state, Work information levels, commentary, live vs historical.                                                          |
| [Full Session](full-session.md)                                                | The Session screen: conversation, Work block and Work history, Composer and work modes, starting a Session, Context and tabs. |
| [Specifications list](specs-overview.md)                                       | The list at `/`: Current sections or flat list, row anatomy, Archive, search, states.                                         |
| [Specification overview](specification-overview.md)                            | Control center: section order, one/two columns, focus across a crossing, Activity history, project-mode sources.              |
| [Specification Tasks](specification-tasks.md)                                  | Task inventory, URL filters, paging, status and attention presentation.                                                       |
| [Manual workflow execution](workflow-execution.md)                             | Now block and its dialogs, exit gates, Task authoring on the Full Task page, lifecycle actions, Close and Abandon.            |
| [Specification Sessions list](specification-sessions.md)                       | A Specification's Sessions: the shared Session row, Current/Archive, Show more paging, states, freshness.                     |
| [Authentication recovery](authentication-recovery.md)                          | How the UI recovers when the Runtime session expires or authentication fails.                                                 |
| [Document tree](documents-tree.md)                                             | Registered, missing and unclassified document rows, requirements and errors.                                                  |
| [Create archetypes](create-archetypes.md)                                      | Archetype selection, defaults, catalogue and creation flow.                                                                   |
| [Documents cross-screen states](documents-cross-screen-states.md)              | State matrix, screen transitions and accessibility.                                                                           |
| [Documents editor mode](documents-editor-mode.md)                              | Documents with several open tabs, read-only tabs in a Session, tablet threshold.                                              |
| [Documents and Create with archetypes](documents-archetypes-ui.md)             | Document types, unclassified/missing files, expected documents, Create archetype, tab states.                                 |
| [Screen geometry contract map](shell-geometry.md)                              | Current owners for focused frames, workspace fit, Create, Overview and Full Session geometry.                                 |
| [Workflow and Task workbench contract map](workflow-workbench-decisions.md)    | Current owners for status, attention, Now, Task rows, document content state, Close and the demo.                             |
| [Reader navigation](documentation-reader-navigation.md)                        | Workspace/Specification selection, link and history routing.                                                                  |
| [Reader search](documentation-reader-search.md)                                | Search results, proposals, loading, empty states and explanations.                                                            |
| [Reader layout and states](documentation-reader-layout-and-states.md)          | Reader layout, article rendering, failure/keyboard states.                                                                    |
| [Documentation reader](documentation-reader.md)                                | Read-only reader of the project documentation per workspace: picker, tree, search, article, links, states.                    |
