---
id: reference.configuration.authorization
type: reference
title: Authorization configuration
status: current
scope: specflow
areas:
  - configuration
  - runtime
  - security
read_when:
  - configuring SpecFlow authorization assignments
  - checking valid roles or assignment scopes
  - diagnosing Runtime authorization startup failures
summary: >
  SpecFlow authorization assigns built-in roles to configured users. Assignment scope is optional,
  domain-neutral, and defaults to global access for the capabilities in the assigned role.
related:
  - architecture.runtime.authorization
  - reference.api.authorization
---

# Authorization configuration

Authorization policy is configuration under `runtime.authorization` in `.nevo/config.yaml`.

`.nevo/local/config.yaml` must not contain a `runtime.authorization` section. Runtime rejects a
local authorization section during config loading.

## Shape

The normal current configuration is global and does not need a scope:

```yaml
runtime:
  authorization:
    assignments:
      - userId: demo-user
        role: developer
```

Each assignment has:

- `userId`: canonical `runtime.authentication.users.<userId>` key;
- `role`: one of `viewer`, `developer`, `admin`;
- optional `scope`: non-empty string dimensions limiting where that role applies.

`userId` must exist in the configured `runtime.authentication.users` section. A user introduced
only by local config cannot be referenced by an authorization assignment.

## Scope

Omitted scope is equivalent to:

```yaml
scope: {}
```

and means global access for the capabilities in that role.

Scope keys are deliberately domain-neutral but must be safe identifier segments: letters, digits,
`_`, and `-`, starting with a letter or digit. This rejects prototype-sensitive or ambiguous object
keys. For example, if a future deployment introduces a workspace dimension:

```yaml
- userId: demo-user
  role: admin
  scope:
    workspaceId: W1
```

that assignment applies to required scopes inside `W1`, such as
`{ workspaceId: W1, specId: S1 }`, but it does not satisfy a global `{}` requirement.

Multiple bounded areas are represented by multiple assignments:

```yaml
- userId: demo-user
  role: admin
  scope:
    workspaceId: W1

- userId: demo-user
  role: admin
  scope:
    workspaceId: W2
```

SpecFlow does not currently impose a `projectId -> specId -> sessionId` scope hierarchy and does
not support wildcard scope values. Values must be non-empty strings.

## Current roles

- `viewer`: `spec.view`, `session.view`;
- `developer`: viewer capabilities plus `spec.create`, `spec.manage`, `session.create`,
  `session.manage`;
- `admin`: developer capabilities plus `settings.view`, `settings.manage`.

Roles contain capabilities only. Scope belongs to the assignment, not to the role.

There is no role inheritance, deny model, wildcard capability, or precedence rule in the
authorization resolver. Capabilities from matching assignments are unioned.

## Authentication mode interaction

`runtime.authentication.mode=required` uses the authenticated session user's canonical id.

`runtime.authentication.mode=none` with `runtime.authentication.localUserId` uses that canonical
configured user id.

`runtime.authentication.mode=none` without `runtime.authentication.localUserId` disables Runtime
access control rather than creating an anonymous zero-permission user.
