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

> Who is the effective current user, if this Runtime mode has one?

Authorization answers:

> What can this subject do with this resource in this scope?

The existing auth slice should remain responsible only for identity/session concerns.

Authorization must not be embedded into the auth user contract itself. Runtime derives an
**effective subject** from the auth mode and passes that subject to authorization.

The initial Runtime rule is:

```text
auth.mode=required
  -> effective subject = authenticated session user

auth.mode=none + localUserId
  -> effective subject = configured localUserId

auth.mode=none + no localUserId
  -> no effective subject; Runtime access control is disabled
```

The third case preserves the existing trusted/no-login Runtime behavior. It must not accidentally
turn into "anonymous user has zero permissions" when authorization enforcement is introduced.

When access control is disabled, Runtime bypasses authorization enforcement and exposes all
registered capabilities for the requested resource to the UI. This bypass is a Runtime integration
rule, not behavior built into the generic `@nevo/authorization` resolver.

When an effective user exists, its id is the canonical key from `auth.users`. Provider identifiers
are only authentication inputs:

```text
password account username -> auth.users user id
OIDC email                -> auth.users user id
localUserId               -> auth.users user id
```

A password username, OIDC email, or display name must never be used as the authorization subject id.

The generic subject shape should be explicit even though only users are supported initially:

```ts
{
  kind: "user",
  id: "user-1",
}
```

Keeping `kind` in the core model avoids future identifier collisions if service or agent subjects
are added later.

## Package boundaries

Create a framework-independent generic package:

```text
packages/authorization/
  @nevo/authorization
```

The package should not depend on:

- Fastify;
- React;
- SpecFlow Runtime;
- SpecFlow UI;
- SpecFlow resource names;
- OIDC;
- HTTP;
- persistence.

It should contain only the authorization model, validation/composition helpers, resource-definition
helper, and resolver logic.

SpecFlow-specific resource/capability definitions need a separate shared product boundary so Runtime
and UI can import the same constants without either depending on the other:

```text
packages/specflow-contracts/
  @nevo/specflow-contracts
    src/spec/authorization.ts
    src/session/authorization.ts
    src/settings/authorization.ts
```

The initial package may contain only authorization declarations. It does not need to become a broad
API-contract package in the same change.

Dependency direction:

```text
@nevo/authorization
        ↑
@nevo/specflow-contracts
      ↑             ↑
specflow-runtime  specflow-ui
```

SpecFlow Runtime additionally depends directly on `@nevo/authorization` for resolution and
enforcement.

SpecFlow Runtime owns role composition, assignment loading, server integration, and enforcement.

SpecFlow UI owns React integration and presentation helpers.

Do not create generic `/server` or `/react` subpackages until reuse demonstrates that they are
needed.

## Resource definitions belong to features

A vertical slice defines its own resource and capabilities.

When a definition must be shared between Runtime and UI, its physical home is the corresponding
feature folder inside `@nevo/specflow-contracts`. This keeps ownership with the feature while
avoiding both backend-to-frontend dependencies and duplicated string constants.

For example:

```text
packages/specflow-contracts/src/spec/authorization.ts
packages/specflow-contracts/src/session/authorization.ts
packages/specflow-contracts/src/settings/authorization.ts
```

For example, the spec feature owns something equivalent to:

```ts
// @nevo/specflow-contracts/spec
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
    kind: "user",
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

At the generic package level:

```ts
{
  subject: {
    kind: "user",
    id: "user-1",
  },
  role: "developer",
  scope: {
    projectId: "P1",
  },
}
```

For SpecFlow, the user id is always the canonical `auth.users` key.

A user may have multiple assignments.

The effective result is the union of capabilities from all matching assignments.

### Initial SpecFlow assignment source

Assignments should have one concrete initial source: the project configuration
`nevo-specflow.yaml`, under a top-level `authorization` section.

The initial shape should support scope even if the first real assignments are global:

```yaml
authorization:
  assignments:
    - userId: demo-user
      role: admin
      scope: {}
```

A scoped example:

```yaml
authorization:
  assignments:
    - userId: demo-user
      role: developer
      scope:
        projectId: P1
```

`userId` must reference an existing `auth.users.<userId>`. Runtime validates this at startup and
converts it to the generic subject `{ kind: "user", id: userId }`.

Role definitions themselves remain application code, not configuration. The initial SpecFlow role
composition should live under the Runtime authorization composition boundary, for example
`packages/specflow-runtime/src/authorization/roles.ts`.

Authorization assignments are not secrets and should not be mixed into password/OIDC provider
mappings. If local override semantics are needed later, they should be specified explicitly rather
than inherited accidentally from generic config merge behavior.

The generic authorization package must not own persistence or the SpecFlow config file format.

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

## Trusted canonical scope

The generic resolver deliberately does not discover domain relationships. It assumes the supplied
scope is already canonical.

That makes scope construction a backend trust boundary.

For enforcement on an existing resource, the feature must load the real domain resource and build
scope from trusted server-side data.

For example, this is unsafe:

```ts
// Client claims S1 belongs to P1.
can({
  subject,
  capability: SpecAuthorization.capabilities.Manage,
  resource: {
    name: "spec",
    scope: request.body.scope,
  },
});
```

If `S1` really belongs to `P2`, a user with developer rights on `P1` could otherwise obtain a
false positive.

The enforcement path must instead be equivalent to:

```ts
const spec = await specRepository.get(specId);

const canonicalScope = {
  projectId: spec.projectId,
  specId: spec.id,
};

can({
  subject,
  capability: SpecAuthorization.capabilities.Manage,
  resource: {
    name: SpecAuthorization.name,
    scope: canonicalScope,
  },
});
```

For collection/create operations, the backend likewise constructs scope from trusted container
context after validating the referenced container, for example the real project selected by the
request.

The generic resolver may accept any structurally valid scope because it is a pure library. The
caller owns canonicalization.

The HTTP capability endpoint is advisory data for UI rendering. A client-provided scope from that
endpoint must never be reused as the canonical scope for a later mutation or other backend
enforcement decision.

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
    kind: "user",
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
    kind: "user",
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

`can()` should fail fast on a structurally inconsistent request. For example,
`capability: "session.manage"` together with `resource.name: "spec"` is a caller/configuration
error, not an ordinary authorization denial.

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

The subject is never accepted from request data. Runtime derives the effective subject according to
the auth-mode rules above.

The scope supplied by this UI-oriented endpoint is not a trusted enforcement scope. Existing-resource
enforcement must rebuild canonical scope from domain data.

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

When `auth.mode=none` has no `localUserId`, Runtime access control is disabled and this endpoint
returns all registered capabilities for the requested resource. The generic resolver is not invoked
with a fabricated anonymous subject.

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
    kind: "user",
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
    kind: "user",
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

The initial sources are intentionally concrete:

- resource/capability definitions: `@nevo/specflow-contracts`, organized by feature;
- SpecFlow role definitions: Runtime application composition code;
- role assignments: top-level `authorization.assignments` in `nevo-specflow.yaml`;
- user identity referenced by an assignment: canonical `auth.users` user id.

This keeps the migration path open to database-backed assignments or an admin UI later without
changing feature capability definitions or the core resolver contract.

## Validation expectations

The composition step should fail early on invalid configuration.

At minimum, validate:

- duplicate resource names;
- duplicate capability ids;
- roles referencing unknown capabilities;
- assignments referencing unknown roles;
- SpecFlow assignments referencing unknown `auth.users` ids;
- malformed scope values;
- capability/resource mismatches passed to `can()`.

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
  subject: { kind: "user", id: "user-1" },
  resource: {
    name: Spec.name,
    scope: {
      projectId: "P1",
      specId: "S1",
    },
  },
});

authorization.can({
  subject: { kind: "user", id: "user-1" },
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

1. Add `@nevo/authorization` with resource definition, role validation, scoped assignments,
   `resolveCapabilities`, and `can`.
2. Add unit tests for global scope, project scope, more-specific resource scope, multiple assignments,
   role union, resource filtering, mismatch failures, and invalid configuration.
3. Add `@nevo/specflow-contracts` and define SpecFlow resources/capabilities there in feature
   folders.
4. Add central Runtime role composition for `viewer`, `developer`, and `admin`.
5. Extend Runtime config with top-level `authorization.assignments`; validate role names and
   canonical `auth.users` ids.
6. Add effective-subject resolution for `auth.mode=required`, `auth.mode=none + localUserId`,
   and explicit no-access-control behavior for `auth.mode=none` without `localUserId`.
7. Integrate the resolver into SpecFlow Runtime request handling with canonical scope built by each
   feature from trusted domain data.
8. Add `POST /api/authorization/capabilities` as an advisory UI capability endpoint.
9. Add backend enforcement for the first protected operations.
10. Add effective capabilities to spec/session DTOs where row-level actions are needed.
11. Filter resources that the current user cannot view.
12. Add thin SpecFlow UI helpers/hooks for consuming returned capabilities from
    `@nevo/specflow-contracts`.
13. Add integration tests proving backend denial, auth-mode behavior, canonical-scope enforcement,
    and UI capability contracts use the same definitions.

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
- `auth.mode=required` uses the authenticated canonical user id;
- `auth.mode=none + localUserId` uses that canonical configured user id;
- `auth.mode=none` without `localUserId` explicitly bypasses access control and exposes all
  capabilities for the requested resource;
- a client-forged scope cannot authorize an existing resource because enforcement rebuilds canonical
  scope from domain data;
- capability endpoint returns only the requested resource's capabilities;
- protected endpoints return forbidden when capability is absent;
- capability/resource mismatches fail as caller/configuration errors rather than normal denials.

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
client-provided scope != canonical enforcement scope
```

Also preserve these decisions:

- resource name is explicit in resolution requests;
- scope is a multi-dimensional object;
- empty scope is global;
- features own resource/capability definitions in the SpecFlow shared contracts boundary;
- the application owns roles and assignments;
- SpecFlow assignments reference canonical `auth.users` ids;
- Runtime owns effective-subject resolution for each auth mode;
- enforcement scope is rebuilt from trusted domain data;
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
