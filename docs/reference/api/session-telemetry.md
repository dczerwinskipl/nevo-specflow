---
id: reference.api.session-telemetry
type: reference
title: Session telemetry HTTP and live update contract
status: current
scope: specflow
areas: [ai, runtime, server, security, ui]
tags: [sessions, telemetry, usage, cost, limits, context, sse]
read_when:
  - designing provider telemetry producers and Session telemetry readers
  - implementing live UI consumption of token usage, costs, limits and context size
summary: >
  Bounded Session telemetry snapshot, explicit refresh and existing-stream
  invalidation contract, with provider provenance, freshness and partial availability.
related:
  - reference.api.sessions
  - reference.protocols.session-provider-driver
  - ideas.specflow-runtime.provider-migration-plan
---

# Session telemetry API

Telemetry is available through two operations:

| Operation | Purpose |
| --- | --- |
| `GET /api/sessions/{sessionId}/telemetry` | Read stored usage, cost, limit and context observations |
| `POST /api/sessions/{sessionId}/telemetry/refresh` | Request a supported native refresh without starting a Turn |

Each reading reports availability, freshness, provenance and coverage independently.
Missing measurements are not zero. Refresh can report that a group is unavailable or
unsupported; it does not grant access to provider account limits.

The request and response schemas, bounds, ETags, errors and authorization requirements
are in [OpenAPI](openapi.md), tag `Session Telemetry`.

## Live updates and refresh

Telemetry updates are delivered through the existing
[`GET /api/sessions/{sessionId}/events`](sessions.md#event-stream) stream.
For refresh admission, aggregation, staleness, persistence and provider coverage,
see [Session telemetry accounting](../../architecture/ai/session-telemetry-observations.md).
For provider-specific capabilities see
[Session provider driver](../protocols/session-provider-driver.md).
