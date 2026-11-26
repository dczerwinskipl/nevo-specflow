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

Use the [OpenAPI Session operations](openapi.md) for exact parameters, request bodies,
responses and refusal codes. Session resources have their own lifecycle; a Session
can optionally be associated with a Specification.

## Session list

`GET /api/sessions` returns an authorized, bounded list, with signed cursors and optional
scope filters. Use `POST /api/sessions` to create a standalone Session and
`POST /api/specs/{specId}/sessions` to create one associated with a Specification.

See [Session association and list rules](../../architecture/ai/session-association-and-list.md)
for visibility, association and list pagination.

## Association read

`GET /api/sessions/{sessionId}/association` returns the Session's Specification and
Task association, subject to independent authorization for the referenced resources.
Associations are not reassigned through this endpoint.

## Commands and lifecycle

`GET /api/sessions/{sessionId}` reads the bounded snapshot. The same resource has
`rename`, `archive`, `unarchive` and `DELETE` operations.
`POST /api/sessions/{sessionId}/turns` starts a Turn;
`.../turns/{turnId}/cancel` and `.../turns/{turnId}/reconcile` handle cancellation
and uncertain outcomes. Interactive approvals use
`POST /api/sessions/{sessionId}/interactions/{interactionId}/respond`.

See [Session commands and lifecycle](../../architecture/ai/session-commands.md)
for idempotency, recovery, ownership and allowed state changes.

## Bounded history and Work

`GET /api/sessions/{sessionId}/history` pages older conversation entries.
`GET /api/sessions/{sessionId}/content/{contentId}` returns bounded content ranges,
and `GET /api/sessions/{sessionId}/turns/{turnId}/work` pages Turn work items.
Cursors are scoped and expiring; they are not authorization grants.

## Work digest

`GET /api/sessions/{sessionId}/work/{workId}/actions` pages recorded ToolActions.
Work aggregates and counts are not inferred from a single page. `counts.notices` is the part of
`counts.byKind.commentary` SpecFlow wrote itself (an automatic approval, a relayed error), so a
client tells it from the agent's progress notes; it is absent for Turns counted before it existed.
An interaction Work carries `interaction` (`permission` or `question`), so a client never
infers the kind from a title. A step brief's request `origin` names its agent archetype (`archetype`) and the hand-off's step and
result by the workflow definition (`handoff.from.title`, `handoff.label`). For cursor, content and
ToolAction semantics, see
[Session history, Work and content](../../architecture/ai/session-history-and-events.md).

## Event stream

`GET /api/sessions/{sessionId}/events` streams committed Session updates and
invalidation signals as SSE. Clients must resynchronize from a snapshot after a replay gap.
See [event stream rules](../../architecture/ai/session-history-and-events.md#event-stream).

## Provider catalogue

`GET /api/session-providers` describes currently available providers, models and modes.
Selection remains subject to admission checks when starting execution.
For capability scopes and provider discovery, see
[Session authorization and providers](../../architecture/ai/session-admission-and-providers.md).

## Demo Runtime (read-only managed Sessions)

Demo Sessions are in-memory and do not execute native provider Turns. The shared read routes
expose their managed projections; unavailable mutations must not simulate successful execution.

Session telemetry uses [two additional operations](session-telemetry.md).
