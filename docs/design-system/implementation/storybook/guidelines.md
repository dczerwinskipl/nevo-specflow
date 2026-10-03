---
id: design-system.implementation.storybook.guidelines
type: engineering
title: Storybook guidelines
status: draft
read_when:
  - creating or editing a Storybook story
  - verifying a UI component visually or with interaction tests
  - building deterministic UI fixtures
summary: >
  Story hierarchy and naming (Foundations / Shared UI / Features / Screens), strict
  co-location, typed fixture factories, args-first state, play-function interaction
  tests, and the mandatory verification workflow.
related:
  - design-system.implementation.react.component-guidelines
  - design-system.principles.ui-ux-guidelines
  - engineering.cli.testing
---

# Storybook guidelines

`status: draft` — working guidance. Exact scripts and config paths are set with the dashboard code.

## Story hierarchy

Story `title` defines the sidebar tree:

| Tier        | Title pattern                   | Purpose                                                             |
| ----------- | ------------------------------- | ------------------------------------------------------------------- |
| Foundations | `Foundations/<Topic>`           | Design tokens, color/type scales, token-resolution and smoke tests. |
| Shared UI   | `Shared/UI/<Component>`         | Domain-agnostic primitives.                                         |
| Features    | `Features/<Domain>/<Component>` | Vertical domain features composing primitives + fixtures.           |
| Screens     | `Screens/<PageName>`            | Full page views with routing/layout context (reserved).             |

## Co-location and naming

- `<component>.stories.tsx` sits **beside** `<component>.tsx`. No omnibus story files.
- Focused component tests (`<component>.test.tsx`) follow the same ownership rule.
- Story exports are PascalCase (`EmptyState`, `ActiveTool`).
- Component/feature-owned fixtures and test helpers stay with that component or vertical slice.
  Introduce a shared `test-utils/` area only when multiple independent slices genuinely reuse the
  helper.
- Mobile variants spread the base story and add a viewport parameter.

See [shared testing](../../../engineering/shared/testing.md#test-and-story-placement) for the
repository-wide placement rule.

## Fixtures

Build scenario data with **typed fixture factories**, not inline state trees copied
across stories. Stories consume the canonical UI model; raw provider protocol payloads
are forbidden in fixtures.

## State strategy

1. **Args first** — presentational components are driven by top-level `args` +
   Controls.
2. **Decorators** only for essential environment providers (router, query client,
   viewport framing).
3. **Network mocking** only for genuine integration stories, with owner approval for
   the dependency; prefer MSW over ad-hoc fetch interception.

## Testing

Story `play` functions are interaction tests (run under the Storybook + Vitest browser
project). Assert on rendered DOM and, where exact visuals matter, on
`window.getComputedStyle`.

## Verification workflow (before marking UI work done)

1. Render every affected story with no backend.
2. Run the full Storybook/Vitest suite (unit + browser).
3. Inspect desktop and mobile (`375px`) viewports.
4. Inspect computed styles when exact colors/spacing/animation matter — never claim
   visual consistency from class names alone.
