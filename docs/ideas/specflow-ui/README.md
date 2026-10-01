---
id: ideas.specflow-ui
type: hub
title: SpecFlow UI product ideas
status: draft
scope: specflow
areas:
  - ui
  - product
  - workflow
tags:
  - information-architecture
  - human-steering
  - deterministic-workflow
  - artifacts
read_when:
  - designing SpecFlow product screens and navigation
  - deciding which deterministic workflow facts should be visible to a human
  - mapping specifications, tasks, sessions, artifacts, and human actions into UI surfaces
summary: >
  Non-authoritative UI/product inventory for turning deterministic SpecFlow state into a
  human steering surface without exposing legacy concepts or backend structure as navigation.
related:
  - ideas.readme
  - product.specflow.ui.interaction-model
  - product.specflow.ui.ai-session-ux
  - architecture.workflow.deterministic-workflow
  - architecture.ai.canonical-session-turn-work
  - ideas.developer-workspace
---

# SpecFlow UI product ideas

This package is the working area for the product information architecture of Nevo SpecFlow UI.

The immediate goal is not to design final screens. It is to inventory product concepts,
relationships, human decisions, runtime state, artifacts, and navigation depth before selecting
exact layouts and components.

The package deliberately distinguishes:

- current authoritative contracts already present in Nevo SpecFlow;
- deterministic behavior observed in legacy Nevo and worth evaluating during migration;
- product direction agreed during UI design;
- future candidates that should not become implementation requirements yet;
- unresolved questions that need owner clarification instead of an inferred answer.

## Current working documents

- [Information and navigation inventory](information-and-navigation-inventory.md)
- [Specification and Task information hierarchy](spec-task-information-hierarchy.md)
- [Specification and Task screen structure](spec-task-screen-structure.md)
- [Full Session screen structure](full-session-screen-structure.md)
- [Design-system and composition gaps](design-system-component-composition-gaps.md)
- [Data loading, refresh, batching, and eventing](data-loading-refresh-and-eventing.md)
- [Screen specifications index](screens/README.md)
- [Large component specifications](components/README.md)
- [Large UI component specifications](components/README.md)

## Related idea package

File inspection and full-IDE behavior are already explored under
[Developer workspace ideas](../developer-workspace/README.md). The UI inventory references that
capability rather than duplicating its filesystem/editor design.
