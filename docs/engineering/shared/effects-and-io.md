---
id: engineering.shared.effects-and-io
type: engineering
title: Effects and I/O
status: current
read_when:
  - adding filesystem, git, process, provider, or network access
  - separating deterministic logic from side effects
  - designing an adapter or port
summary: >
  Shared rules for deterministic logic and external effects: keep policy pure where
  useful, expose narrow application-facing ports, normalize adapter output near the
  boundary, and keep process/global side effects out of deep modules.
related:
  - engineering.shared.code-organization
  - engineering.shared.async-and-lifecycle
  - engineering.shared.testing
---

# Effects and I/O

## Separate deterministic decisions from effects

When practical, compute a plan or decision first and execute effects second.

```ts
const plan = planReleaseCut(input);
if (!plan.ok) throw new UsageError(plan.errors.join('\n'));
await executeReleaseCut(plan, deps);
```

This keeps complex policy reusable and cheap to test.

## Ports represent application needs

Wrap external systems with narrow, application-facing APIs such as
`git.status()`, `files.readJson(path)`, or `provider.startTurn(...)`.

Prefer one coherent port per external boundary over one interface per low-level call.
Avoid leaking raw SDK/process shapes throughout application code.

Normalize successful output near the adapter boundary while preserving enough raw
diagnostics to explain failures.

## Global effects stay at boundaries

Deep application/domain modules must not:

- write directly to `console.*`;
- call `process.exit()` or set `process.exitCode`;
- build HTTP responses;
- read ambient process state when that state can be passed explicitly.

They return typed results/events or throw structured errors. The external adapter maps
those results to stdout, HTTP, UI, or another transport.

Prefer argument arrays to shell command-string concatenation.
