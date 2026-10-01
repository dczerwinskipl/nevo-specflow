---
id: ideas.specflow-ui.screens
type: hub
title: SpecFlow UI screen specifications
status: draft
scope: specflow
areas:
  - ui
tags:
  - screens
  - ui-spec
  - interaction
  - implementation-contract
read_when:
  - implementing or reviewing a large SpecFlow UI screen
  - locating the owner document for a concrete user interaction
  - deciding which shared UI/product rules a screen inherits
summary: >
  Index of vertical SpecFlow UI screen specifications. Screen specs translate shared
  product and design-system rules into concrete use cases, anatomy, interactions,
  responsive behavior, component usage, token roles, states, and acceptance scenarios.
related:
  - ideas.specflow-ui
  - product.specflow.ui.interaction-model
  - design-system.principles.ui-ux-guidelines
  - design-system.principles.layout-and-containment
---

# SpecFlow UI screen specifications

## Purpose

The documents in this directory are vertical UI specs.

Shared documents answer questions such as:

- what Primary/Secondary means;
- how navigation behaves responsively;
- what Session/Turn/Work means;
- how human attention differs from readiness;
- how containment, typography, colour, and component ownership work.

A screen spec answers:

> Given those shared rules, exactly how does this product screen behave?

For complex product-owned compositions whose internal states need deeper payload-level detail, see
[Large UI component specifications](../components/README.md).

Screen specs should reference shared rules instead of copying them. If a shared rule changes, update
the shared document and only update screen specs whose local behavior actually changes.

These documents are still under docs/ideas, so they are working product proposals until promoted
into authoritative product documentation.

## Shared contracts every screen inherits

Read the relevant subset rather than duplicating it:

- [UI interaction model](../../../product/specflow/ui/interaction-model.md) — global hierarchy,
  Primary/Secondary, responsive shell, Back, context preservation.
- [UI/UX engineering guidelines](../../../design-system/principles/ui-ux-guidelines.md) —
  information hierarchy, semantic typography/colour, progressive disclosure, responsive hierarchy.
- [Layout and containment guidelines](../../../design-system/principles/layout-and-containment.md) —
  borderless-first composition, Card rules, list/row treatment, host/nesting rules.
- [Nevo UI system boundary](../../../design-system/principles/system-boundary.md) — reusable
  design-system behavior versus product-owned composition.
- [React component guidelines](../../../design-system/implementation/react/component-guidelines.md) —
  feature-local composition, view models, state ownership.
- [Tailwind styling guidelines](../../../design-system/implementation/tailwind/styling-guidelines.md) —
  semantic tone and styling ownership.
- [SpecFlow information/navigation inventory](../information-and-navigation-inventory.md) — product
  concepts, ownership, configuration/runtime/action separation.
- [Runtime ownership and lifecycle](../../../architecture/runtime/ownership-and-lifecycle.md) —
  application/backend ownership and transport-adapter boundary.
- [Repository tooling is separate from the product API](../../../architecture/decisions/0005-repository-tooling-is-separate-from-the-product-api.md) —
  legacy/internal tooling is evidence, not an implicit product contract.
- [Design-system and composition gaps](../design-system-component-composition-gaps.md) — currently
  available primitives and known capability gaps.
- [Data loading, refresh, batching, and eventing](../data-loading-refresh-and-eventing.md) —
  query boundaries, revisions, event coalescing, batch reads/commands, invalidation and Refresh semantics.

Session screens additionally inherit
[AI Session UX](../../../product/specflow/ui/ai-session-ux.md) and
[Full Session screen structure](../full-session-screen-structure.md).

Specification/Task screens additionally inherit
[Specification and Task information hierarchy](../spec-task-information-hierarchy.md) and
[Specification and Task screen structure](../spec-task-screen-structure.md).

## API status vocabulary

Every screen spec uses the same status vocabulary for required backend/application capabilities:

- **existing-new** — already implemented as a product API/read model in current `nevo-specflow`;
- **old-repo-available** — implemented in the old `dczerwinskipl/nevo` repository and useful as migration evidence;
- **missing** — the required new-product capability/read model does not exist yet and the screen spec
  must propose its minimal semantic contract.

An old-repo endpoint may be reused conceptually or even structurally, but it does not become the new
product contract automatically.

Important migration boundary: the old `dczerwinskipl/nevo` repository contains both legacy and
deterministic workflows. New Nevo SpecFlow is **deterministic-only**. `old-repo-available` in these
tables means "available in the old repository as migration evidence"; it never means the old legacy
workflow mode should remain supported. Workflow semantics must come from the deterministic path.

The current `@nevo/specflow-runtime` is still a bootstrap proof, so current screen specs may
legitimately have no `existing-new` API yet.

## Screen ownership index

| Screen / large surface | Responsibility                                                                                    | Spec                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Specs overview         | Cross-Spec steering: attention, ready work, current work, archive entry.                          | [Specs Overview UI spec](specs-overview-ui-spec.md)         |
| Specification          | One Specification: workflow meaning, Task collection/bulk actions, Sessions, supporting evidence. | [Specification UI spec](specification-workspace-ui-spec.md) |
| Task detail            | One Task: decision state, intent, evidence, deterministic actions, related Session history.       | [Task Detail UI spec](task-detail-ui-spec.md)               |
| Full Session           | Conversation/current work Primary with default Context and user-selected detail Secondary.        | [Full Session UI spec](full-session-ui-spec.md)             |
| Floating Session       | Wide-only quick Session interaction without abandoning current Spec/Task context.                 | [Floating Session UI spec](floating-session-ui-spec.md)     |
| Project Settings       | Project configuration, AI/agent policy, workflows, repository/Git, integrations.                  | [Project Settings UI spec](project-settings-ui-spec.md)     |

Do not create a separate screen spec merely because a backend entity exists. A screen earns a spec
when it is a meaningful user surface with its own interaction and information hierarchy.

## Expected screen-spec structure

Use this as a guide, not as ceremony. Omit sections that genuinely do not apply.

1. Purpose and ownership.
2. User use cases.
3. Entry points, navigation, return/deep-link behavior.
4. Data source / read-model ownership — where the screen gets its data and what the UI may derive.
5. API availability / migration status — mark every required read/write capability as
   `existing-new`, `old-repo-available`, or `missing`; for `missing`, include a concise proposed
   API/read-model shape and behavior.
6. Information hierarchy.
7. Pseudo-layout — at least one ASCII sketch of the main composition.
8. Screen anatomy.
9. Responsive contract.
10. Interaction flows.
11. States.
12. Component/composition map.
13. Visual/token contract.
14. Local containment rules.
15. Accessibility/focus/keyboard behavior.
16. Data/read-model requirements.
17. Storybook scenarios and acceptance criteria.
18. Open questions/deferred decisions.

The spec should be concrete enough that implementation does not need to rediscover the UX in
Storybook, while still avoiding invented backend contracts or premature reusable components.

## Screen-spec design rules

- Describe behavior from concrete user use cases, not from backend entities.
- State explicitly where screen data comes from: backend/application read model, route data, runtime
  projection, local UI state, or another authoritative source.
- For every required model/capability, state whether the current new product API already exists,
  whether the old repository has an equivalent/partial API, or whether a new API must be added.
- An old-repo endpoint is migration evidence, not automatically the new product contract. When the new
  screen needs a different projection, say what should be preserved and propose the new read model.
- Proposed product HTTP/realtime routes are adapters over Runtime/application capabilities; do not
  make the transport the owner of workflow/session/configuration semantics.
- Do not let the frontend invent a parallel registry of domain data that belongs to the
  backend/application contract.
- Include at least one ASCII pseudo-layout so the intended information hierarchy can be reviewed
  before visual implementation.
- Say what changes after a click and which context remains visible.
- Distinguish navigation from mutation. Opening context must not accidentally perform a workflow action.
- Name the existing Nevo UI primitive when a screen intentionally uses one.
- Name product-owned compositions as product concepts, not as proposed generic design-system components.
- Use semantic token roles; never freeze raw hex values in a screen spec.
- Do not repeat global Primary/Secondary, Card, colour, or component-boundary rules unless the screen
  has a stricter local constraint or a deliberate exception.
- Prefer list/row, typography, spacing, and separators over Card surfaces.
- If a Card/surface is explicitly required, state why it earns containment.
- Never introduce Card nesting merely to make the layout look more structured.
- Storybook scenarios should exercise the screen-level states and interaction flows, not just
  isolated primitives.
- Every proposed read model must document enough fields to render all states described by the screen.
  Mark fields that already exist in legacy projections, fields that need semantic reinterpretation,
  and fields that are genuinely new.
- Prefer extensible semantic descriptors over hard-coded frontend registries, but adding a new
  semantic discriminator/value kind may still require a frontend renderer; extensibility must not be
  confused with arbitrary backend-driven UI.
- Every screen must define Refresh scope and live/invalidation behavior by reference to the shared
  data-loading contract.
