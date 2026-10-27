---
id: ideas.specflow-engine.plan-04.task-06
type: engineering
title: 'E4.T06 — HTTP/stream contracts'
status: draft
scope: specflow
areas: [runtime, ai, security, testing]
tags: [execution-task, temporary, implementation]
read_when:
  - implementing E4.T06 on feature/managed-sessions-foundation
summary: >
  Dependency-complete http/stream contracts task for independent Sessions.
related:
  - ideas.specflow-engine.plan-04
  - ideas.specflow-runtime.managed-sessions-delivery
  - architecture.ai.session-storage-and-lifecycle
  - reference.api.sessions
  - reference.protocols.session-provider-driver
---

# E4.T06 — HTTP/stream contracts

Temporary implementation task on `feature/managed-sessions-foundation`.
The [parent plan](../README.md) owns sequencing and independent review gates.

## Goal and ownership

Wire production Session configuration/storage/lifecycle and authorized bounded HTTP/SSE.

- Kind/profile: backend / nevo-agents:implementer.
- Owner paths: Runtime Session feature, config/start/server composition and Auth-owned public stream checker; test/sessions HTTP/SSE.
- Prerequisites: [E4.T05](T05-turn-coordinator.md).
- Minimal context: API reference, Runtime auth/endpoint policy, delivery config/startup.
- Acceptance coverage: MS01/MS02/MS04/MS06–MS09.

## Authoritative design entry points

- [Delivery and acceptance](../../../../specflow-runtime/managed-sessions-delivery.md).
- [Storage/lifecycle](../../../../../architecture/ai/session-storage-and-lifecycle.md).
- [HTTP/read contract](../../../../../reference/api/sessions.md).
- [Provider driver](../../../../../reference/protocols/session-provider-driver.md).

Read task-relevant sections; behavior stays with those owners, not duplicate schemas in UI.

## Acceptance

- Implement exact routes/error/byte limits with trusted project/session scopes; no required specId or client actor override.
- Project sessions flags default false; reject unknown/local overrides. Disabled feature acquires no store; enabled startup reconciles before exposure and shutdown owns cleanup.
- Snapshot/replay/live handoff loses no events; durable outbox before broadcast, bounded replay/subscriber queues and explicit resync on gaps. Disconnect never cancels execution.
- Verify history tokens, content/Work membership and current Auth each request; SSE reauthorizes through Auth's public boundary at each batch/idle interval.
- Test expired/revoked credentials, forged scope, altered retry payload and expired cursors. No demo fallback or duplicated Auth cookie resolver.

## Verification and review

Fastify HTTP/SSE integration through real SQLite+controlled mock; config tests and Runtime/contracts typecheck/build/lint.

Report actual PASS/FAIL/SKIP, affected contracts and intentional legacy differences.
Use owner-boundary tests and public feature ports. Independent review uses nevo-agents:reviewer
at the parent plan's gates; this document does not claim review occurred.
A newly evidenced material conflict blocks dependent work and returns to the owning design.

## Out of scope

No legacy compatibility/import, mandatory Spec ownership, full transcript hydration,
real writable provider launch, automatic workflow finish or fabricated prerequisite readiness.
