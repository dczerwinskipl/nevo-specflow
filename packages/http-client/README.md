# @nevo/http-client

Product-neutral HTTP client infrastructure for Nevo applications.

The package provides one client configuration for ordinary request/response HTTP and Server-Sent Events (SSE). Axios owns request/response transport, while SSE uses browser `fetch` plus `eventsource-parser` for protocol framing. Both capabilities share the same base URL, default headers, credential provider, and absolute-URL policy.

It deliberately does **not** implement authentication protocols, token storage, refresh coordination, OIDC/PKCE, password login, React state, or UI.

Applications compose those concerns outside the package and supply only the credentials needed for a request:

- `anonymousCredentials()` for unauthenticated/trusted-local access;
- `cookieCredentials()` for browser sessions backed by cookies;
- `bearerTokenCredentials(getAccessToken)` for application-owned bearer-token flows;
- `customCredentials(resolve)` for provider-specific or future mechanisms.

The bearer helper resolves the token for every request and every SSE reconnect and never persists it. Refresh or re-authentication remains the responsibility of the authentication library or application that owns the flow. Errors thrown by those application-owned flows are preserved rather than converted into transport errors.

When a `baseURL` is configured, absolute request URLs are disabled by default so request credentials cannot accidentally escape that API boundary. A consumer may opt in explicitly when it truly needs mixed origins.

## SSE

`client.sse()` returns a single-consumer async iterable. Transport heartbeat comments are consumed by the SSE parser and are not emitted as application events. Named and unnamed SSE events are exposed uniformly as `SseEvent` values; applications may provide a `decode` function to map them into domain events.

The stream reconnects after network loss or a clean unexpected EOF, uses server-provided `retry:` values, sends `Last-Event-ID` on reconnect, and resolves credentials again before every connection attempt. HTTP/protocol failures are terminal. A `204 No Content` response closes the stream without reconnecting.

Breaking out of `for await`, calling `close()`, or aborting the supplied `AbortSignal` closes the underlying fetch. Connection lifecycle callbacks are intentionally limited to `onConnected` and `onReconnecting`; snapshot recovery and other domain policy stay in the consuming application.
