---
id: architecture.runtime.authorization
type: architecture
title: Runtime authorization
status: current
scope: specflow
areas:
  - runtime
  - server
  - security
  - configuration
read_when:
  - adding or changing a SpecFlow capability
  - changing Runtime role composition or scoped assignments
  - enforcing access to specs, sessions, or settings
  - exposing effective capabilities to the UI
summary: >
  SpecFlow authorization uses feature-owned resources and capabilities, Runtime-owned flat roles,
  subject role assignments with optional domain-neutral scopes, canonical user identities, and
  request-bound enforcement. The generic resolver remains unaware of SpecFlow hierarchy and transport concerns.
related:
  - docs.architecture-runtime-auth-readme
  - architecture.runtime.ownership-and-lifecycle
  - reference.configuration.authorization
  - reference.api.authorization
---

# Runtime authorization

## Boundary

Authentication answers who the effective user is. Authorization answers what that user may do with
a resource in a required scope.

Authorization does not depend on whether identity came from password authentication, OIDC, or
trusted local mode. Provider-specific identifiers are resolved to the canonical
`authentication.users` id before authorization runs.

The generic authorization core is `@nevo/authorization`. It does not know SpecFlow resource
names, Fastify, React, OIDC, configuration files, persistence, or any product-specific scope
hierarchy.

SpecFlow resource and capability declarations live in `@nevo/specflow-contracts`, so Runtime and
UI can consume the same resource vocabulary without either depending on the other.

Runtime owns application role composition, assignment loading, effective-subject resolution, HTTP
integration, and backend enforcement boundaries.

## Feature ownership and composition

Product features own the capabilities they expose. Specs declares `spec.*`, Sessions declares
`session.*`, and Settings declares `settings.*`.

Auth does not import those feature definitions. The Runtime composition root creates feature modules,
collects their authorization resource definitions, defines the product role-to-capability policy, and injects
both the resource catalogue and role policy into Auth. Product features therefore do not depend on
global role names merely to expose their own capabilities.

Dependency direction is therefore:

```text
feature authorization resources
        ↓
Runtime composition
        ↓
Auth / Authorization evaluation
```

Product features may consume Auth's public request-authorization surface through
`features/auth/index.ts`. Auth must not depend back on product feature implementations.

## Model

Authorization has five distinct concepts:

- **subject** — the caller identity, currently `{ kind: "user", id }`;
- **resource** — the kind of object being authorized, such as `spec`, `session`, or `settings`;
- **capability** — an operation on that resource, such as `spec.view`;
- **role** — a SpecFlow-owned flat set of capabilities;
- **scope** — optional string dimensions limiting where a role assignment applies.

The current feature-owned resources are:

- `spec`: `spec.view`, `spec.create`, `spec.manage`;
- `session`: `session.view`, `session.create`, `session.manage`;
- `settings`: `settings.view`, `settings.manage`.

There is intentionally no `spec.list` capability. A Specs collection endpoint requires the subject
to possess `spec.view` in at least one scope, then filters rows with target-specific `spec.view`
checks for each concrete Spec. A subject with no `spec.view` grant receives `403`; a subject with
some `spec.view` grant may legitimately receive `200` with an empty collection when none of the
visible Specs belong to the requested collection.

## Roles and assignments

Roles contain capabilities only. They never contain scope.

An assignment connects a canonical user id, one role, and an optional scope:

```text
subject + role + optional scope
```

Omitted scope is normalized to `{}`, and `{}` means global access for the capabilities granted
by that role.

A user may have multiple assignments. Effective capabilities are the union of capabilities from
all assignments whose scopes cover the required scope.

There is no role inheritance, deny rule, wildcard capability, or precedence model. Authorization is
monotonic: matching assignments can add capabilities but cannot subtract them.

## Scope coverage semantics

Scope matching is directional. The primitive is:

```text
scopeCovers(possessedScope, requiredScope)
```

A possessed scope covers a required scope when every dimension in the possessed scope exists in the
required scope with the same value.

Examples:

```text
possessed {}                         required { specId: S1 }                 -> allow
possessed { specId: S1 }             required { specId: S1 }                 -> allow
possessed { specId: S1 }             required {}                             -> deny
possessed { tenantId: T1 }           required { tenantId: T1, itemId: I1 }   -> allow
possessed { tenantId: T1, itemId:I1 } required { tenantId: T1 }              -> deny
```

The core treats scope keys as domain-neutral identifier segments. Keys use the same safe identifier
shape as authorization resource/action identifiers: letters, digits, `_`, and `-`, starting with a
letter or digit. SpecFlow currently defines no mandatory `projectId` or other parent chain. If future
product concepts introduce dimensions such as `workspaceId`, `tenantId`, or `specId`, they remain
data supplied to the same coverage rule.

Wildcard scope values are not part of the current model. Multiple bounded areas are represented by
multiple assignments.

## Request-bound authorization

Runtime installs authorization context at the Runtime Fastify composition root, resolves
authentication/session state once per request, and exposes:

```text
request.authz
```

`request.authz` provides the normal application API:

```text
can(...)
require(...)
hasCapabilityInAnyScope(...)
requireCapabilityInAnyScope(...)
resolveCapabilities(...)
filterByCapability(...)
withCapabilities(...)
```

Target-specific `can/require` always evaluate a concrete required scope. The any-scope pair answers
a different backend question: whether the subject possesses that capability in at least one scope.
It never widens a scoped grant into global access and is intended for collection-entry checks where
row visibility is enforced separately.

Product routes are registered normally at the Runtime composition root and do not receive cookie
names, `AuthenticationStore`, or session-resolution helpers. They are not nested inside the Auth feature just
to inherit authorization state.

`requireCapability(...)` is the standard Fastify pre-handler for route-known scopes. It verifies
that authentication access exists before invoking an async scope resolver, so unauthenticated
requests do not trigger domain/database work. When the trusted scope is only available after loading
domain data as part of the application operation, code uses the imperative
`request.authz.require(...)` escape hatch against that loaded entity.

## Capability projection

The generic resolver internally continues to use canonical capability ids such as `spec.view`.

HTTP/UI projection exposes action booleans for a concrete resource and scope. Projection types and
schemas live in `@nevo/specflow-contracts`, so Runtime and UI consume the same exact per-resource
action shape:

```json
{
  "view": true,
  "create": false,
  "manage": true
}
```

This is a projection of effective capabilities, not a security authority. Backend operations always
enforce their required capability independently.

`withCapabilities(value, targets)` can attach multiple named authorization targets to a product
read model. Target names belong to that read model rather than to the generic authorization model,
so the same resource may appear more than once at different scopes.

## Effective subject

Runtime derives authorization access from the authentication mode:

```text
runtime.authentication.mode=required
  authenticated session -> canonical session user

runtime.authentication.mode=none + localUserId
  -> canonical localUserId

runtime.authentication.mode=none + no localUserId
  -> access control disabled
```

Disabled access control is a Runtime integration rule. The generic resolver does not fabricate an
anonymous subject. Request authorization simply treats all registered capabilities for a requested
resource as effective.

## HTTP errors

Protected operations use:

```text
no effective subject                  -> 401 authentication_required
effective subject lacks capability    -> 403 forbidden
```

Capability discovery is different: a missing capability is represented by `false` in a successful
`200` response. The discovery endpoint is asking what the current subject may do; it is not itself
an operation requiring every reported capability.

Runtime maps authorization request errors through the server-owned HTTP error policy and uses
`Cache-Control: no-store`. The same Runtime boundary preserves status codes and response headers for
unrelated Fastify/domain errors; authorization does not define their fallback behavior.

## Trusted enforcement scope

The resolver treats a supplied required scope as data. It does not prove relationships between
domain identifiers.

For an existing resource, backend enforcement therefore constructs required scope from trusted
server-side/domain data whenever relationships matter. Route/body values may be used when they
already are the authoritative target dimensions; loading a domain entity first is the escape hatch
when they are not.

The capability-discovery endpoint accepts client-supplied scope because its result is advisory UI
data. That scope must never be reused as proof for a later privileged operation.

## Resource-definition invariant

The generic core validates resource definitions during composition.

For every resource:

- `actions` and `capabilities` contain the same keys;
- each capability id is the canonical `<resource>.<action>` id for its explicit action;
- role capabilities reference registered capabilities;
- assignments reference registered roles.

`can()` also fails fast when a supplied capability belongs to a different resource instead of
turning a caller error into an ordinary authorization denial.

## Current implementation boundary

The current foundation provides:

- generic directional scope coverage;
- SpecFlow resource/capability contracts;
- Runtime flat roles and optional scoped assignments;
- effective-subject resolution;
- request-bound authorization helpers;
- centralized 401/403 mapping;
- boolean capability discovery for UI use;
- in-memory collection filtering and named capability projection helpers;
- Specs Overview filtering through the request authorization facade.

Persistence-side grant resolution/query filtering remains a future extension. When required, it
should expose authorization scopes to a repository adapter rather than introduce persistence or SQL
knowledge into `@nevo/authorization`.
