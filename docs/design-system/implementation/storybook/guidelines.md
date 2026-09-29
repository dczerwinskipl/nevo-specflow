---
id: design-system.implementation.storybook.guidelines
type: engineering
title: Storybook guidelines
status: current
read_when:
  - creating or editing a Storybook story
  - verifying a UI component visually or with interaction tests
  - building deterministic UI fixtures
summary: >
  The shared Storybook host, owner-based story hierarchy, co-location, deterministic
  fixtures, accessibility checks, and the required desktop/mobile verification workflow.
related:
  - design-system.implementation.react.component-guidelines
  - design-system.principles.ui-ux-guidelines
  - engineering.cli.testing
---

# Storybook guidelines

The repository has one Storybook host under `tools/storybook/`. Its configuration discovers
stories owned by Nevo UI, SpecFlow UI, and independent examples without moving those stories out
of their owner packages.

## Story hierarchy

Story `title` defines the sidebar tree:

| Owner       | Title pattern                    | Purpose                                                        |
| ----------- | -------------------------------- | -------------------------------------------------------------- |
| Nevo UI     | `Nevo UI/<Category>/<Component>` | Reusable foundations, primitives, patterns, and app mechanics. |
| SpecFlow UI | `SpecFlow/<Area>/<Story>`        | Brand, product composition, features, and full screens.        |
| Examples    | `Examples/<Example>/<Story>`     | Independent consumer examples, including CRM.                  |

Use `Brand`, `Components`, `Features`, and `Screens` below `SpecFlow`. Nevo UI categories follow
the package organization, such as `Foundations`, `Actions`, `Forms`, `Navigation`, `Data`, and
`Patterns`.

## Co-location and naming

- `<component>.stories.tsx` sits **beside** `<component>.tsx`. No omnibus story files.
- Story exports are PascalCase (`EmptyState`, `ActiveTool`).
- Test utilities live in a dedicated `test-utils/` area, never in production component
  directories.
- Mobile variants spread the base story and add a viewport parameter.

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

Story `play` functions are interaction tests. Assert on rendered DOM and, where exact visuals
matter, on `window.getComputedStyle`. The shared host runs automated accessibility checks as
errors against WCAG A/AA and best-practice rules.

## Verification workflow (before marking UI work done)

1. Render every affected story with no backend using `pnpm storybook`.
2. Build the complete catalog with `pnpm storybook:build`.
3. Run accessibility checks with `pnpm test:a11y`.
4. Inspect desktop and mobile (`375px`) viewports.
5. Inspect computed styles when exact colors/spacing/animation matter — never claim
   visual consistency from class names alone.
