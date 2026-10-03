---
id: engineering.shared.testing
type: engineering
title: Testing
status: current
read_when:
  - writing tests for application or infrastructure code
  - choosing a test boundary
  - reviewing determinism or test isolation
summary: >
  Shared testing strategy: pure policy tests, application tests with in-memory fakes,
  adapter integration tests, deterministic fixtures, and focused coverage rather than
  framework re-testing.
related:
  - engineering.shared.code-organization
  - engineering.shared.effects-and-io
  - engineering.cli.testing
---

# Testing

Use **Vitest** for TypeScript packages in this repository unless a package has a
concrete reason to use a different runner.

## Test at the responsibility boundary

- **Pure policy/state logic** — fast unit tests without mocks.
- **Application operations** — scenario tests with in-memory fakes for external ports.
- **External adapters** — focused integration tests using temp directories/repos or a
  controlled process boundary.
- **Public boundaries** — a small number of end-to-end or smoke tests proving the real
  externally-visible contract.

Do not re-test framework behavior that the framework itself owns.

## Test and story placement

Placement follows **ownership**, not technology. A test or Storybook story that belongs to one
module/component lives beside that owner. A package-level `test/` tree is reserved for tests whose
boundary genuinely spans multiple source modules or an external/package boundary.

### Co-locate owned tests

Co-locate focused unit/module tests with the production file they verify:

```text
src/
  retry.ts
  retry.test.ts

  authorization/
    resolver.ts
    resolver.test.ts
```

Use `.test.ts` / `.test.tsx`. Do not create a mirrored `test/` or `__tests__/` tree merely to
separate unit tests from source.

A useful ownership check is: **if moving or deleting the production module should naturally move or
delete this test too, the test should be co-located.**

For a focused unit test, import the owned module directly rather than routing through a package
barrel only to reach it. Test the package barrel/public surface separately when that public contract
itself is the behavior under test.

### React components and stories

React follows the same rule; it is not a special exception:

```text
Button/
  Button.tsx
  Button.test.tsx
  Button.stories.tsx
  button.css
  index.ts
```

Component tests, hooks tests, stories, feature-local fixtures, and feature-local test helpers stay
with the component or vertical slice that owns them. Stories describe the same public UI contract
and should move with the component.

Do not create central `stories/`, `components-tests/`, or repository-wide fixture folders for
artifacts owned by one component.

### Use `test/` for cross-boundary verification

Use a package-level `test/` directory when there is no single source module that owns the test,
for example:

- package/public-API contract tests spanning several modules;
- adapter or integration tests spanning multiple application responsibilities;
- real filesystem/process/network boundary tests;
- packaging, installed-artifact, end-to-end, or smoke tests.

Name the boundary when it helps make the reason obvious:

```text
test/
  public-api.contract.test.ts
  authorization.contract.test.ts
  packaging.smoke.test.ts
```

A `test/` tree may mirror meaningful capabilities when the tests themselves are integration-level.
Do not use that permission to recreate a second copy of `src/` for ordinary units.

### Test helpers

Prefer a helper beside the tests/slice that owns it. Introduce a package-level `test-utils/` only
when multiple independent slices genuinely share the helper. Avoid generic fixture/helper dumping
grounds.

### Existing code and migration

This convention applies to new tests immediately. Existing package-level tests do not need a
repository-wide mechanical move. When a focused unit test is touched and its owner is clear, move it
beside that owner when doing so is low-risk. Keep true integration/contract/smoke tests in `test/`.

### Placement checklist for coding agents

Before creating or moving a test/story:

1. Identify the production owner and the behavior boundary.
2. If one module/component/vertical slice owns it, co-locate it.
3. If the test coordinates multiple owners or verifies a package/external boundary, use `test/`.
4. Keep React stories next to the component.
5. Prefer feature-local helpers; promote helpers only after real reuse appears.
6. Do not choose layout from an older neighboring file when that file conflicts with this rule.

## Package isolation in CI

Every workspace package that owns tests MUST expose its own `test` script. CI resolves
the Turbo `test` task graph and runs affected package test tasks as independent matrix
jobs with fail-fast disabled. On protected-branch pushes, all package test tasks run.

The stable aggregate `test` status remains the required branch-protection check, but a
failure in one package must not prevent unrelated package test jobs from completing.
Package tests must therefore be runnable through their package's Turbo target without
depending on another package's test process or execution order.

## Determinism

Tests must not depend accidentally on wall-clock time, locale, network, ambient
environment, or execution order. Inject clocks and other nondeterministic sources when
they affect behavior.

Generated artifacts should be compared against deterministic regenerated output and
must not embed incidental timestamps.

## Characterization before behavior change

When migrating, refactoring, or modifying behavior whose current semantics are not already protected,
first add a characterization test at the narrowest meaningful boundary.

Characterization is especially important around lifecycle/recovery, persistence, source-control
effects, provider protocol mapping, and deterministic workflow transitions.

The point is not to freeze accidental internals forever. It is to distinguish:

1. existing observable behavior;
2. an intentional behavior change;
3. an accidental regression introduced during refactoring.

Prefer separating the characterization commit/test from the intentional behavior change when that
materially improves reviewability.

## Coverage

Coverage is a signal for finding untested behavior, not a target to game. Add
package-level thresholds where meaningful logic warrants them; do not impose a
repository-wide number merely for uniformity.
