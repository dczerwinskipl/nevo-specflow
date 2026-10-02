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

## Test placement

Keep tests with the ownership model of the code they verify:

- **UI and reusable browser libraries** — co-locate focused `.test.ts(x)` files with the
  component/module they verify. Shared test helpers may live in a dedicated
  `test-utils/` area.
- **Runtime, CLI, backend, and repository tooling** — use a package-level `test/`
  tree that mirrors meaningful `src/` responsibilities such as `domain/`, `app/`,
  `infra/`, and `cli/`.

Do not force one directory convention across fundamentally different runtime surfaces.

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
