---
id: ideas.specflow-engine.plan-04.task-07
type: engineering
title: 'E4.T07 — UI integration slice'
status: draft
scope: specflow
areas: [runtime, ai, security, testing, ui]
tags: [execution-task, temporary, implementation]
read_when:
  - implementing E4.T07 on feature/managed-sessions-foundation
summary: >
  Dependency-complete ui integration slice task for independent Sessions.
related:
  - ideas.specflow-engine.plan-04
  - ideas.specflow-runtime.managed-sessions-delivery
  - architecture.ai.session-storage-and-lifecycle
  - reference.api.sessions
  - reference.protocols.session-provider-driver
---

# E4.T07 — UI integration slice

Temporary implementation task on `feature/managed-sessions-foundation`.
The [parent plan](../README.md) owns sequencing and independent review gates.

## Goal and ownership

Implement /sessions/new labelled mock launcher and /sessions/$sessionId Full Session over production APIs; preserve current Spec/demo entry points.

- Kind/profile: ui / nevo-agents:implementer-ui.
- Owner paths: specflow-ui features/sessions/**, app router/services/i18n; reuse current @nevo/ui.
- Prerequisites: [E4.T06](T06-http-stream-contracts.md).
- Minimal context: delivery UX, exact API, Session/DS specs; compare #95 shared-file changes.
- Acceptance coverage: MS07/MS10/MS12.

## Authoritative design entry points

- [Delivery and acceptance](../../../../specflow-runtime/managed-sessions-delivery.md).
- [Storage/lifecycle](../../../../../architecture/ai/session-storage-and-lifecycle.md).
- [HTTP/read contract](../../../../../reference/api/sessions.md).
- [Provider driver](../../../../../reference/protocols/session-provider-driver.md).

Read task-relevant sections; behavior stays with those owners, not duplicate schemas in UI.

## Acceptance

- Initial tail makes composer/current state usable without older history or detail; consume canonical readiness/activity, no provider event heuristics.
- Page up preserves scroll anchor; merge live/history by ID/revision. Stale fetch cannot overwrite newer state or selected Session; show return-to-latest.
- Partial text/content and Work/actions are lazy. Bound memory/DOM using windowing/reload anchors; never hydrate all pages in background.
- Persist browser draft per Session, clear only accepted dispatch/explicit discard; pending POST/remount/retry preserves requestId. Interaction/cancel respects capabilities.
- Show loading/error/unknown/reconnect/resync and history-page retry without losing usable chat; wide/narrow maintain answer/commentary/current activity.
- Compare current main/#95 before router/services edits; preserve document guards/DS mechanics. No invented required Spec link or global Session dashboard.

## Verification and review

Feature hook/component tests, wide/narrow Storybook and connected smoke against explicit production mock, never fixture imports in production.

Report actual PASS/FAIL/SKIP, affected contracts and intentional legacy differences.
Use owner-boundary tests and public feature ports. Independent review uses nevo-agents:reviewer
at the parent plan's gates; this document does not claim review occurred.
A newly evidenced material conflict blocks dependent work and returns to the owning design.

## Out of scope

No legacy compatibility/import, mandatory Spec ownership, full transcript hydration,
real writable provider launch, automatic workflow finish or fabricated prerequisite readiness.
