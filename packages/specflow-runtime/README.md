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
is one vertical slice under `src/auth/`: it owns its configuration model and validation,
application operations, route adapter, session lifecycle, password authentication,
generic OIDC adapter, and in-memory stores. The root `src/config/` code owns project/local
file loading and composition, but delegates auth-specific parsing, secret policy, and
merge policy to the auth feature. `src/server/` is the composition root for application-wide
Fastify construction and feature registration.

HTTP request validation belongs in Fastify route schemas. Fastify/AJV rejects malformed
`body`, `query`, and `params` before a handler runs; handlers should not repeat
primitive type checks or cast unvalidated request bodies.

## Configuration

The Runtime requires `nevo-specflow.yaml` in the project root and optionally loads the
git-ignored `.nevo-local/nevo-specflow.yaml` override. See
[`nevo-specflow.example.yaml`](../../nevo-specflow.example.yaml) and
[`nevo-specflow.local.example.yaml`](../../nevo-specflow.local.example.yaml).

Project configuration may define non-secret auth structure and user identities. Secrets,
including password hashes and OIDC client secrets, are local-only. Security-sensitive
maps such as password accounts and OIDC allowed emails use replacement semantics in
the local override rather than additive merging.

Supported auth modes:

- `none`: no login providers may be enabled; `localUserId` may provide attribution.
- `required`: at least one provider must be enabled; `localUserId` is forbidden.

## HTTP authentication API

The current Runtime exposes:

- `GET /api/auth/session`
- `POST /api/auth/password/login`
- `GET /api/auth/oidc/login`
- `GET /api/auth/oidc/callback`
- `POST /api/auth/logout`

Password login request bodies are validated by Fastify/AJV before entering the handler.
Authentication sessions are server-side, bounded, and expiring. Cookies are
`HttpOnly`, `SameSite=Lax`, and `Secure` when TLS/HTTPS is used. OIDC uses
authorization code flow with PKCE, state, and nonce and keeps provider tokens out of the
application session. The issuer is configured under `auth.providers.oidc`; the local example
shows Google, but the Runtime itself is provider-agnostic. The current supported profile is a
confidential OIDC client using `client_secret_post`, which is the `openid-client` default used
by this adapter. Issuers must use HTTPS. Identity mapping expects a verified standard `email`
claim. Broader client-authentication profiles are not implied by the generic provider name.

When TLS is enabled the Runtime uses HTTP/2 with HTTP/1.1 fallback on the same configured
port.

This package is private and bundled into the single `@nevo/specflow` distributable.

## HTTP route contracts

Runtime routes use Fastify's native AJV validation with TypeBox schemas and the
`@fastify/type-provider-typebox` provider. A route schema is the single definition for
both runtime validation and TypeScript inference: handlers receive already validated,
typed `body`, `query`, and `params` values instead of casting or reparsing `unknown`.

The Runtime keeps coercion and additional-property removal disabled. Invalid request
payloads fail with Fastify's `400 Bad Request` before the handler runs. Domain and
configuration invariants still belong to the feature/domain layer rather than AJV.

Feature contracts live with the feature (for auth, `src/auth/contracts.ts`). Other
workspace consumers such as the SpecFlow UI can import the schemas and inferred types from
`@nevo/specflow-runtime/auth-contracts` without depending on the Runtime server entrypoint.
Fastify/AJV remains the backend validator; TypeBox supplies JSON Schema plus static type
inference.
