---
id: docs.architecture-runtime-auth-readme
type: hub
title: Runtime authentication and authorization
status: current
scope: specflow
areas:
  - runtime
  - server
  - security
read_when:
  - changing Runtime authentication or authorization
  - deciding where identity, roles, capabilities, or access checks belong
summary: >
  Entry point for SpecFlow Runtime authentication and authorization architecture. Authentication
  resolves provider credentials to a canonical user identity; authorization resolves scoped
  capabilities for that identity.
related:
  - architecture.runtime.ownership-and-lifecycle
  - architecture.runtime.authorization
  - reference.configuration.authorization
  - reference.api.authorization
---

# Runtime authentication and authorization

Runtime treats authentication and authorization as separate concerns.

Authentication establishes the effective canonical user. Password accounts, OIDC identities, and
trusted local mode all converge on the same `auth.users` user id before authorization is evaluated.

Authorization resolves what that user may do for an explicit resource in an explicit scope.

- [Authorization architecture](authorization.md)
- [Authorization configuration reference](../../../reference/configuration/authorization.md)
- [Authorization HTTP API reference](../../../reference/api/authorization.md)
