---
id: ideas.authorization.foundation
type: idea
title: Authorization capabilities foundation
status: draft
scope: shared
areas:
  - runtime
  - server
  - ui
tags:
  - authorization
  - capabilities
  - roles
  - scope
read_when:
  - implementing authorization in SpecFlow
  - adding role-based capabilities
  - exposing effective permissions to the UI
  - adding scoped access to specs or sessions
summary: >
  Proposed lightweight authorization foundation for SpecFlow: feature-owned resource/capability
  definitions, application-owned roles, scoped role assignments, backend capability resolution,
  per-resource enforcement, and UI consumption of effective capabilities without a policy engine.
related:
  - ideas.readme
  - architecture.runtime.ownership-and-lifecycle
---

# Authorization capabilities foundation

## Status

This document captures the agreed implementation direction before code is written.

It is deliberately a small authorization model. The goal is to support the current SpecFlow
dashboard cleanly while keeping the core reusable for larger applications with many resource types,
tenants, projects, and resource-level permissions.

This is not intended to become a policy engine.

## Goals

The first implementation should support:

- authentication and authorization as separate concerns;
- application-defined roles such as `viewer`, `developer`, and `admin`;
- feature-owned resource and capability definitions;
- mapping roles to capabilities in the application composition root;
- assigning roles to users together with a scope;
- resolving effective capabilities for a specific resource and scope;
- enforcing capabilities on the backend;
- returning effective capabilities to the UI;
- adding capabilities to list rows without leaking unrelated capabilities;
- future scoped authorization without changing the public model.

The design should remain useful outside SpecFlow. A future ERP-style application should be able to
reuse the same package with different resources, roles, capabilities, and scope dimensions.

## Non-goals

The first implementation should not add:

- Cerbos, OpenFGA, Permit, OPA, Casbin, or another external policy engine;
- a separate authorization service or deployment;
- a policy language;
- role inheritance as part of the authorization model;
- wildcard capabilities such as `*`;
- a permission-management UI;
- persistence for roles or assignments;
- relationship graphs;
- ABAC expressions;
- automatic SQL/query-plan generation;
- direct per-user capability grants;
- deny rules.

Those can be reconsidered only if real requirements justify them.

## Core concepts

The model has five independent concepts:

1. **Subject**: who is asking, initially a user.
2. **Resource**: what kind of thing is being authorized, for example `spec` or `session`.
3. **Capability**: what can be done with that resource, for example `spec.view`.
4. **Role**: an application-owned named set of capabilities.
5. **Scope**: where a role assignment applies.

The important separation is:

```text
feature -> resource + capability definitions
application -> roles composed from capabilities
runtime/config -> subject + role + scope assignments
backend -> resolve and enforce
UI -> consume effective capabilities
```

## Authentication boundary

Authentication answers:

> Who is the current user?

Authorization answers:

> What can this user do with this resource in this scope?

The existing auth slice should remain responsible only for identity/session concerns.

Authorization should consume the authenticated user id but should not be embedded into the auth user
contract itself.

For example, the current session identity can stay conceptually equivalent to:

```ts
{
  id: "user-1",
  name: "Dominik"
}
```

Roles and capabilities are resolved separately.

## Package boundary

Create a framework-independent product package:

```text
packages/authorization/
  @nevo/authorization
```

The package should not depend on:

- Fastify;
- React;
- SpecFlow Runtime;
- SpecFlow UI;
- OIDC;
- HTTP;
- persistence.

It should contain only the authorization model, validation/composition helpers, and resolver logic.

SpecFlow Runtime owns the server integration and enforcement.

SpecFlow UI owns React integration and presentation helpers.

Do not create generic `/server` or `/react` subpackages until reuse demonstrates that they are
needed.

## Resource definitions belong to features

A vertical slice defines its own resource and capabilities.

For example, the spec feature owns something equivalent to:

```ts
export const SpecAuthorization = defineResource({
  name: "spec",
  capabilities: [
    "list",
    "view",
    "create",
    "manage",
  ],
});
```

The helper may expose fully-qualified capability ids:

```ts
SpecAuthorization.capabilities.List   // "spec.list"
SpecAuthorization.capabilities.View   // "spec.view"
SpecAuthorization.capabilities.Create // "spec.create"
SpecAuthorization.capabilities.Manage // "spec.manage"
```

Likewise, the session feature can define:

```ts
export const SessionAuthorization = defineResource({
  name: "session",
  capabilities: [
    "create",
    "view",
    "manage",
  ],
});
```

A feature must not know which application roles exist.

In particular, the spec feature must not contain logic such as:

```ts
viewer -> spec.view
developer -> spec.manage
admin -> spec.manage
```

That mapping belongs to application composition.

## Why resource name is explicit

The resolver must always know which resource is being queried.

A scope alone is not enough.

For example:

```ts
{
  projectId: "P1",
  specId: "S1"
}
```

could be relevant to both:

- `spec.manage`;
- `session.create`.

When asking for capabilities for a spec row, returning `session.create` is noise.

Therefore the resolver input must explicitly contain the resource name.

Example:

```ts
resolveCapabilities({
  subject: {
    id: "user-1",
  },
  resource: {
    name: "spec",
    scope: {
      projectId: "P1",
      specId: "S1",
    },
  },
});
```

The result contains only capabilities registered for resource `spec`.

## Roles belong to the application

The authorization package must not contain roles such as:

- `viewer`;
- `developer`;
- `admin`.

SpecFlow defines those centrally and imports capabilities from its features.

Conceptually:

```ts
const specReadCapabilities = [
  SpecAuthorization.capabilities.List,
  SpecAuthorization.capabilities.View,
];

const viewerCapabilities = [
  ...specReadCapabilities,
];

const developerCapabilities = [
  ...specReadCapabilities,
  SpecAuthorization.capabilities.Create,
  SpecAuthorization.capabilities.Manage,
  SessionAuthorization.capabilities.Create,
  SessionAuthorization.capabilities.View,
  SessionAuthorization.capabilities.Manage,
];

const adminCapabilities = [
  ...developerCapabilities,
  SettingsAuthorization.capabilities.View,
  SettingsAuthorization.capabilities.Manage,
];

export const SpecFlowRoles = {
  viewer: viewerCapabilities,
  developer: developerCapabilities,
  admin: adminCapabilities,
};
```

This composition is plain application code.

It is not authorization-level inheritance.

The library receives flattened role definitions.

The application may use local constants or array spreads to avoid repetition, but the resolver must
not implement parent/child role semantics.

## No wildcard admin role

Do not define:

```text
admin -> *
```

The UI and backend need concrete effective capabilities.

An admin role should therefore be composed explicitly from the capabilities it receives.

This also makes additions reviewable: adding a new capability does not silently grant it to every
admin unless the application role definition says so.

## Scope model

Scope is an object of dimensions.

It is not modeled as:

```ts
{
  type: "project",
  id: "P1",
}
```

Instead:

```ts
{
  projectId: "P1"
}
```

or:

```ts
{
  tenantId: "T1",
  projectId: "P1",
  specId: "S1"
}
```

The first implementation can restrict values to scalar strings:

```ts
type Scope = Readonly<Record<string, string>>;
```

The shape intentionally allows additional dimensions later.

Do not introduce arrays, predicates, or complex values until a real requirement needs them.

### Global scope

An empty scope means global:

```ts
{}
```

Scope should be required on assignments so that global access is explicit rather than represented
by an omitted or undefined value.

## Role assignments

A role assignment connects:

- a subject;
- an application-defined role;
- a scope.

Example:

```ts
{
  subjectId: "user-1",
  role: "developer",
  scope: {
    projectId: "P1",
  },
}
```

Another example:

```ts
{
  subjectId: "user-1",
  role: "viewer",
  scope: {
    projectId: "P2",
  },
}
```

A user may have multiple assignments.

The effective result is the union of capabilities from all matching assignments.

For the first SpecFlow implementation, assignments may come from hardcoded/static configuration.
The authorization package must not own their persistence.

## Scope matching rule

An assignment applies to a requested resource scope when every dimension in the assignment scope is
present with the same value in the requested scope.

Examples:

```text
assignment scope: {}
request scope:    { projectId: P1, specId: S1 }
result:           matches
```

```text
assignment scope: { projectId: P1 }
request scope:    { projectId: P1, specId: S1 }
result:           matches
```

```text
assignment scope: { projectId: P2 }
request scope:    { projectId: P1, specId: S1 }
result:           does not match
```

This gives natural downward application without introducing an explicit resource hierarchy into the
authorization package.

The domain supplies the effective scope of the resource.

For example, when resolving a session, the Runtime already knows:

```ts
{
  projectId: "P1",
  specId: "S1",
  sessionId: "SE1",
}
```

The authorization package does not need to discover that `SE1` belongs to `S1`.

## Core resolver API

Prefer one object-shaped request.

Do not use positional APIs such as:

```ts
resolveCapabilities(user, "spec", scope)
```

The target shape is conceptually:

```ts
resolveCapabilities({
  subject: {
    id: "user-1",
  },
  resource: {
    name: "spec",
    scope: {
      projectId: "P1",
      specId: "S1",
    },
  },
});
```

A result can remain small:

```ts
{
  capabilities: [
    "spec.view",
    "spec.manage",
  ],
}
```

The resolver should:

1. load/find assignments for the subject;
2. keep assignments whose scopes match the requested scope;
3. expand the matching roles to their flattened capabilities;
4. deduplicate capabilities;
5. keep only capabilities belonging to the requested resource name;
6. return the effective set.

Global assignments participate because `{}` matches any requested scope.

However, resource filtering still applies. A request for resource `spec` must not return
`settings.view` or `session.create`.

## Server-side check API

The same core should support a direct check built on the same resolution semantics:

```ts
can({
  subject: {
    id: "user-1",
  },
  capability: SpecAuthorization.capabilities.Manage,
  resource: {
    name: "spec",
    scope: {
      projectId: "P1",
      specId: "S1",
    },
  },
});
```

The backend remains the security boundary.

UI visibility is never a substitute for server enforcement.

## HTTP capability endpoint

SpecFlow Runtime should expose a small endpoint backed by the same resolver.

Candidate contract:

```http
POST /api/authorization/capabilities
```

Request:

```json
{
  "resource": {
    "name": "spec",
    "scope": {
      "projectId": "P1"
    }
  }
}
```

The subject must come from the authenticated server session, not from user-controlled request data.

Response:

```json
{
  "resource": {
    "name": "spec",
    "scope": {
      "projectId": "P1"
    }
  },
  "capabilities": [
    "spec.list",
    "spec.view",
    "spec.create",
    "spec.manage"
  ]
}
```

The exact response envelope can be adjusted during implementation, but these semantics should stay:

- subject is server-derived;
- resource name is explicit;
- scope is explicit;
- only effective capabilities for that resource are returned.

If a page needs capabilities for another resource such as `settings`, it resolves that resource
separately. Do not return every capability for every resource in one undifferentiated list.

## Page-level usage

For the Specs page in project `P1`, the UI may request:

```json
{
  "resource": {
    "name": "spec",
    "scope": {
      "projectId": "P1"
    }
  }
}
```

That result can drive page-level actions such as:

- whether specs can be listed;
- whether a new spec can be created.

Global navigation permissions such as settings belong to their own resource, for example
`settings`, and should be resolved independently or included in an application bootstrap endpoint
later if the UI proves that useful.

Do not make the core authorization package aware of navigation.

## Per-row capabilities

List endpoints should return effective capabilities for each row when row-level actions differ.

For example:

```json
{
  "items": [
    {
      "id": "S1",
      "name": "Auth foundation",
      "capabilities": [
        "spec.view",
        "spec.manage"
      ]
    },
    {
      "id": "S2",
      "name": "Other spec",
      "capabilities": [
        "spec.view"
      ]
    }
  ]
}
```

Each row is resolved using resource `spec` and that row's effective scope:

```ts
{
  name: "spec",
  scope: {
    projectId: "P1",
    specId: "S1",
  },
}
```

Because resource name is explicit, the row does not receive unrelated capabilities such as
`session.create`.

The first implementation does not need a public API called `resolveCapabilitiesMany`.

The Runtime may iterate internally, cache subject assignments for the request, or later introduce an
optimized batch implementation without changing the conceptual contract.

If batching becomes public, it should still use object-shaped resource queries with explicit
`resource.name`; it must never infer resource type from scope shape.

## Filtering list data

A list endpoint must not rely only on UI hiding.

Resources the user cannot view should not be returned.

For example, before returning specs, the Runtime should ensure that each returned row has
`spec.view`.

For the current SpecFlow scale, this may be implemented by resolving/filtering in application code.

Generic database predicate generation is intentionally out of scope for the first authorization
package.

If future applications need efficient authorization-aware database queries over very large datasets,
that should be designed as a separate concern rather than pre-emptively turning this package into a
policy/query engine.

## Session example

Creating a session inside spec `S1`:

```ts
resolveCapabilities({
  subject: {
    id: "user-1",
  },
  resource: {
    name: "session",
    scope: {
      projectId: "P1",
      specId: "S1",
    },
  },
});
```

This can return:

```text
session.create
```

For an existing session:

```ts
resolveCapabilities({
  subject: {
    id: "user-1",
  },
  resource: {
    name: "session",
    scope: {
      projectId: "P1",
      specId: "S1",
      sessionId: "SE1",
    },
  },
});
```

The same model can later support different assignments at project, spec, or session level.

## UI responsibilities

SpecFlow UI receives effective capabilities.

It must not:

- map roles to capabilities;
- interpret role hierarchy;
- decide scope inheritance;
- trust client-side checks for security.

Typical usage should stay simple:

```ts
const canCreate = capabilities.includes(
  SpecAuthorization.capabilities.Create,
);
```

or a local UI helper:

```ts
can(capabilities, SpecAuthorization.capabilities.Create)
```

A React hook/component may be added inside SpecFlow UI if it improves ergonomics, but it should
remain a thin consumer of server-produced capability data.

Do not move role resolution into React.

## Initial SpecFlow roles

The first implementation uses three application roles:

```text
viewer
developer
admin
```

The exact capability sets should be assembled from feature definitions during implementation.

Expected intent:

- `viewer`: read-only access;
- `developer`: normal SpecFlow work such as creating/managing specs and sessions;
- `admin`: developer capabilities plus administrative/settings capabilities.

These role names and meanings belong to SpecFlow, not to `@nevo/authorization`.

## Initial storage/configuration

The first version does not need permission management.

Role definitions and role assignments may be static/hardcoded or loaded from simple local
configuration.

The important boundary is that the package consumes them through its configuration/provider surface
rather than owning their storage format.

This keeps the migration path open to:

- JSON/YAML configuration;
- database-backed assignments;
- an admin UI;
- tenant-aware assignments.

None of those are required now.

## Validation expectations

The composition step should fail early on invalid configuration.

At minimum, validate:

- duplicate resource names;
- duplicate capability ids;
- roles referencing unknown capabilities;
- assignments referencing unknown roles;
- malformed scope values.

A typo in `spec.manage` should be caught during application startup/composition rather than silently
becoming a permission that never matches.

## Suggested package-level API

This is illustrative rather than a locked TypeScript signature:

```ts
const Spec = defineResource({
  name: "spec",
  capabilities: ["list", "view", "create", "manage"],
});

const authorization = createAuthorization({
  resources: [
    Spec,
    Session,
    Settings,
  ],
  roles: SpecFlowRoles,
  assignments: assignmentProvider,
});

authorization.resolveCapabilities({
  subject: { id: "user-1" },
  resource: {
    name: Spec.name,
    scope: {
      projectId: "P1",
      specId: "S1",
    },
  },
});

authorization.can({
  subject: { id: "user-1" },
  capability: Spec.capabilities.Manage,
  resource: {
    name: Spec.name,
    scope: {
      projectId: "P1",
      specId: "S1",
    },
  },
});
```

The implementation should optimize for readable call sites and strong TypeScript inference without
making resource/capability identifiers library-owned enums.

## Suggested implementation order

1. Add `@nevo/authorization` with resource definition, role definition/composition validation,
   scoped assignments, `resolveCapabilities`, and `can`.
2. Add unit tests for global scope, project scope, more-specific resource scope, multiple assignments,
   role union, resource filtering, and invalid configuration.
3. Define SpecFlow resources/capabilities in their owning vertical slices.
4. Add central SpecFlow role composition for `viewer`, `developer`, and `admin`.
5. Add the initial static assignment source.
6. Integrate the resolver into SpecFlow Runtime request handling.
7. Add `POST /api/authorization/capabilities`.
8. Add backend enforcement for the first protected operations.
9. Add effective capabilities to spec/session DTOs where row-level actions are needed.
10. Filter resources that the current user cannot view.
11. Add thin SpecFlow UI helpers/hooks for consuming returned capabilities.
12. Add integration tests proving backend denial and UI capability contracts use the same definitions.

## Required tests

The initial package should explicitly prove:

### Scope matching

- global assignment `{}` applies to project/spec/session scopes;
- project assignment applies to resources below that project;
- project assignment does not apply to another project;
- spec assignment applies to the matching spec/session scope;
- more-specific assignment does not leak into sibling resources.

### Resource filtering

A role may contain:

```text
spec.view
spec.manage
session.create
settings.view
```

Resolving resource `spec` returns only:

```text
spec.view
spec.manage
```

### Role composition

- multiple matching assignments union capabilities;
- duplicate capabilities are returned once;
- unknown roles fail configuration/initialization;
- no wildcard behavior exists.

### Backend contract

- request subject cannot be supplied/spoofed by the client;
- unauthenticated requests follow the Runtime auth policy;
- capability endpoint returns only the requested resource's capabilities;
- protected endpoints return forbidden when capability is absent.

### List behavior

- invisible resources are omitted;
- visible rows contain only capabilities for their own resource;
- a row with `view` but without `manage` remains visible and read-only.

## Design constraints to preserve during implementation

Do not accidentally collapse these concepts:

```text
role != capability
resource != scope
authentication != authorization
UI visibility != backend enforcement
feature capability definition != application role composition
```

Also preserve these decisions:

- resource name is explicit in resolution requests;
- scope is a multi-dimensional object;
- empty scope is global;
- features own resource/capability definitions;
- the application owns roles and assignments;
- role inheritance is not part of the model;
- wildcard capabilities are not part of the model;
- the backend resolves effective capabilities;
- UI consumes effective capabilities;
- no external policy engine is introduced for the current requirements.

## Future extension points

The design should make these possible without implementing them now:

- tenant scope alongside project/spec/session scope;
- database-backed assignments;
- permission-management UI;
- request batching;
- request-local caching;
- service/agent subjects;
- richer scope values if required;
- optimized authorization-aware database filtering;
- replacing the internal resolver behind the application boundary if requirements eventually justify
  a dedicated authorization engine.

These are extension points, not current requirements.
