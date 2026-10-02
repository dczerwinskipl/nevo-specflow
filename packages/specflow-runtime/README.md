# `@nevo/specflow-runtime`

The **Nevo SpecFlow Runtime** vertical. It owns the long-lived application backend,
including configuration loading, the Fastify HTTP boundary, authentication, server
sessions, TLS/listen lifecycle, and explicit shutdown.

| Import                         | Owns                                                                 | Commander? |
| ------------------------------ | -------------------------------------------------------------------- | ---------- |
| `@nevo/specflow-runtime` (`.`) | Runtime application API: `startRuntime()`, app construction, config. | no         |
| `@nevo/specflow-runtime/cli`   | Root-level `start` command adapter: `createStartCommand(ctx)`.       | yes        |

The `nevo-specflow` shell ([`@nevo/specflow`](../specflow/README.md)) composes the
command. The shell does not implement Runtime behavior.

## Structure

Runtime code is organized by capability rather than by transport layer. Authentication
is one vertical slice under `src/auth/`: its route registration, session projection,
password authentication, Google OIDC adapter, and in-memory stores live together.
`src/server/` owns only application-wide Fastify construction/listen concerns.

HTTP request validation belongs in Fastify route schemas. Fastify/AJV rejects malformed
`body`, `query`, and `params` before a handler runs; handlers should not repeat
primitive type checks or cast unvalidated request bodies.

## Configuration

The Runtime requires `nevo-specflow.yaml` in the project root and optionally loads the
git-ignored `.nevo-local/nevo-specflow.yaml` override. See
[`nevo-specflow.example.yaml`](../../nevo-specflow.example.yaml) and
[`nevo-specflow.local.example.yaml`](../../nevo-specflow.local.example.yaml).

Project configuration may define non-secret auth structure and user identities. Secrets,
including password hashes and Google client secrets, are local-only. Security-sensitive
maps such as password accounts and Google allowed emails use replacement semantics in
the local override rather than additive merging.

Supported auth modes:

- `none`: no login providers may be enabled; `localUserId` may provide attribution.
- `required`: at least one provider must be enabled; `localUserId` is forbidden.

## HTTP authentication API

The current Runtime exposes:

- `GET /api/auth/session`
- `POST /api/auth/password/login`
- `GET /api/auth/oidc/google/login`
- `GET /api/auth/oidc/google/callback`
- `POST /api/auth/logout`

Password login request bodies are validated by Fastify/AJV before entering the handler.
Authentication sessions are server-side, bounded, and expiring. Cookies are
`HttpOnly`, `SameSite=Lax`, and `Secure` when TLS/HTTPS is used. Google OIDC uses
authorization code flow with PKCE, state, and nonce and keeps provider tokens out of the
application session.

When TLS is enabled the Runtime uses HTTP/2 with HTTP/1.1 fallback on the same configured
port.

This package is private and bundled into the single `@nevo/specflow` distributable.
