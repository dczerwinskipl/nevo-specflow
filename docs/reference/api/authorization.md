---
id: reference.api.authorization
type: reference
title: Authorization HTTP API
status: current
scope: specflow
areas:
  - server
  - runtime
  - security
read_when:
  - calling the Runtime capability endpoint
  - implementing SpecFlow UI capability discovery
  - checking the current authorization HTTP contract
summary: >
  Runtime capability discovery derives the current subject, accepts a resource and optional required
  scope, and returns a boolean action projection for that exact authorization target.
related:
  - architecture.runtime.authorization
  - reference.configuration.authorization
---

# Authorization HTTP API

Use `POST /api/authorization/capabilities` to determine which actions the caller can
perform for a resource and an optional scope. The response contains action booleans;
an unavailable capability is not automatically an HTTP authorization error.

The request, response, error codes and security scheme are specified by
[OpenAPI](openapi.md), operation `postAuthorizationCapabilities`.

For scope resolution, trusted identities and enforcement, see
[Runtime authorization](../../architecture/runtime/auth/authorization.md).
Role and assignment settings are in
[Authorization configuration](../configuration/authorization.md).
