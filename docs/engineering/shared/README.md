---
id: docs.engineering-shared-readme
type: hub
title: Shared engineering guidance
status: current
summary: >
  Cross-cutting implementation rules shared by CLI, Runtime, UI adapters, AI,
  workflow, and repository tooling.
---

# Shared engineering guidance

These rules apply across technical surfaces. Surface-specific docs should reference
them instead of restating them.

| Doc | Covers |
| --- | --- |
| [Code organization](code-organization.md) | Boundaries, capability ownership, pragmatic layering, DI. |
| [Effects and I/O](effects-and-io.md) | Pure decisions, ports/adapters, global side effects. |
| [Async and lifecycle](async-and-lifecycle.md) | Cancellation, resource ownership, child processes, cleanup. |
| [Testing](testing.md) | Test responsibility boundaries, determinism, coverage. |
