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
  resolves password accounts, named OIDC instances, or trusted local attribution to canonical
  users; authorization independently resolves scoped capabilities for those users.
related:
  - architecture.runtime.ownership-and-lifecycle
  - architecture.runtime.authorization
  - reference.configuration.authorization
  - reference.api.authorization
---

# Runtime authentication and authorization

Runtime treats authentication and authorization as separate concerns.

Authentication establishes the effective canonical user. Password accounts, one or more named OIDC
instances, and trusted local mode all converge on the same `authentication.users` user id before authorization
is evaluated. Password is one login capability with multiple accounts. A newly created password
user uses its username as its canonical id; extra login accounts can explicitly link to an existing
user instead of exposing a second id field in the wizard.

OIDC is a collection of instances under `authentication.providers.oidc.instances`; every enabled instance has
a stable lowercase slug id and a distinct single-line user-facing name of at most 32 characters,
plus its own issuer/client configuration and email-to-user mappings. A new OIDC identity uses its
normalized allowed email as its canonical id automatically. Human-facing OIDC
profile data is taken from verified provider claims at sign-in, not entered during setup. Provider
ids and provider display names remain separate concepts. Client secrets remain workstation-local.

The browser-facing session contract explicitly reports whether authentication is required, whether
the current browser is authenticated, whether password login is enabled, and the enabled OIDC
instance ids/names. Authenticated OIDC sessions retain the provider id so the concrete sign-in
method is not lost.

OIDC start is provider-specific and UI-driven:

`POST /api/auth/oidc/:providerId/start`

It returns the provider authorization URL after storing one pending server-side transaction. The
transaction binds state/nonce/PKCE data to the provider id and a validated local `returnTo`.
Callbacks use `/api/auth/oidc/:providerId/callback`; provider mismatch fails closed. Callback
failures return the browser to the standalone login route with a stable error code instead of
rendering provider/API JSON.

Authorization resolves what the canonical user may do for an explicit resource in a required scope; omitted scope means the global `{}` target.
Project initialization assigns a role to every canonical user it creates so a fresh authenticated or
trusted-local project does not start with a valid identity and zero capabilities. The first canonical
user defaults to `admin`, later users default to `developer`, and setup requires at least one
administrator before it can finish. Provider type does not influence role selection.

- [Authorization architecture](authorization.md)
- [Authorization configuration reference](../../../reference/configuration/authorization.md)
- [Authorization HTTP API reference](../../../reference/api/authorization.md)
