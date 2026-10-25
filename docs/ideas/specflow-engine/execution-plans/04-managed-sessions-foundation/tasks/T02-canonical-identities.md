---
id: ideas.specflow-engine.plan-04.task-02
type: engineering
title: 'E4.T02 — Canonical identities'
status: draft
scope: specflow
areas: [runtime, ai, security, testing]
tags: [execution-task, temporary, implementation]
read_when:
  - implementing E4.T02 on feature/managed-sessions-foundation
summary: >
  Dependency-complete canonical identities task for independent Sessions.
related:
  - ideas.specflow-engine.plan-04
  - ideas.specflow-runtime.managed-sessions-delivery
  - architecture.ai.session-storage-and-lifecycle
  - reference.api.sessions
  - reference.protocols.session-provider-driver
---

# E4.T02 — Canonical identities

Temporary implementation task on `feature/managed-sessions-foundation`.
The [parent plan](../README.md) owns sequencing and independent review gates.

## Goal and ownership

Realize the fixed canonical and wire contracts with schemas/types and validation tests; no HTTP/store implementation.

- Kind/profile: backend / nevo-agents:implementer.
- Owner paths: specflow-contracts/src/sessions/** and exports; public Runtime driver/store port types.
- Prerequisites: [E4.T01](T01-session-contract-reconnaissance.md).
- Minimal context: API reference, driver reference, storage/lifecycle design, T01 evidence.
- Acceptance coverage: MS01–MS08/MS12.

## Authoritative design entry points

- [Delivery and acceptance](../../../../specflow-runtime/managed-sessions-delivery.md).
- [Storage/lifecycle](../../../../../architecture/ai/session-storage-and-lifecycle.md).
- [HTTP/read contract](../../../../../reference/api/sessions.md).
- [Provider driver](../../../../../reference/protocols/session-provider-driver.md).

Read task-relevant sections; behavior stays with those owners, not duplicate schemas in UI.

## Acceptance

- Core UUID identity is independent of Spec/Task/Engine; native composite locator stays private.
- Define requests, snapshot/history/Work/actions/content, events, provider descriptor, states/outcomes and typed errors once according to references. Reuse session.create/view/manage.
- Test valid empty/active/terminal/partial/interacting snapshots and reject unknown fields, impossible state/outcome, invalid identifiers and UTF-8 byte limits.
- Driver facts preserve invocation identity/sequence/provenance and explicit settlement; UI DTOs exclude native IDs/raw payload.

## Verification and review

Contracts unit tests, build/typecheck/lint and public export checks. Validate API examples.

Report actual PASS/FAIL/SKIP, affected contracts and intentional legacy differences.
Use owner-boundary tests and public feature ports. Independent review uses nevo-agents:reviewer
at the parent plan's gates; this document does not claim review occurred.
A newly evidenced material conflict blocks dependent work and returns to the owning design.

## Out of scope

No legacy compatibility/import, mandatory Spec ownership, full transcript hydration,
real writable provider launch, automatic workflow finish or fabricated prerequisite readiness.
