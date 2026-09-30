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

## Authority and evidence model

This package mixes three kinds of information and labels them explicitly where ambiguity matters:

- **Current SpecFlow rule** — an invariant already owned by a current authoritative document.
- **Legacy evidence** — behavior, tests, or contracts observed in the legacy Nevo implementation;
  useful migration input, but not automatically approved target design.
- **Candidate design** — a proposed SpecFlow direction that still needs promotion into the
  appropriate architecture, engineering, product, or reference document before it becomes
  authoritative.

When those conflict, current SpecFlow architecture wins. Do not copy a legacy contract solely
because it existed, and do not treat a candidate `AI_*` code, model trait, health field, timeout,
or parser heuristic as already approved target API.

## Suggested implementation order

### P0 — correctness

1. [Invocation ownership and late events](invocation-ownership-and-late-events.md)
2. [Provider/session correlation identity](correlation-identity.md)
3. [Evidence-based error classification](error-classification.md)
4. [Provider readiness and authentication](provider-readiness-and-auth.md)
5. [Provider process environment boundary](process-environment-boundary.md)
6. [Provider diagnostic sanitization](diagnostic-sanitization.md)
7. [Provider session resume and recovery](session-resume-and-recovery.md)

These can otherwise corrupt canonical ownership, resurrect terminal aliases, leak host/server
credentials into provider processes or logs, replay unknown provider work, make application
semantics depend on misleading provider text, or advertise an installed-but-logged-out provider as
ready for work.

### P1 — operational reliability

8. [Resource lifetime and settlement](resource-lifetime.md)
9. [Liveness and watchdogs](liveness-watchdog.md)
10. [Output semantics](output-semantics.md)
11. [Model selection and reasoning effort](model-selection-and-effort.md)
12. [Provider usage accounting provenance](usage-accounting.md)
13. [Provider capacity and admission](provider-capacity-and-admission.md)

### P2 — diagnostics and maintainability

14. [Raw diagnostics retention](raw-diagnostics-retention.md)
15. [Provider diagnostics and replay](diagnostics-and-replay.md)
16. [Cross-platform process concerns](cross-platform-process-runtime.md)
17. [Provider protocol mapping examples](protocol-examples.md)
18. [Provider error and limit evidence](provider-error-examples.md)
19. [Legacy migration inspection map](migration-inspection-map.md)

## Principles shared by all items

- Canonical state is durable; provider protocol data is adapter input.
- Structured protocol evidence outranks text heuristics.
- Raw stdout/stderr is diagnostic evidence, not application state.
- Terminal Turns are immutable; late callbacks cannot mutate canonical state.
- One invocation owns one set of resources and one settlement path.
- Platform-specific telemetry may improve decisions, but the candidate design should not make it a hidden portability requirement.
- Production protocol bugs worth fixing should normally become minimized replay/regression fixtures.
