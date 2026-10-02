# `@nevo/specflow-runtime`

The private Runtime package behind the public `nevo-specflow` product. It owns the
long-lived local backend boundary: Runtime configuration, Fastify application composition,
authentication, server-side sessions, listen/TLS lifecycle, and graceful shutdown.

The package is not published independently. It is bundled into `@nevo/specflow`.

## Package boundaries

| Import                                  | Purpose                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `@nevo/specflow-runtime`                | Runtime application/configuration API used by product composition and tests.                    |
| `@nevo/specflow-runtime/cli`            | Commander adapters owned by Runtime capabilities, currently `start` and auth utilities.         |
| `@nevo/specflow-runtime/auth-contracts` | TypeBox HTTP contracts that UI/client code may consume without importing the server entrypoint. |

## Architecture conventions

Runtime is organized by capability. A feature owns its configuration model and invariants,
application operations, transport contracts, HTTP adapter, provider integrations, and
feature-local state. Cross-feature/server code composes those boundaries rather than
reimplementing their policy.

Authentication therefore lives under `src/auth/` and is registered by
`src/server/app.ts` as an encapsulated Fastify plugin. Fastify route schemas are the
request-validation boundary: TypeBox supplies JSON Schema and inferred TypeScript types,
and AJV rejects malformed input before a handler executes.

The root `src/config/` layer owns loading the `runtime` subtree from project/local product configuration and composing Runtime values. It delegates auth-specific parsing and security policy to the auth feature.

## Configuration

Runtime owns the `server` configuration it consumes and composes feature-owned configuration such as `auth`. Its `initRuntime` operation owns the corresponding setup prompts/defaults, secret split, hashing, and effective-config validation; the public product initializer only owns repository/file bootstrap.

Runtime loads:

- committed `.nevo/config.yaml` → `runtime` subtree;
- optional workstation-local `.nevo/local/config.yaml` → `runtime` subtree.

The entire `.nevo/local/` directory is Git-ignored and is also reserved for future Runtime-owned local state. Authentication secrets, including password hashes and OIDC client secrets, are local-only.
Security-sensitive auth maps use replacement rather than additive merge semantics.

`auth.mode` supports:

- `none`: no login provider is enabled; optional `localUserId` may provide attribution;
- `required`: at least one login provider is enabled and `localUserId` is forbidden.

For `required` auth, a remotely reachable Runtime must terminate TLS itself. When Runtime
TLS is disabled, both the bind host and any `publicOrigin` must be loopback. Reverse-proxy
TLS termination and forwarded-client-IP trust are intentionally not supported yet. This
keeps password transport and source-based throttling unambiguous.

If `publicOrigin` is configured, its protocol must match Runtime TLS: HTTPS with TLS,
HTTP without TLS.

## Password authentication

Password login is throttled before scrypt work, both per normalized account and per direct
network source. Throttled requests return HTTP 429 with `Retry-After`. Password account
names are limited to 256 characters and passwords to 1024 characters across configuration,
HTTP validation, and password provisioning.

The supported password hash format uses scrypt `N=2^14, r=8, p=5`. We intentionally do
not accept the earlier weaker `p=1` profile.

Generate a configuration hash through the installed product:

```bash
printf '%s\n' "$PASSWORD" | nevo-specflow auth hash-password --password-stdin
```

The command reads exactly one password line from stdin and prints only the encoded hash.
Store that hash in the local configuration, not in the committed project configuration.

## OIDC profile

OIDC uses authorization code flow with PKCE, state, and nonce. Provider tokens are not
stored in the application session. The provider is generic and configured by issuer;
Google appears only as an example configuration.

The currently supported profile is deliberately narrow:

- HTTPS issuer;
- confidential client using `client_secret_post`;
- verified standard `email` claim in the ID token;
- allow-list mapping from normalized email to the internal user id.

UserInfo fallback and additional client-authentication profiles are not part of this
foundation yet. OIDC authorization starts are throttled per direct network source before
provider work and transaction allocation, while the transaction store remains bounded and
expiring.

## HTTP authentication API

- `GET /api/auth/session`
- `POST /api/auth/password/login`
- `GET /api/auth/oidc/login`
- `GET /api/auth/oidc/callback`
- `POST /api/auth/logout`

Sessions are server-side, bounded, and expiring. `GET /api/auth/session` responses use
`Cache-Control: no-store`. Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure`
whenever Runtime TLS is enabled.

See [project configuration and local state](../../docs/architecture/runtime/configuration.md), [`nevo-specflow.example.yaml`](../../nevo-specflow.example.yaml), and
[`nevo-specflow.local.example.yaml`](../../nevo-specflow.local.example.yaml) for the
configuration shape.
