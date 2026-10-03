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
  project-owned scoped role assignments, canonical user identities, and explicit resource scopes.
  The generic resolver remains unaware of SpecFlow hierarchy and transport concerns.
related:
  - docs.architecture-runtime-auth-readme
  - architecture.runtime.ownership-and-lifecycle
  - reference.configuration.authorization
  - reference.api.authorization
---

# Runtime authorization

## Boundary

Authentication answers who the effective user is. Authorization answers what that user may do with
a resource in a scope.

Authorization does not depend on whether identity came from password authentication, OIDC, or
trusted local mode. Provider-specific identifiers are resolved to the canonical `auth.users` id
before authorization runs.

The generic authorization core is `@nevo/authorization`. It does not know SpecFlow resource names,
Fastify, React, OIDC, configuration files, or persistence.

SpecFlow resource and capability declarations live in `@nevo/specflow-contracts`, so Runtime and
UI can consume the same identifiers without either depending on the other.

Runtime owns:

- application role composition;
- assignment loading and validation;
- effective-subject resolution;
- HTTP integration;
- backend enforcement boundaries.

## Model

Authorization has five distinct concepts:

- **subject** — the caller identity, currently `{ kind: "user", id }`;
- **resource** — the kind of object being authorized, such as `spec`, `session`, or `settings`;
- **capability** — an operation on that resource, such as `spec.view`;
- **role** — a SpecFlow-owned flat set of capabilities;
- **scope** — the dimensions in which a role assignment applies.

Resource and scope are independent. A scope such as `{ projectId, specId }` does not identify
whether the caller is asking about a spec or a session, so every resolution request carries an
explicit resource name.

The current feature-owned resources are:

- `spec`: `spec.view`, `spec.create`, `spec.manage`;
- `session`: `session.view`, `session.create`, `session.manage`;
- `settings`: `settings.view`, `settings.manage`.

There is intentionally no `spec.list` capability. Spec collection visibility is expressed by
`spec.view` on each spec's canonical scope. This allows a user assigned only to one spec to see
that spec without requiring a broader project-level list grant.

## Roles and assignments

Roles are SpecFlow application composition, not generic authorization concepts. The current roles
are `viewer`, `developer`, and `admin`; their exact capability sets are listed in the
[configuration reference](../../../reference/configuration/authorization.md).

Roles are flattened before they reach the resolver. Array composition in Runtime code is only a
TypeScript convenience; the authorization model has no role inheritance and no wildcard
capabilities.

Assignments connect a canonical user id, one role, and one scope. A user may have multiple matching
assignments; effective capabilities are the union of all matching role capabilities, filtered to
the requested resource.

## Scope semantics

The generic core represents scope as string dimensions and uses subset matching:

> an assignment matches a resource scope when every assignment dimension exists in the resource
> scope with the same value.

Therefore a project assignment applies below that project, while a spec assignment applies only
where the matching `specId` is present.

SpecFlow validates assignment scopes before constructing the resolver. The accepted canonical
shapes are:

```text
{}
{ projectId }
{ projectId, specId }
{ projectId, specId, sessionId }
```

Scope holes such as `{ specId }` or `{ projectId, sessionId }` are rejected.

The generic resolver intentionally does not know this hierarchy.

## Canonical user identity

Authorization assignments reference the canonical key in project `runtime.auth.users`.

Password usernames, OIDC emails, display names, and other provider identifiers are authentication
inputs, not authorization subject ids.

Project assignments are validated against project-owned `runtime.auth.users` before local configuration is
merged. An assignment therefore cannot depend on a user that exists only in `.nevo/local/config.yaml`.

## Effective subject

Runtime derives authorization access from the auth mode:

```text
runtime.auth.mode=required
  authenticated session -> canonical session user

runtime.auth.mode=none + localUserId
  -> canonical localUserId

runtime.auth.mode=none + no localUserId
  -> access control disabled
```

Disabled access control is a Runtime integration rule. The generic resolver does not fabricate an
anonymous subject or grant anonymous permissions.

When access control is disabled, Runtime exposes all capabilities registered for the requested
resource.

## Trusted enforcement scope

The resolver treats the supplied scope as data; it does not verify domain relationships.

A backend enforcement decision for an existing resource therefore uses a canonical scope constructed
from trusted server-side domain data. Client-supplied `projectId`, `specId`, or `sessionId`
values are not reused as proof of ownership relationships.

The capability discovery endpoint accepts a client-supplied scope because its result is advisory UI
data. That request scope is not an enforcement authority.

## Resource-definition invariant

The generic core validates resource definitions during composition.

For every resource:

- `capabilities` and `capabilityIds` contain the same unique ids;
- each capability id belongs to the resource namespace, for example `spec.*` for resource
  `spec`;
- role capabilities reference registered capabilities;
- assignments reference registered roles.

`can()` also fails fast when the supplied capability belongs to a different resource instead of
treating that caller error as an ordinary authorization denial.

## Shared HTTP contract

Plain authorization request/response types live in `@nevo/specflow-contracts`. Runtime owns the
TypeBox schemas used by Fastify.

Bidirectional compile-time assertions keep the Runtime schemas assignable to the shared types and
the shared types assignable to the Runtime schemas.

The exact endpoint contract is documented in the
[authorization HTTP API reference](../../../reference/api/authorization.md).

## Current implementation boundary

The current foundation provides:

- generic scoped capability resolution;
- SpecFlow resource/capability contracts;
- Runtime roles and project assignments;
- canonical assignment validation;
- effective-subject resolution;
- the capability discovery HTTP endpoint.

Concrete domain enforcement, authorization-aware collection filtering, row capability projection,
and SpecFlow UI integration are not part of the current implementation. The remaining work is tracked
as a non-authoritative implementation backlog in
[authorization follow-ups](../../../ideas/authorization/README.md).
