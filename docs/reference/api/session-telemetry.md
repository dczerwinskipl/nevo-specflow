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

The exact transport contracts are generated in [OpenAPI](openapi.md), operations
`getSessionsBySessionIdTelemetry` and
`postSessionsBySessionIdTelemetryRefresh` from
`packages/specflow-contracts/src/sessions/telemetry.ts` and
`packages/specflow-runtime/src/features/sessions/http/telemetry.ts`.

The authoritative measurement semantics, provenance, availability/freshness,
account-limit authorization, native refresh, persistence and SSE invalidation
are in [Session telemetry accounting](../../architecture/ai/session-telemetry-observations.md).
The provider contracts are in
[Session provider driver](../protocols/session-provider-driver.md).
This page preserves its stable documentation ID without copying the DTO schema.

## Resources and operations

See [Session telemetry accounting](../../architecture/ai/session-telemetry-observations.md#observation-semantics) and the generated OpenAPI operations.

### Snapshot envelope and readings

See [Session telemetry accounting](../../architecture/ai/session-telemetry-observations.md#observation-semantics) and the generated OpenAPI operations.

### Usage and money

See [Session telemetry accounting](../../architecture/ai/session-telemetry-observations.md#observation-semantics) and the generated OpenAPI operations.

### Limits

See [Session telemetry accounting](../../architecture/ai/session-telemetry-observations.md#observation-semantics) and the generated OpenAPI operations.

### Current context

See [Session telemetry accounting](../../architecture/ai/session-telemetry-observations.md#observation-semantics) and the generated OpenAPI operations.

## Live updates and refresh

See [Session telemetry accounting](../../architecture/ai/session-telemetry-observations.md#refresh-events-and-freshness) and the generated OpenAPI operations.

### Explicit refresh

See [Session telemetry accounting](../../architecture/ai/session-telemetry-observations.md#explicit-refresh-and-capabilities) and the generated OpenAPI operations.

## Authorization, persistence and bounds

See [Session telemetry accounting](../../architecture/ai/session-telemetry-observations.md#persistence-migration-and-supported-sources) and the generated OpenAPI operations.

## Provider coverage

See [Session telemetry accounting](../../architecture/ai/session-telemetry-observations.md#persistence-migration-and-supported-sources) and the generated OpenAPI operations.
