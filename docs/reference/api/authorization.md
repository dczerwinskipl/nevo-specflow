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

## Resolve effective capabilities

```http
POST /api/authorization/capabilities
```

The request does not contain a subject. Runtime derives the effective subject from the current
authentication mode and session.

### Request

```json
{
  "resource": {
    "name": "spec",
    "scope": {
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

`scope` is optional. Omitting it means `{}`, the global required scope.

Scope is a domain-neutral object whose keys are safe identifier segments and whose values contain
at least one non-whitespace character. The current API does not require a `projectId` or any other parent chain.

### Success response

```json
{
  "resource": {
    "name": "spec",
    "scope": {
      "specId": "S1"
    }
  },
  "capabilities": {
    "view": true,
    "create": false,
    "manage": true
  }
}
```

The endpoint always returns every registered action for the requested resource as a boolean.
Runtime builds request/response validation from the feature resources supplied by the composition
root, so Auth does not maintain a second hard-coded resource catalogue. Consumers that know a
feature resource definition can use `CapabilityDiscoveryResponseFor<typeof ResourceCapabilities>`
to retain that resource's exact action keys.

A capability is `true` when at least one assignment granting it has a possessed scope that covers
the requested scope.

For example, a global assignment (`scope: {}` or omitted scope) can satisfy a request for
`{ "specId": "S1" }`. The reverse is intentionally false: an assignment limited to
`{ "specId": "S1" }` does not satisfy a request with omitted/global scope.

A missing capability is a normal `200` result with `false`; capability discovery itself does not
return `403` for denied actions.

### Authentication required

When `authentication.mode=required` has no authenticated session:

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

When `authentication.mode=none` has no `localUserId`, Runtime access control is disabled.

Every registered action for the requested resource is returned as `true`:

```json
{
  "capabilities": {
    "view": true,
    "create": true,
    "manage": true
  }
}
```

## Trust boundary

This endpoint is a UI capability helper.

Its client-supplied scope is not an enforcement authority. A backend operation builds its required
scope independently, using trusted domain data when relationships between identifiers matter.
