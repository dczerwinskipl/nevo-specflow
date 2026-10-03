---
id: design-system.implementation.react.component-authoring-contract
type: engineering
title: Component authoring contract
status: current
read_when:
  - adding a reusable UI component or application-owned UI element
  - deciding which tests, stories, exports, or Figma artifacts a component needs
  - reviewing a component public API, state model, accessibility, or projection metadata
summary: >
  End-to-end authoring contract for component APIs, refs, state, fields, localization,
  styling, accessibility, Storybook, tests, Figma projection, and artifact completeness.
related:
  - design-system.implementation.react.component-guidelines
  - design-system.implementation.tailwind.styling-guidelines
  - design-system.implementation.storybook.guidelines
  - design-system.figma.code-to-figma-projection
  - design-system.principles.system-boundary
  - engineering.shared.testing
---

# Component authoring contract

Use this contract after choosing the correct owner and component boundary. It complements the
general React guidelines; it does not replace them.

## Public API and composition

- Expose product-neutral behavior from `@nevo/ui`. Product vocabulary, routing, data models, and
  application orchestration stay with the application.
- Prefer semantic props and compound composition over boolean configuration. Public `children`
  types MUST match what the implementation actually accepts.
- Forward a ref from an interactive or layout-significant public leaf to its meaningful DOM node.
  Compound roots and parts follow the same rule when consumers need focus, measurement, or
  composition. A purely structural helper MAY omit a ref when it has no stable node contract.
- Do not expose capture, Storybook, or Figma switches as normal runtime props. Tooling-specific
  transparency belongs in capture infrastructure.

## State and fields

- A stateful component that supports both modes uses the established `value`/`defaultValue` and
  `onChange` contract. Never switch ownership mode after mount or duplicate controlled state in an
  effect.
- Field controls integrate through the shared `Field` seam for ids, descriptions, disabled state,
  and validation relationships.
- Interpret `aria-invalid` through the shared invalid-state helper. Supported ARIA grammar and
  spelling values are one repository-wide contract, not control-local parsing rules.
- Keep navigation state separate from temporary presentation state. If an outgoing surface must
  remain visible during motion, retain a non-interactive presentation snapshot until semantic
  completion rather than delaying navigation with a timer.

## Copy and localization

Shared components MAY provide English defaults. Any user-facing or assistive copy generated inside
the component MUST be replaceable through a typed `labels` or `messages` seam. Do not introduce an
i18n framework solely to satisfy this seam, and do not require consumers to replace visible children
that they already own.

## Variants and styling

- A variant recipe describes authored visual axes such as size, tone, or emphasis. Hover, focus,
  pressed, open, and similar runtime interaction states remain CSS/state behavior unless they are an
  intentional exported representation axis.
- Merge consumer `className` with internal classes through `cn`. In a multi-slot component, document
  which public part receives each class and never silently replace the consumer class.
- Use semantic tokens and shared recipes. Import `@nevo/ui/styles.css` once at the application entry;
  it is the canonical compiled token, Tailwind utility, component-style, and global-base bundle.

## Accessibility and tests

- Start with semantic elements and the established accessible primitive. Keyboard operation, focus
  visibility, names, relationships, disabled/read-only behavior, and overlap inertness are part of
  the component contract.
- Unit-test repository-owned policy and state logic. Use Storybook interaction tests for meaningful
  interactive and accessibility-sensitive flows. Do not re-test the underlying framework.
- Behavior changes require characterization of the relevant existing observable contract before
  the intentional change. Visual or motion changes also require visual verification at affected
  viewports and reduced-motion verification where applicable.

## Storybook and Figma

- A reusable visual component normally has human-readable stories for review. Technical capture
  fixtures MAY be hidden from normal Storybook navigation.
- Story presence does not grant Figma ownership. The owning package or application explicitly lists
  export roots in a Figma export profile.
- A normal reusable visual component declares a typed Figma definition when the projection supports
  its representation. Tokens, typography, and icons MAY instead be design resources.
- Runtime-only/headless behavior MUST NOT invent a visual Figma component. Application screens and
  application-owned patterns are exported only from the owning application's profile.
- Machine identity (`component`, variant stable ID, resource reference, slot key, or nested `key`)
  MUST remain independent from human-facing `displayName`/layer names. Renaming a Figma layer MUST
  NOT change reconciliation identity. Important materialized layers SHOULD have semantic names;
  anonymous DOM tags are only a fallback for insignificant structure.

## Artifact completeness matrix

| Category                      | Implementation and public export        | Tests                                              | Storybook                      | Figma                                                             | Ownership note        |
| ----------------------------- | --------------------------------------- | -------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------- | --------------------- |
| Reusable visual component     | Required                                | Contract/state tests; interactions when meaningful | Required for review            | Component definition and owned capture root when representable    | `packages/nevo-ui/`   |
| Design resource               | Resource definition and typed reference | Identity/value validation                          | Optional documentation fixture | Resource catalog, not a duplicate component                       | Resource owner        |
| Runtime/headless utility      | Required when public                    | Behavior/policy tests                              | Optional                       | None                                                              | Closest neutral owner |
| Behavior-only helper          | Usually internal                        | Focused unit tests                                 | None                           | None                                                              | Beside its consumer   |
| Application component/pattern | Required within the app                 | App-owned behavior tests                           | Recommended                    | Optional explicit app root; shared dependencies stay dependencies | Application           |
| Application screen            | App composition                         | Critical flows/interactions                        | Required for review            | Optional explicit screen root                                     | Application           |

An omitted artifact is acceptable only when the category explains the omission. Do not create empty
stories, meaningless snapshots, or visual Figma components solely to make file sets symmetrical.

## Author checklist

- [ ] Owner and dependency direction are correct.
- [ ] Public children, state, ref, field, copy, and class contracts are explicit.
- [ ] Accessibility behavior is exercised at the right layer.
- [ ] Stories and tests cover repository-owned behavior.
- [ ] Figma representation is a component, a resource, an app-owned root, or intentionally absent.
- [ ] Stable identity and human-facing names are separate.
- [ ] Public barrel and packaged subpath are intentional.
