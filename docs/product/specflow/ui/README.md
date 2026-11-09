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

| Doc                                                                | Covers                                                                                                                        |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| [Personas](personas.md)                                            | Who opens the UI and what they need.                                                                                          |
| [Interaction model](interaction-model.md)                          | Responsive shell, product hierarchy and routes, reachability, Session start and navigator, Back/Close, surface types.         |
| [Application architecture](application-architecture.md)            | Runtime composition, routing, ownership boundaries, and current foundation screens.                                           |
| [Data/loading/integration](data-loading-and-integration.md)        | Read-model coherence, API readiness, freshness, loading, refresh, batching, and failure ownership.                            |
| [AI-session UX](ai-session-ux.md)                                  | Turn state, Work information levels, commentary, live vs historical.                                                          |
| [Full Session](full-session.md)                                    | The Session screen: conversation, Work block and Work history, Composer and work modes, starting a Session, Context and tabs. |
| [Specifications list](specs-overview.md)                           | The list at `/`: Current sections or flat list, row anatomy, Archive, search, states.                                         |
| [Specification overview](specification-overview.md)                | Section order, one/two columns, focus across a crossing, Activity history, project-mode sources, Task selection.              |
| [Specification Sessions list](specification-sessions.md)           | A Specification's Sessions: the shared Session row, Current/Archive, Show more paging, states, freshness.                     |
| [Authentication recovery](authentication-recovery.md)              | How the UI recovers when the Runtime session expires or authentication fails.                                                 |
| [Documents editor mode](documents-editor-mode.md)                  | Documents with several open tabs, read-only tabs in a Session, tablet threshold.                                              |
| [Documents and Create with archetypes](documents-archetypes-ui.md) | Document types, unclassified/missing files, expected documents, Create archetype, tab states.                                 |
| [App Shell geometry decisions](shell-geometry.md)                  | Focused frame and Workspace modes, two-column Create and Overview, rejected alternatives, open UX findings.                   |
