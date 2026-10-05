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
  - engineering.shared.testing
  - engineering.repository.ci
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

Story `play` functions are interaction tests. Assert on rendered DOM and, where exact visuals
matter, on `window.getComputedStyle`. The shared host runs automated accessibility checks as
errors against WCAG A/AA and best-practice rules.

## Verification workflow (before marking UI work done)

Storybook is the preferred deterministic visual-development surface, but it is not a substitute for
the composed application when the behavior under test depends on the application shell.

1. Render every affected story with no backend using `pnpm storybook`.
2. Build the complete catalog with `pnpm storybook:build`.
3. Run Storybook interaction and accessibility checks with `pnpm test:storybook`.
4. Inspect every affected responsive mode, not just one desktop and one mobile size:
   - representative desktop / Wide;
   - Compact around the relevant workspace breakpoint where applicable;
   - mobile at approximately `375px`;
   - approximately `320px` for dense layouts or content that can plausibly overflow.
5. Exercise realistic long and dense fixtures where labels, titles, metadata, repeated rows, or
   action groups can stress the layout.
6. Inspect the actual SpecFlow application as well when App Shell / AppWorkspace composition,
   viewport-height ownership, scrolling, routing, sticky/fixed regions, or Primary/Secondary
   behavior cannot be faithfully validated in an isolated story.
7. Inspect computed styles and rendered dimensions when exact colors, spacing, sizing, overflow, or
   animation matter — never claim visual consistency from class names alone.
8. If visual inspection finds a defect, fix it and re-render the affected viewport. Perform the final
   rendered pass after the last UI/CSS change.
9. When a visually material change touches an existing story/screen with an accepted Chromatic
   baseline, use the available Chromatic comparison as an additional regression signal. Local
   rendered inspection answers "does this look correct now?"; the regression diff answers "did an
   accepted surface drift unexpectedly?". Chromatic remains an informational/manual PR workflow, not
   a universal protected-branch requirement. Follow
   [Continuous integration](../../../engineering/repository/ci.md#visual-regression-with-chromatic)
   for the authoritative workflow details.
