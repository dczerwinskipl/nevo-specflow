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

The dimensions SpecFlow checks today: Specification capabilities at `{projectId, specId}`;
Session capabilities at `{projectId, sessionId}` for a standalone Session and
`{projectId, specId, sessionId}` for a Session associated with a Specification, except
`session.execute-write`, which never carries `specId`. Consequently:

- a `{projectId: P}` or global assignment covers every Specification and Session of the project;
- a `{specId: S}` assignment applies its role's Specification capabilities to S and its Session
  capabilities to the Sessions associated with S, but not to standalone Sessions or Sessions of
  another Specification, and never admits write-mode execution; for example a `developer` at
  `{specId: S}` starts read-only Sessions in S (reading the provider catalogue for S) and views,
  manages and deletes every Session of S, and a `viewer` there only views them;
- a `{sessionId}` assignment covers that one Session (a `developer` there reads the provider
  catalogue for it to steer its Turns) and cannot create another.

The exact rule is in [Runtime authorization](../../architecture/runtime/auth/authorization.md#specflow-required-scopes).

## Current roles

- `viewer`: `spec.view`, `session.view`;
- `developer`: viewer capabilities plus `spec.create`, `spec.manage`, `spec.close-worktree`,
  `spec.close-specification`, `spec.start-session`, `session.create`, `session.manage`,
  `session.delete`, `session.execute-write`;
- `admin`: developer capabilities plus `session.view-provider-limits`, `settings.view`,
  `settings.manage`, `project-git.integrate`, `project-git.close-workspace`.

Roles contain capabilities only. Scope belongs to the assignment, not to the role.

Capabilities are granular: none implies another. `spec.start-session` only permits associating a
new Session with a Specification; it grants no Session capability, and no Session capability
grants it.

There is no role inheritance, deny model, wildcard capability, or precedence rule in the
authorization resolver. Capabilities from matching assignments are unioned.

## Authentication mode interaction

`runtime.authentication.mode=required` uses the authenticated session user's canonical id.

`runtime.authentication.mode=none` with `runtime.authentication.localUserId` uses that canonical
configured user id.

`runtime.authentication.mode=none` without `runtime.authentication.localUserId` disables Runtime
access control rather than creating an anonymous zero-permission user.
