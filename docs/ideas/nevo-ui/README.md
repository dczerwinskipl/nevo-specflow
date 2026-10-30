---
id: ideas.nevo-ui
type: hub
title: Nevo UI implementation ideas
status: draft
scope: nevo-ui
areas: [ui]
tags: [design-system, execution-plan]
read_when:
  - planning or picking up implementation work for a reusable Nevo UI capability
summary: >
  Non-authoritative implementation backlog for reusable Nevo UI (design-system) capabilities,
  separate from the SpecFlow product backlog under ideas/specflow-ui.
related:
  - ideas.readme
  - design-system.principles.system-boundary
---

# Nevo UI implementation ideas

This namespace mirrors `ideas/specflow-ui` for work whose ownership is the design system
(`packages/nevo-ui`), not the SpecFlow product. See [`ideas/README.md`](../README.md) for the
namespace's general rules: documents here are a proposal backlog, remain `status: draft`, and
become normative only once their conclusions are promoted into an authoritative
`design-system/` document.

## Current packages

- [Workspace dynamic split — Secondary root tabs and auto/manual sizing](execution-plans/01-workspace-dynamic-split/README.md),
  implementing
  [the decision-complete Design System contract](../../design-system/implementation/react/workspace-dynamic-split.md).
