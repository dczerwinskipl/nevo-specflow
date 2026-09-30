---
id: ideas.specflow-runtime.ai-adapters
type: hub
title: AI adapter hardening ideas
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - testing
tags:
  - providers
  - lifecycle
  - streaming
  - recovery
read_when:
  - migrating AI providers into SpecFlow Runtime
  - hardening provider adapters before the MVP implementation settles
summary: >
  Candidate hardening work for provider adapters: evidence-based error classification,
  output semantics, invocation fencing, resource ownership, liveness, raw diagnostics,
  correlation identity, diagnostics, and replay tests.
related:
  - ideas.readme
  - architecture.ai.provider-boundary
  - architecture.ai.canonical-session-turn-work
  - architecture.runtime.ownership-and-lifecycle
---

# AI adapter hardening ideas

## Goal

Preserve the existing canonical `Session -> Turn -> Work` architecture while making the adapter
boundary less dependent on provider text quirks, process timing, and platform-specific behavior.

These notes are intended to be consumed **while provider functionality is migrated**, so obvious
hardening can land with the migrated feature instead of reproducing known legacy weaknesses first.

## Suggested implementation order

### P0 — correctness

1. [Invocation ownership and late events](invocation-ownership-and-late-events.md)
2. [Provider/session correlation identity](correlation-identity.md)
3. [Evidence-based error classification](error-classification.md)
4. [Provider readiness and authentication](provider-readiness-and-auth.md)

These can otherwise corrupt canonical ownership, resurrect terminal aliases, make application
semantics depend on misleading provider text, or advertise an installed-but-logged-out provider as
ready for work.

### P1 — operational reliability

5. [Resource lifetime and settlement](resource-lifetime.md)
6. [Liveness and watchdogs](liveness-watchdog.md)
7. [Output semantics](output-semantics.md)
8. [Model selection and reasoning effort](model-selection-and-effort.md)

### P2 — diagnostics and maintainability

9. [Raw diagnostics retention](raw-diagnostics-retention.md)
10. [Provider diagnostics and replay](diagnostics-and-replay.md)
11. [Cross-platform process concerns](cross-platform-process-runtime.md)
12. [Provider protocol examples](protocol-examples.md)
13. [Provider error and limit examples](provider-error-examples.md)
14. [Legacy migration inspection map](migration-inspection-map.md)

## Principles shared by all items

- Canonical state is durable; provider protocol data is adapter input.
- Structured protocol evidence outranks text heuristics.
- Raw stdout/stderr is diagnostic evidence, not application state.
- Terminal Turns are immutable; late callbacks cannot mutate canonical state.
- One invocation owns one set of resources and one settlement path.
- Platform-specific telemetry may improve decisions but MUST NOT become a hidden portability
  requirement.
- Every production protocol bug worth fixing SHOULD become a minimized replay/regression fixture.
