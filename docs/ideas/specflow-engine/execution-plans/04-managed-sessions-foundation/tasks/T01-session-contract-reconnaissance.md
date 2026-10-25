---
id: ideas.specflow-engine.plan-04.task-01
type: engineering
title: 'E4.T01 — Session contract reconnaissance'
status: draft
scope: specflow
areas: [runtime, ai, security, testing]
tags: [execution-task, temporary, implementation]
read_when:
  - implementing E4.T01 on feature/managed-sessions-foundation
summary: >
  Dependency-complete session contract reconnaissance task for independent Sessions.
related:
  - ideas.specflow-engine.plan-04
  - ideas.specflow-runtime.managed-sessions-delivery
  - architecture.ai.session-storage-and-lifecycle
  - reference.api.sessions
  - reference.protocols.session-provider-driver
---

# E4.T01 — Session contract reconnaissance

Temporary implementation task on `feature/managed-sessions-foundation`.
The [parent plan](../README.md) owns sequencing and independent review gates.

## Goal and ownership

Capture bounded migration evidence and characterization fixtures. This is evidence realization, not another undecided architecture exercise.

- Kind/profile: general / nevo-agents:implementer.
- Owner paths: docs/ideas/specflow-runtime/session-migration-evidence.md; owned characterization fixtures under Runtime sessions.
- Prerequisites: Implemented E1/E2 context on pinned main; no E3 workflow dependency.
- Minimal context: delivery spec, canonical model, legacy inspection map.
- Acceptance coverage: MS01–MS05/MS12.

## Authoritative design entry points

- [Delivery and acceptance](../../../../specflow-runtime/managed-sessions-delivery.md).
- [Storage/lifecycle](../../../../../architecture/ai/session-storage-and-lifecycle.md).
- [HTTP/read contract](../../../../../reference/api/sessions.md).
- [Provider driver](../../../../../reference/protocols/session-provider-driver.md).

Read task-relevant sections; behavior stays with those owners, not duplicate schemas in UI.

## Acceptance

- Record legacy revision/source paths, preserved behaviors and intentional corrections, mapped to new owners and MS scenarios.
- Cover chronology, final/Work separation, unknown/interrupted state, duplicate starts, pending interaction expiry and late native ID. Never import legacy tools into product.
- Document rejection of required specId and whole-transcript JSON. Do not preserve known legacy bugs as new invariants.

## Verification and review

Focused fixture harness plus source evidence review; report expected failing new behavior separately from regressions.

Report actual PASS/FAIL/SKIP, affected contracts and intentional legacy differences.
Use owner-boundary tests and public feature ports. Independent review uses nevo-agents:reviewer
at the parent plan's gates; this document does not claim review occurred.
A newly evidenced material conflict blocks dependent work and returns to the owning design.

## Out of scope

No legacy compatibility/import, mandatory Spec ownership, full transcript hydration,
real writable provider launch, automatic workflow finish or fabricated prerequisite readiness.
