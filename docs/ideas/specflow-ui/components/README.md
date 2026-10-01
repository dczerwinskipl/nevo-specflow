---
id: ideas.specflow-ui.components
type: hub
title: SpecFlow UI large component specifications
status: draft
scope: specflow
areas:
  - ui
  - product
tags:
  - components
  - compositions
  - storybook
  - figma
read_when:
  - implementing or visually reviewing a large SpecFlow product composition
  - creating Storybook/Figma state fixtures for Session, Task, or steering UI
summary: >
  Index of large product-owned UI compositions whose internal states need more precision than
  a screen-level spec. These docs define canonical input payloads, grouping/presentation rules,
  state mocks, component ownership, data loading, and visual behavior.
related:
  - ideas.specflow-ui.screens
  - ideas.specflow-ui.data-loading-refresh-and-eventing
  - design-system.principles.layout-and-containment
---

# SpecFlow UI large component specifications

## Why this layer exists

Screen specs define where a large UI element appears and what job it performs.

Some product compositions contain enough state and presentation logic that they need a deeper
contract before Storybook/Figma can validate them.

Examples:

- Session conversation with Commentary, current activity, Work summaries and interactions;
- full Work history and ToolAction detail;
- Task decision/evidence;
- Spec steering rows with several simultaneous signals.

These are **product-owned compositions first**. A document here does not automatically mean a new
generic Nevo UI component.

## Shared rules

Every large component spec inherits:

- [Screen specifications](../screens/README.md);
- [Data loading, refresh, batching, and eventing](../data-loading-refresh-and-eventing.md);
- [Layout and containment](../../../design-system/principles/layout-and-containment.md);
- [AI Session UX](../../../product/specflow/ui/ai-session-ux.md) when Session-related;
- [Canonical Session / Turn / Work](../../../architecture/ai/canonical-session-turn-work.md) when Session-related.

Each state/example SHOULD include:

1. canonical/product payload excerpt;
2. compact ASCII presentation;
3. component ownership;
4. grouping/collapse behavior;
5. loading/live-update implications;
6. Storybook/Figma fixture name.

Do not create visual fixtures from hand-wavy labels without a corresponding state payload.

## Index

| Large composition | Responsibility | Status |
| --- | --- | --- |
| Session conversation | User/assistant conversation, Commentary, compact Work summary, current activity, interaction, composer. | [Session conversation UI spec](session-conversation-ui-spec.md) |
| Session Work inspector | Expanded Work timeline, individual Work item and ToolAction detail, every tool kind. | [Session Work inspector UI spec](session-work-inspector-ui-spec.md) |
| Task decision/evidence | Task state + reason + evidence + action. | [Task decision/evidence UI spec](task-decision-evidence-ui-spec.md) |
| Spec steering item/collection | Attention/ready/working/issue summaries and direct context targets. | [Spec steering UI spec](spec-steering-ui-spec.md) |
| Settings catalog renderer | Dynamic backend-owned Settings descriptors -> linear Settings UI. | [Settings catalog renderer UI spec](settings-catalog-renderer-ui-spec.md) |
| File/diff inspector | File preview, diff inspection, IDE escalation. | Deferred to developer-workspace capability |
