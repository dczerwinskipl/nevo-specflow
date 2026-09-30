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

These can otherwise corrupt canonical ownership, resurrect terminal aliases, or make application
semantics depend on misleading provider text.

### P1 — operational reliability

4. [Resource lifetime and settlement](resource-lifetime.md)
5. [Liveness and watchdogs](liveness-watchdog.md)
6. [Output semantics](output-semantics.md)

### P2 — diagnostics and maintainability

7. [Raw diagnostics retention](raw-diagnostics-retention.md)
8. [Provider diagnostics and replay](diagnostics-and-replay.md)
9. [Cross-platform process concerns](cross-platform-process-runtime.md)

## Principles shared by all items

- Canonical state is durable; provider protocol data is adapter input.
- Structured protocol evidence outranks text heuristics.
- Raw stdout/stderr is diagnostic evidence, not application state.
- Terminal Turns are immutable; late callbacks cannot mutate canonical state.
- One invocation owns one set of resources and one settlement path.
- Platform-specific telemetry may improve decisions but MUST NOT become a hidden portability
  requirement.
- Every production protocol bug worth fixing SHOULD become a minimized replay/regression fixture.
