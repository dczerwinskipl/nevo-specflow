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
  Exact current SpecFlow authorization configuration: project-only role assignments reference
  project auth.users ids, use one of three built-in roles, and use canonical scope parent chains.
related:
  - architecture.runtime.authorization
  - reference.api.authorization
---

# Authorization configuration

Authorization policy is project configuration in `nevo-specflow.yaml`.

`.nevo-local/nevo-specflow.yaml` must not contain an `authorization` section. Runtime rejects a
local authorization section during config loading.

## Shape

```yaml
authorization:
  assignments:
    - userId: demo-user
      role: developer
      scope:
        projectId: P1
```

Each assignment has exactly:

- `userId`: canonical project `auth.users.<userId>` key;
- `role`: one of `viewer`, `developer`, `admin`;
- `scope`: canonical assignment scope.

`userId` must exist in the project `auth.users` section. A user introduced only by local config
does not satisfy this requirement.

## Valid scopes

The accepted assignment scope shapes are:

```text
{}
{ projectId }
{ projectId, specId }
{ projectId, specId, sessionId }
```

All values are non-empty strings.

The following are rejected because they omit canonical parents:

```text
{ specId }
{ sessionId }
{ projectId, sessionId }
```

An empty scope is global.

## Current roles

- `viewer`: `spec.view`, `session.view`;
- `developer`: viewer capabilities plus `spec.create`, `spec.manage`, `session.create`,
  `session.manage`;
- `admin`: developer capabilities plus `settings.view`, `settings.manage`.

The role definitions are application code in Runtime. Configuration assigns those roles; it does not
define or extend them.

There is no role inheritance in the authorization resolver and no wildcard capability.

## Auth mode interaction

`auth.mode=required` uses the authenticated session user's canonical id.

`auth.mode=none` with `auth.localUserId` uses that canonical configured user id.

`auth.mode=none` without `auth.localUserId` disables Runtime access control rather than creating
an anonymous zero-permission user.
