---
id: reference.api.sessions
type: reference
title: Managed Sessions HTTP and read-model contract
status: current
scope: specflow
areas: [ai, runtime, server, security, ui]
tags: [sessions, pagination, tail, streaming, idempotency]
read_when:
  - implementing Session schemas, HTTP or UI clients
  - implementing tail/history cursors and replay
  - listing Sessions, reading a Session's association or starting a Session from a Specification
summary: >
  Implementation contract for independent Session commands, bounded snapshots,
  conversation and Work paging, content ranges, scoped authorization and SSE resync, plus the
  Session list, the association read and the composed create from a Specification.
related:
  - ideas.specflow-runtime.session-association
  - architecture.runtime.authorization
  - architecture.ai.session-storage-and-lifecycle
  - architecture.ai.canonical-session-turn-work
  - reference.protocols.session-provider-driver
  - reference.providers.compatibility
---

# Managed Sessions API

Exact routes, parameters, response schemas, refusal codes, HTTP headers and operation descriptions
are generated from the Runtime TypeBox schemas in [OpenAPI](openapi.md), under the
`Sessions` and `Session Providers` tags. Avoid maintaining a second HTTP contract here.

Domain behavior has moved into focused architecture owners:
- [Session authorization, providers and demo](../../architecture/ai/session-admission-and-providers.md)
- [Session commands and lifecycle](../../architecture/ai/session-commands.md)
- [Session association and list](../../architecture/ai/session-association-and-list.md)
- [Session history, Work, content and events](../../architecture/ai/session-history-and-events.md)
- [Session telemetry accounting](../../architecture/ai/session-telemetry-observations.md)

This file retains its stable discovery ID and original section anchors during migration.

## Enable Sessions

See [Session authorization, providers and demo boundaries](../../architecture/ai/session-admission-and-providers.md#enable-sessions), and generated OpenAPI.

## Authorization and transport

See [Session authorization, providers and demo boundaries](../../architecture/ai/session-admission-and-providers.md#authorization-and-transport), and generated OpenAPI.

## Common shapes

See [Managed Session commands and lifecycle](../../architecture/ai/session-commands.md#common-shapes), and generated OpenAPI.

## Routes and commands

See [Managed Session commands and lifecycle](../../architecture/ai/session-commands.md#routes-and-commands), and generated OpenAPI.

## Session list, association read and composed create

See [Session association and filtered list semantics](../../architecture/ai/session-association-and-list.md#session-list-association-read-and-composed-create), and generated OpenAPI.

## Bounded history and Work

See [Session history, content ranges, Work digest and live events](../../architecture/ai/session-history-and-events.md#bounded-history-and-work), and generated OpenAPI.

## Event stream

See [Session history, content ranges, Work digest and live events](../../architecture/ai/session-history-and-events.md#event-stream), and generated OpenAPI.

## Provider catalogue

See [Session authorization, providers and demo boundaries](../../architecture/ai/session-admission-and-providers.md#provider-catalogue), and generated OpenAPI.

## Demo Runtime (read-only managed Sessions)

See [Session authorization, providers and demo boundaries](../../architecture/ai/session-admission-and-providers.md#demo-runtime-read-only-managed-sessions), and generated OpenAPI.

## Error contract

See [Session authorization, providers and demo boundaries](../../architecture/ai/session-admission-and-providers.md#error-contract), and generated OpenAPI.
