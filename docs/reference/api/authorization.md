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
  Exact current Runtime capability-discovery endpoint. The server derives the subject, accepts an
  explicit resource name and scope, and returns effective capabilities for that resource only.
related:
  - architecture.runtime.authorization
  - reference.configuration.authorization
---

# Authorization HTTP API

## Resolve effective capabilities

```http
POST /api/authorization/capabilities
```

The request does not contain a subject. Runtime derives the effective subject from the current auth
mode and session.

### Request

```json
{
  "resource": {
    "name": "spec",
    "scope": {
      "projectId": "P1",
      "specId": "S1"
    }
  }
}
```

Current resource names are:

```text
spec
session
settings
```

`scope` is an object of non-empty string keys and values.

### Success response

```json
{
  "resource": {
    "name": "spec",
    "scope": {
      "projectId": "P1",
      "specId": "S1"
    }
  },
  "capabilities": [
    "spec.view",
    "spec.create",
    "spec.manage"
  ]
}
```

Only capabilities registered for the requested resource are returned.

For a spec-scoped viewer, the same request can return:

```json
{
  "resource": {
    "name": "spec",
    "scope": {
      "projectId": "P1",
      "specId": "S1"
    }
  },
  "capabilities": [
    "spec.view"
  ]
}
```

A project-level request does not implicitly discover more-specific assignments. For example, a user
who has only `viewer` at `{ projectId: "P1", specId: "S1" }` receives no capabilities for
`{ projectId: "P1" }`.

### Authentication required

When `auth.mode=required` has no authenticated session:

```http
401
```

```json
{
  "error": "authentication_required"
}
```

The endpoint sets `Cache-Control: no-store`.

### Disabled access control

When `auth.mode=none` has no `localUserId`, Runtime access control is disabled. The endpoint
returns all registered capabilities for the requested resource.

For resource `spec`, that is currently:

```text
spec.view
spec.create
spec.manage
```

## Trust boundary

This endpoint is for capability discovery, primarily for UI behavior.

The request scope is client supplied and is not a canonical authorization scope for later backend
enforcement. Operations on an existing domain resource rebuild the scope from trusted server-side
data before checking authorization.
