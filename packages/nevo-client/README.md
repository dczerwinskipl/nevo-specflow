# @nevo/client

Product-neutral HTTP client infrastructure for Nevo applications.

The package wraps Axios with shared request defaults, normalized errors, and a small credential-provider boundary. It deliberately does **not** implement authentication protocols, token storage, refresh coordination, OIDC/PKCE, password login, React state, or UI.

Applications compose those concerns outside the package and supply only the credentials needed for a request:

- `anonymousCredentials()` for unauthenticated/trusted-local access;
- `cookieCredentials()` for browser sessions backed by cookies;
- `bearerTokenCredentials(getAccessToken)` for application-owned bearer-token flows;
- `customCredentials(resolve)` for provider-specific or future mechanisms.

The bearer helper resolves the token for every request and never persists it. Refresh or re-authentication remains the responsibility of the authentication library or application that owns the flow. Errors thrown by those application-owned flows are preserved rather than converted into transport errors. The underlying Axios instance remains exposed for advanced integration, including library-owned recovery interceptors.

When a `baseURL` is configured, absolute request URLs are disabled by default so request credentials cannot accidentally escape that API boundary. A consumer may opt in explicitly when it truly needs mixed origins.

JSON request/response traffic is the intended scope. Streaming transports such as SSE or WebSocket stay in transport-specific adapters instead of being forced through Axios.
