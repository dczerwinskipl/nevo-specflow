---
id: ideas.specflow-engine.plan-04.task-05
type: engineering
title: 'E4.T05 — Turn coordinator'
status: draft
scope: specflow
areas: [runtime, ai, security, testing]
tags: [execution-task, temporary, implementation]
read_when:
  - implementing E4.T05 on feature/managed-sessions-foundation
summary: >
  Dependency-complete turn coordinator task for independent Sessions.
related:
  - ideas.specflow-engine.plan-04
  - ideas.specflow-runtime.managed-sessions-delivery
  - architecture.ai.session-storage-and-lifecycle
  - reference.api.sessions
  - reference.protocols.session-provider-driver
---

# E4.T05 — Turn coordinator

Temporary implementation task on `feature/managed-sessions-foundation`.
The [parent plan](../README.md) owns sequencing and independent review gates.

## Goal and ownership

Implement independent create/start/respond/cancel/observe/reconcile/shutdown use cases and one pure canonical reducer over store+driver.

- Kind/profile: backend / nevo-agents:implementer.
- Owner paths: Runtime sessions/lifecycle/**, interactions/**, projections/** and public index.ts.
- Prerequisites: [E4.T03](T03-durable-runtime-state.md), [E4.T04](T04-provider-neutral-test-driver.md).
- Minimal context: storage/lifecycle, driver protocol, delivery scenarios.
- Acceptance coverage: MS01–MS05/MS09/MS12.

## Authoritative design entry points

- [Delivery and acceptance](../../../../specflow-runtime/managed-sessions-delivery.md).
- [Storage/lifecycle](../../../../../architecture/ai/session-storage-and-lifecycle.md).
- [HTTP/read contract](../../../../../reference/api/sessions.md).
- [Provider driver](../../../../../reference/protocols/session-provider-driver.md).

Read task-relevant sections; behavior stays with those owners, not duplicate schemas in UI.

## Acceptance

- Commit admission/intent before dispatch; identical accepted request after terminal/restart returns original result, changed fingerprint conflicts, distinct active start conflicts.
- Fence every callback by owner epoch, invocation and driverSeq. Late native correlation/Work/text cannot mutate settled or replaced Turn.
- Arbitrate cancel/timeout/outcome exactly once; preserve unknown, reject stale/cross-turn responses, do not fail Turn solely from one tool.
- Materialize bounded readiness/activity/conversation/usage atomically; reasoning differs from commentary; repeated totals never accumulate.
- Shutdown stops admission; restart reconciles only active mock records as interrupted/expired without replaying uncertain invocation.

## Verification and review

Pure reducer race tests and store+mock application scenarios at each crash cut; cancellation settlement, usage duplicates, late IDs, waiting/liveness.

Report actual PASS/FAIL/SKIP, affected contracts and intentional legacy differences.
Use owner-boundary tests and public feature ports. Independent review uses nevo-agents:reviewer
at the parent plan's gates; this document does not claim review occurred.
A newly evidenced material conflict blocks dependent work and returns to the owning design.

## Out of scope

No legacy compatibility/import, mandatory Spec ownership, full transcript hydration,
real writable provider launch, automatic workflow finish or fabricated prerequisite readiness.
