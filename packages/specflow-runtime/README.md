# `@nevo/specflow-runtime`

The private Runtime package behind the public `nevo-specflow` product. It owns the
long-lived local backend boundary: Runtime configuration, Fastify application composition,
authentication and authorization, server-side sessions, listen/TLS lifecycle, and graceful
shutdown.

The package is not published independently. It is bundled into `@nevo/specflow`.

## Package boundaries

- `@nevo/specflow-runtime`: narrow Runtime capability API used by product composition.
- `@nevo/specflow-runtime/cli`: Commander adapters owned by Runtime capabilities, currently
  `start` and auth utilities.

Shared HTTP schemas and their inferred TypeScript types live together in
`@nevo/specflow-contracts`. Runtime consumes those schemas directly from Fastify rather than
maintaining a second server-only schema surface.

## Architecture conventions

Runtime is organized by cohesive capability. A feature owns its configuration model and
invariants, application operations, transport adapters, provider integrations, and feature-local
state. Cross-feature/server code composes those boundaries rather than reimplementing policy.

A vertical slice is not a flat directory. Larger capabilities are split again by cohesive
sub-capability so the HTTP adapter, application operation, policy, and state/provider code for one
behavior stay near each other.

Authentication and authorization form one Runtime **Auth** feature:

```text
src/auth/
  feature.ts                  # Auth composition root
  http/
    cookies.ts                # genuinely shared HTTP concern
    rate-limit.ts             # Fastify source/IP throttling
  authentication/
    config/
      model.ts
      parse.ts
      ownership.ts
      runtime-policy.ts
    password/
      authenticate.ts
      account-throttle.ts
      login.ts
      http.ts
    oidc/
      client.ts
      discovery.ts
      errors.ts
      login.ts
      http.ts
    session/
      model.ts
      state.ts
      errors.ts
      store.ts
      policy.ts
      access.ts
      http.ts
  authorization/
    capabilities/
      resolve.ts
      http.ts
    composition.ts
    config.ts
    roles.ts
```

`auth/feature.ts` creates feature-owned state/providers and mounts sub-capability adapters.
Provider-specific routes are registered only when the provider is enabled, so an adapter never
receives an impossible half-configured provider state. HTTP adapters translate request/response
concerns only; application decisions live in operations such as password/OIDC login and capability
resolution.

Fastify route schemas are the request-validation boundary. TypeBox schemas are owned by
`@nevo/specflow-contracts`, Fastify/AJV validates them before handlers execute, and response schemas
bound the serialized output.

Replaceable effects/state use narrow capability contracts. `AuthStore` is the session/OIDC-state
port and `InMemoryAuthStore` is the default adapter.

The root `src/config/` layer owns loading and composing the `runtime` subtree. Auth-specific
configuration follows the same internal split: model, parsing, project/local ownership, merge policy,
and runtime-context policy are separate responsibilities.

## Configuration

Runtime owns the `server` configuration it consumes and composes feature-owned configuration such
as `auth`. Its `initRuntime` operation owns the corresponding setup prompts/defaults, secret split,
hashing, and effective-config validation; the public product initializer only owns repository/file
bootstrap.

Runtime receives explicit absolute project/local config paths from the product shell and loads only
its `runtime` subtree. Runtime does not discover the repository root or assume config paths relative
to `process.cwd()`.

The entire `.nevo/local/` directory is Git-ignored and is also reserved for future Runtime-owned
local state. Authentication secrets, including password hashes and per-instance OIDC client secrets, are
local-only. Project/local provenance is validated before merge; local config cannot change canonical
users, auth mode, provider policy, OIDC mapping, server bind/origin, or TLS enablement. OIDC project
configuration is a map under `auth.providers.oidc.instances`; each instance has a stable provider id
and a user-facing name, while the matching local instance contributes only its client secret.
Security-sensitive auth maps use replacement rather than additive merge semantics. Parsed identity,
account, and OIDC mapping dictionaries use own-property lookups and prototype-safe storage so special
keys such as `__proto__` or `toString` cannot become inherited identities. YAML syntax errors are
reported without echoing source snippets, so malformed local secret configuration does not leak
secret text to stderr.

`auth.mode` supports:

- `none`: no login provider is enabled; optional `localUserId` may provide attribution;
- `required`: at least one login provider is enabled and `localUserId` is forbidden.

For `required` auth, a remotely reachable Runtime must terminate TLS itself. When Runtime TLS is
disabled, both the bind host and any `publicOrigin` must be loopback. Reverse-proxy TLS termination
and forwarded-client-IP trust are intentionally not supported yet.

If `publicOrigin` is configured, its protocol must match Runtime TLS: HTTPS with TLS, HTTP without
TLS. It is the canonical browser-facing origin used for OIDC redirects and therefore must match the
hostname users actually open in the browser. The initializer uses the same loopback host for bind
and public origin (`127.0.0.1`) so host-only auth cookies survive the OIDC redirect. Origins
containing credentials, paths, queries, or fragments are rejected rather than silently normalized.

## Password authentication

Password account identifiers are canonicalized by trimming and lower-casing at configuration and
login boundaries; collisions after normalization are rejected.

Password login is throttled before scrypt work on two independent boundaries. Direct network-source
throttling is owned by `@fastify/rate-limit` at the HTTP boundary; its default key generator
canonicalizes IP addresses, collapses IPv4-mapped IPv6, and groups IPv6 by /64. Canonical account
throttling remains application policy so a successful authentication can reset that account's
failure window. Account-throttle storage is bounded and fails closed rather than evicting a live
limiter entry. Throttled requests return HTTP 429 with `Retry-After`.

Password account names are limited to 256 characters and passwords to 1024 characters across
configuration, HTTP validation, and password provisioning. The supported password hash format uses
scrypt `N=2^14, r=8, p=5`.

Generate a configuration hash through the installed product:

```bash
printf '%s\n' "$PASSWORD" | nevo-specflow auth hash-password --password-stdin
```

The command reads exactly one password line from stdin and prints only the encoded hash. Store that
hash in local configuration, not committed project configuration.

## OIDC profile

OIDC uses authorization code flow with PKCE, state, and nonce. Provider tokens are not stored in the
application session. Each provider instance is generic and configured by issuer; Google is only an example. Multiple
named OIDC instances may be enabled at the same time.

The currently supported profile is deliberately narrow:

- HTTPS issuer;
- confidential client using `client_secret_post`;
- verified standard `email` claim in the ID token;
- allow-list mapping from normalized email to the internal user id.

OIDC discovery/network failures are distinguished from callback authentication failures at the
provider boundary. Failed discovery is coalesced behind a short retry cooldown so a provider outage
does not cause every request to start a new discovery call. Runtime enables Fastify's structured
logger at warning level and writes warnings to stderr so CLI stdout remains a stable product surface. Request logging records only the request
method, path without query/fragment data, and direct network source metadata. Provider diagnostics
are deliberately sanitized to category/code/status metadata rather than raw provider response bodies.
OIDC start uses the same Fastify-owned source/IP throttling boundary as password login. The browser
starts a concrete provider with `POST /api/auth/oidc/:providerId/start`; Runtime stores the provider
id and a validated local return target in the pending transaction and returns the external
authorization URL as JSON. Starting a new OIDC flow atomically replaces the prior pending transaction
for that browser. Callback state is matched atomically before the transaction is consumed, and the
provider-specific callback must match the provider recorded in the transaction. Authentication
failures redirect back to the standalone login route with a stable error code instead of rendering a
raw API response. Logout clears both session and pending OIDC state.

## HTTP authentication API

Always registered:

- `GET /api/auth/session`
- `POST /api/auth/logout`
- `POST /api/authorization/capabilities`

Registered only when the corresponding login method/provider instance is enabled:

- `POST /api/auth/password/login`
- `POST /api/auth/oidc/:providerId/start`
- `GET /api/auth/oidc/:providerId/callback`

Sessions and pending OIDC transactions are server-side, bounded, and expiring. Capacity is
fail-closed: a full store returns a controlled HTTP 503 and never evicts live authentication state.
The `AuthStore` exposes the effective immutable session policy, and cookie lifetime is derived from
that same policy so injected stores cannot drift from HTTP TTLs. Cookie names are scoped by Runtime
server port, preventing two local Runtime instances on the same hostname but different ports from
overwriting each other's session/OIDC cookies. `GET /api/auth/session` and capability discovery
use `Cache-Control: no-store`. Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` whenever
Runtime TLS is enabled.

See [project configuration and local state](../../docs/architecture/runtime/configuration.md),
[`nevo-specflow.example.yaml`](../../nevo-specflow.example.yaml), and
[`nevo-specflow.local.example.yaml`](../../nevo-specflow.local.example.yaml) for the configuration
shape.
