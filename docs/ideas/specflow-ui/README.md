---
id: ideas.specflow-ui
type: hub
title: SpecFlow UI product ideas
status: draft
scope: specflow
areas:
  - ui
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

Like the rest of `docs/ideas/**`, this package is opt-in context. Default agent context discovery
must not treat it as authoritative implementation guidance; load it deliberately when evaluating or
migrating the proposals captured here.

The immediate goal is not to design final screens. It is to inventory product concepts,
relationships, human decisions, runtime state, artifacts, and navigation depth before selecting
exact layouts and components.

The package deliberately distinguishes:

- current authoritative contracts already present in Nevo SpecFlow;
- deterministic behavior observed in the old `dczerwinskipl/nevo` repository and worth evaluating
  during migration;
- product direction agreed during UI design;
- future candidates that should not become implementation requirements yet;
- unresolved questions that need owner clarification instead of an inferred answer.

## Workflow migration boundary

The old `dczerwinskipl/nevo` product contains **two workflow paths**: the older legacy flow and the
newer deterministic flow.

Nevo SpecFlow does **not** migrate that dual-mode product model. The target product has one workflow
model: **deterministic workflow**.

Therefore:

- old-repository APIs/infrastructure may be migration evidence where they are generic and still
  useful;
- workflow semantics are taken only from the old repository's deterministic flow;
- old legacy lifecycle/status behavior is not a compatibility target;
- do not add a Legacy/Deterministic selector, `workflowMode` product preference, or per-Spec mode
  switch to the new UI;
- when an old endpoint contains a mode field for compatibility, the new contract should normally
  remove that choice or resolve it internally to deterministic behavior.

## Current working documents

- [Information and navigation inventory](information-and-navigation-inventory.md)
- [Navigation and route model](navigation-and-route-model.md)
- [Specification and Task information hierarchy](spec-task-information-hierarchy.md)
- [Specification and Task screen structure](spec-task-screen-structure.md)
- [Full Session screen structure](full-session-screen-structure.md)
- [Session Chat V10 — accepted UX direction and implementation boundary](components/session-chat-v10-design.md)
- [Session Composer capability proposal and adapter gaps](components/session-composer-design.md)
- [Accepted Session Workspace V2 examples — desktop](examples/session-workspace-v2/desktop.html)
- [Accepted Session Workspace V2 examples — mobile](examples/session-workspace-v2/mobile.html)
- [Accepted Session Chat V10 mock — desktop](examples/session-chat-v10/desktop.html)
- [Accepted Session Chat V10 mock — mobile](examples/session-chat-v10/mobile.html)
- [Design-system and composition gaps](design-system-component-composition-gaps.md)
- [Storybook Rework — component-first catalog, story profiles, and agent/CI safeguards](storybook-rework.md)
- [Storybook Rework — dated inventory and repeatable migration audit](storybook-rework-inventory.md)
- [Data loading, refresh, batching, and eventing](data-loading-refresh-and-eventing.md)
- [Screen specifications index](screens/README.md)
- [Large UI component specifications](components/README.md)

Workspace V2 layout/navigation and Session Chat V10 conversation/composer/Work inspection
are now **accepted UX directions**, but their standalone HTML remains illustrative,
synthetic and **not production code or API evidence**. Exact visual styling, Context body,
provider-specific capability fixtures, and notably **mobile Composer iconography** (unclear
square/diamond symbols and toolbar overflow) are **not accepted**. Use Nevo UI Design
System components and icons, not the mock's CSS/SVGs. See the V10 design document for
the dynamic auto/manual split contract and outstanding shared Design System gap.

## Related idea package

File inspection and full-IDE behavior are already explored under
[Developer workspace ideas](../developer-workspace/README.md). The UI inventory references that
capability rather than duplicating its filesystem/editor design.
