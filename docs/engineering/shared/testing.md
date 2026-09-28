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

## Determinism

Tests must not depend accidentally on wall-clock time, locale, network, ambient
environment, or execution order. Inject clocks and other nondeterministic sources when
they affect behavior.

Generated artifacts should be compared against deterministic regenerated output and
must not embed incidental timestamps.

## Coverage

Coverage is a signal for finding untested behavior, not a target to game. Add
package-level thresholds where meaningful logic warrants them; do not impose a
repository-wide number merely for uniformity.
