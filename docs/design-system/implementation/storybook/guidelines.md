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
- Mobile variants use Storybook 10 `globals.viewport` (for example `mobile1`) so local Storybook, Chromium, and Chromatic render the same viewport.

## Story profiles

Stories have different jobs; do not make every Storybook entry a browser test and a visual baseline.

| Profile     | Tag           | Sidebar           | Chromium                           | Chromatic snapshot | Use                                                   |
| ----------- | ------------- | ----------------- | ---------------------------------- | ------------------ | ----------------------------------------------------- |
| Showcase    | none          | visible           | only when it has a `play` function | no                 | Human inspection and Controls.                        |
| Visual      | `visual`      | visible           | yes                                | yes                | Small, stable regression baseline.                    |
| Contract    | `contract`    | hidden by default | yes                                | no                 | Interaction, accessibility, or geometry contract.     |
| Integration | `integration` | hidden by default | yes                                | no                 | Multi-component compatibility behavior.               |
| Capture     | `capture`     | hidden by default | no                                 | no                 | Figma/design capture and other tooling-only fixtures. |

A `play` function receives Storybook's built-in `play-fn` tag automatically and therefore remains
part of the Chromium suite unless the story is also tagged `capture`. This preserves behavioral
coverage without running every showcase variant in Playwright.

Chromatic snapshots are opt-in at project level. A `visual` story must explicitly set
`parameters.chromatic.disableSnapshot = false`. Keep the visual set intentionally small and prefer
representative component states and composed product screens over exhaustive variant grids. Visual
stories are render baselines, not interaction tests: they must not carry assertion-bearing `play`
functions. Put behavioral assertions in a paired `contract` story that reuses the same scenario.

Capture, contract, and integration tags are excluded from the sidebar by default. They remain
available locally through the Storybook tag filter.

Capture stories must stay fixture-only and **must not define assertion-bearing `play` functions**.
When a capture fixture has browser-verifiable invariants, reuse the same render fixture from a
paired `contract` story and keep the assertions there. This keeps capture rendering out of Chromium
without silently dropping contract coverage.

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
3. Install Chromium once per local Playwright environment with `pnpm storybook:browsers:install`,
   then run the selected interaction, visual-smoke, contract, integration, and accessibility checks
   with `pnpm test:storybook`.
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
9. When a visually material change touches an existing `visual` story/screen with an accepted
   Chromatic baseline, use the available comparison as an additional regression signal. Chromatic
   uses TurboSnap: normal source changes re-snapshot only affected visual stories, while global CSS,
   Storybook configuration, and the lockfile force a full visual re-test. Local rendered inspection
   answers "does this look correct now?"; the regression diff answers "did an accepted surface drift
   unexpectedly?". Chromatic remains an informational/manual PR workflow, not a universal
   protected-branch requirement. Follow
   [Continuous integration](../../../engineering/repository/ci.md#visual-regression-with-chromatic)
   for the authoritative workflow details.
