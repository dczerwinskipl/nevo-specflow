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

The wire contract is generated from the Runtime's TypeBox route schemas. See
[Runtime OpenAPI](openapi.md) and the operation
`postAuthorizationCapabilities` (`POST /api/authorization/capabilities`) in
[the committed OpenAPI 3.1 document](openapi.generated.json).

The generated operation documents identity resolution, optional scope, returned action booleans,
authorization responses and the difference between a denied action and a denied HTTP request.
The current resource catalogue comes from the feature-owned schemas, not this page.

For domain rules on scopes, role assignments, disabled access control and trusted enforcement,
read [Runtime authorization](../../architecture/runtime/auth/authorization.md). For role and
assignment configuration, see [Authorization configuration](../configuration/authorization.md).

This page preserves the stable documentation ID for discovery and links; it is not a second,
hand-maintained HTTP contract.
