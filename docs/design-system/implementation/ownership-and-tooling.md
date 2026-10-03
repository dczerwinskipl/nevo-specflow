---
id: design-system.implementation.ownership-and-tooling
type: architecture
title: UI ownership and tooling
status: current
read_when:
  - deciding where a UI component, screen, story, or Figma declaration belongs
  - changing the shared Storybook or Figma integration
  - adding an example application
summary: >
  Ownership map for reusable Nevo UI, SpecFlow product UI, independent examples,
  Storybook, and the code-to-Figma toolchain.
related:
  - design-system.principles.system-boundary
  - design-system.figma.code-to-figma-projection
  - design-system.implementation.library-packaging
  - design-system.implementation.storybook.guidelines
  - product.specflow.ui.application-architecture
---

# UI ownership and tooling

The repository separates reusable UI, product composition, examples, and projection tooling so
that each layer can evolve without importing a product back into its dependencies.

| Area                                           | Owner                   | Allowed dependencies                                |
| ---------------------------------------------- | ----------------------- | --------------------------------------------------- |
| Components, tokens, shell/workspace mechanics  | `packages/nevo-ui/`     | Neutral libraries and `packages/figma-core/`        |
| Figma authoring contracts and canonical IR     | `packages/figma-core/`  | No product or rendering package                     |
| SpecFlow brand, routing, features, and screens | `packages/specflow-ui/` | Nevo UI, shared SpecFlow contracts, neutral clients |
| CRM consumer example                           | `examples/crm/`         | Nevo UI and neutral Figma contracts                 |
| Shared component catalog                       | `tools/storybook/`      | Stories discovered from their owner packages        |
| Project capture composition                    | `tools/figma-project/`  | Owner declarations plus generic export/import tools |

Dependencies MUST point from product/example composition toward reusable packages. Nevo UI MUST NOT
import SpecFlow code, and independent examples MUST NOT use SpecFlow components or brand modules.

Stories and Figma declarations remain beside the code they describe. Tool packages compose or
transport those declarations; they MUST NOT become a second owner of component behavior.

Figma export roots are selected by explicit owner profiles. The shared Storybook/capture host may
discover stories from all owners, but discovery alone MUST NOT add a component or screen to any
owner's Figma export.

## Verification

Use the root commands so every owner is checked through the same entry point:

- `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build` for workspace health;
- `pnpm storybook:build` and `pnpm test:a11y` for the shared catalog;
- `pnpm figma:export` and `pnpm figma:build-plugin` for the projection pipeline.

Review affected composed screens at desktop and mobile width. An isolated component story is not
sufficient evidence for a product-level layout change.
