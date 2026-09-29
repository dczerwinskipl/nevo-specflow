---
id: product.specflow.ui.application-architecture
type: architecture
title: SpecFlow UI application architecture
status: current
read_when:
  - adding a SpecFlow UI screen or route
  - deciding whether UI code belongs in the product app or Nevo UI
  - changing the product shell or brand composition
summary: >
  The SpecFlow UI composition root, routing and screen ownership, reusable Nevo UI
  boundary, and the intentionally minimal foundation screens.
related:
  - design-system.principles.system-boundary
  - design-system.implementation.ownership-and-tooling
  - product.specflow.ui.interaction-model
---

# SpecFlow UI application architecture

`apps/specflow-ui/` is the product application and composition root. It owns SpecFlow copy, brand
assembly, routing, screens, and product-specific interaction decisions. It consumes reusable
mechanics from `@nevo/ui`.

## Runtime composition

`src/app/router.tsx` owns the TanStack Router tree. The root renders `SpecFlowShell`, with:

- `/` for the foundation home screen;
- `/ui-playground` for a product-owned component/workspace integration screen.

Product screens compose `AppWorkspaceSlots`, `WorkspaceHeader`, and `AppContent` from Nevo UI.
Nevo UI owns those reusable layout mechanics but knows nothing about routes, SpecFlow navigation,
or product data.

The current screens are deliberately a working foundation, not a simulated legacy application.
They provide real navigation and responsive composition without inventing domain state that the
Runtime does not expose yet.

## Brand and tokens

The Nevo product-brand adapter lives under `src/brand/nevo/`. Shared semantic tokens remain owned
by Nevo UI; the application owns only the SpecFlow lockup, palette mapping, and product-specific
Figma resources.

## Interaction and accessibility

Navigation uses real links and router state. Interactive controls use semantic elements, visible
focus treatment, keyboard behavior, and accessible labels from Nevo UI contracts. Screen changes
MUST be reviewed at desktop and mobile widths and represented in the shared Storybook when a stable
screen state exists.
