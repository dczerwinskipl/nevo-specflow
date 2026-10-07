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

| Doc                                                         | Covers                                                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [Personas](personas.md)                                     | Who opens the UI and what they need.                                                               |
| [Interaction model](interaction-model.md)                   | Responsive shell, product hierarchy, navigation & state preservation, surface types.               |
| [Application architecture](application-architecture.md)     | Runtime composition, routing, ownership boundaries, and current foundation screens.                |
| [Data/loading/integration](data-loading-and-integration.md) | Read-model coherence, API readiness, freshness, loading, refresh, batching, and failure ownership. |
| [AI-session UX](ai-session-ux.md)                           | Turn state, Work information levels, commentary, live vs historical.                               |
