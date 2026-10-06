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

Runtime separates product features from infrastructure and composition:

```text
src/
  features/
    auth/
      index.ts
      feature.ts
      authentication/
        configuration/
        password-login/
        oidc-login/
        session/
        store/
      authorization/
        configuration/
        capability-discovery/
        request-context.ts
        request-authorization.ts
        guards.ts
    specs/
      index.ts
      feature.ts
      overview/
        endpoint.ts
        filter-authorized-specs.ts
        current/
          configuration.ts
          classify-spec.ts
          get-overview.ts
        archive/
          get-overview.ts
        repository/
          read-repository.ts
          model.ts
          sample-repository.ts
    sessions/
      index.ts
      feature.ts
    settings/
      index.ts
      feature.ts
    runtime-feature.ts
  config/
    parsing/
      runtime-config-error.ts
      value-parsers.ts
  server/
  init/
  cli/
```

`features/<name>/index.ts` is the Runtime-facing feature boundary. `feature.ts` owns feature
composition and registration. Infrastructure and other features import the public `index.ts`
surface instead of reaching into implementation sub-slices.

Features own the authorization resource definitions they expose through their feature boundary. Runtime
composition creates the enabled feature modules, collects those resource definitions, defines the
product role policy from their capabilities, and injects both into Auth. Product
features therefore do not need to know global role ids, while Authorization evaluates product
capabilities without importing Specs, Sessions, or Settings.

HTTP endpoints are thin transport adapters. Application behavior lives in named operations beside
the capability they serve. Specs Overview is intentionally split into `current` and `archive`
sub-slices because they have different read models and behavior even though they share one HTTP
endpoint.

Replaceable effects/state use narrow capability contracts. Specs Overview uses `SpecsOverviewRepository` as its read port; the current sample catalogue is only its default adapter. Repository models are internal
to the Specs feature and do not reuse HTTP response DTOs.

Authentication and authorization are one Runtime Auth feature. Shared Auth HTTP concerns such as
cookies and source throttling remain feature-local, while request authorization is installed before
other product features register their routes.

Fastify route schemas are the request-validation boundary. TypeBox schemas are owned by
`@nevo/specflow-contracts`, and response schemas bound serialized output.

## Configuration

Runtime owns the `server` configuration it consumes and composes feature-owned configuration such
as `authentication`. Its `initRuntime` operation owns the corresponding setup prompts/defaults, secret split,
hashing, and effective-config validation; the public product initializer only owns repository/file
bootstrap.

Runtime receives explicit absolute project/local config paths from the product shell and loads only
its `runtime` subtree. Runtime does not discover the repository root or assume config paths relative
to `process.cwd()`.

The entire `.nevo/local/` directory is Git-ignored and is also reserved for future Runtime-owned
local state. Authentication secrets, including password hashes and per-instance OIDC client secrets, are
local-only. Project/local provenance is validated before merge; local config cannot change canonical
users, auth mode, provider policy, OIDC mapping, server bind/origin, or TLS enablement. OIDC project
configuration is a map under `authentication.providers.oidc.instances`; each instance has a stable provider id
and a user-facing name, while the matching local instance contributes only its client secret.
Security-sensitive authentication maps use replacement rather than additive merge semantics. Parsed identity,
account, and OIDC mapping dictionaries use own-property lookups and prototype-safe storage so special
keys such as `__proto__` or `toString` cannot become inherited identities. YAML syntax errors are
reported without echoing source snippets, so malformed local secret configuration does not leak
secret text to stderr.

`authentication.mode` supports:

- `none`: no login provider is enabled; optional `localUserId` may provide attribution;
- `required`: at least one login provider is enabled and `localUserId` is forbidden.

For `required` auth, a remotely reachable Runtime must terminate TLS itself. When Runtime TLS is
disabled, both the bind host and any `publicOrigin` must be loopback. Reverse-proxy TLS termination
and forwarded-client-IP trust are intentionally not supported yet.

If `publicOrigin` is configured, its protocol must match Runtime TLS: HTTPS with TLS, HTTP without
TLS. It is the browser-facing product origin used for OIDC redirects and therefore must match the
hostname users actually open in the browser. The packaged product uses one local origin:
`http://127.0.0.1:4318`. Runtime serves the built SpecFlow UI at that root and the API under
`/api`, so OIDC callbacks, browser routes, and API requests share the same host and port.

The standalone Vite server on port `5173` remains a UI-development convenience only; it is not part
of the normal `nevo-specflow start` topology.

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
- optional standard `name` claim used as the authenticated session display name, falling back to email;
- allow-list mapping from normalized email to the internal user id.

During init, each normalized OIDC allow-list email is the canonical user id. If that exact id already
exists it is reused; otherwise setup creates it automatically. The wizard does not offer arbitrary
linking to another canonical user and does not ask for an OIDC display name: profile display data
comes from provider claims when the user signs in.

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
The `AuthenticationStore` exposes the effective immutable store policy, and cookie lifetime is derived from
that same policy so injected stores cannot drift from HTTP TTLs. Cookie names are scoped by Runtime
server port, preventing two local Runtime instances on the same hostname but different ports from
overwriting each other's session/OIDC cookies. `GET /api/auth/session` and capability discovery
use `Cache-Control: no-store`. Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` whenever
Runtime TLS is enabled.

See [project configuration and local state](../../docs/architecture/runtime/configuration.md),
[`nevo-specflow.example.yaml`](../../nevo-specflow.example.yaml), and
[`nevo-specflow.local.example.yaml`](../../nevo-specflow.local.example.yaml) for the configuration
shape.

### Local OIDC identity model

During setup, each allowed OIDC email becomes the stable canonical user id for that identity. The
wizard does not ask for a separate display name or canonical-user link. At sign-in time Runtime uses
the OIDC `name` claim for the session display name, falling back to the normalized email when the
provider does not supply one. Authorization remains configuration-driven and is assigned when the
OIDC identity is added during setup.
