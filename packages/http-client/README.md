# @nevo/http-client

Product-neutral HTTP client infrastructure for Nevo applications.

The package intentionally keeps the request/response API familiar to Axios users. Axios is the request/response transport underneath, so common calls keep the expected shape:

```ts
await client.get('/sessions', { params: { status: 'active' } });
await client.post('/sessions', { name: 'New session' });
await client.patch('/sessions/123', { name: 'Renamed session' });
```

This is not a replacement implementation of Axios and it is not meant to invent another HTTP vocabulary. The package adds the Nevo-level behavior we want to share across applications:

- one configuration for request/response HTTP and Server-Sent Events (SSE);
- transport-neutral credential providers;
- normalized request/response transport errors;
- safer `baseURL` handling for credential-bearing clients;
- SSE streaming with the same URL, headers, query params, credentials, and cancellation model;
- an explicit `client.axios` escape hatch when an application needs Axios-specific behavior.

Axios owns ordinary request/response transport. SSE uses browser `fetch` plus `eventsource-parser` for protocol framing because a long-lived event stream has different lifecycle semantics from an Axios request. The public API hides that transport difference where the semantics can be shared.

## Quick start

```ts
import { createHttpClient, cookieCredentials } from '@nevo/http-client';

const client = createHttpClient({
  baseURL: '/api',
  credentials: cookieCredentials(),
});

const session = await client.get<Session>('/sessions/123');

const created = await client.post<Session, CreateSessionRequest>('/sessions', {
  name: 'Implementation batch',
});
```

A configured `baseURL` disables absolute request URLs by default so credentials cannot accidentally escape the intended API boundary. Consumers can opt in explicitly with `allowAbsoluteUrls` when mixed origins are genuinely required.

## Request configuration

Request helpers expose a small transport-neutral configuration surface instead of leaking `AxiosRequestConfig` into application code:

```ts
const sessions = await client.get<Session[], SessionQuery>('/sessions', {
  params: {
    status: 'active',
  },
  headers: {
    'X-Correlation-Id': correlationId,
  },
  signal: controller.signal,
  timeoutMs: 5_000,
});
```

The familiar Axios-style method signatures are deliberate, but `@nevo/http-client` is not drop-in compatible with every Axios option. The shared API stays limited to options we want to support consistently. Advanced Axios integrations can use the underlying instance explicitly:

```ts
client.axios.interceptors.response.use(...);
```

## Credentials

Authentication protocol and authentication state remain application-owned. The client only asks for credentials when it is about to make a request or open/reopen an SSE connection.

Available helpers:

- `anonymousCredentials()` for unauthenticated or trusted-local access;
- `cookieCredentials()` for browser sessions backed by cookies;
- `bearerTokenCredentials(getAccessToken)` for application-owned bearer-token flows;
- `customCredentials(resolve)` for provider-specific or future mechanisms.

Cookie-backed client:

```ts
const client = createHttpClient({
  baseURL: '/api',
  credentials: cookieCredentials(),
});
```

Bearer-token client:

```ts
const client = createHttpClient({
  baseURL: 'https://api.example.com',
  credentials: bearerTokenCredentials(() => auth.getAccessToken()),
});
```

The bearer helper resolves the token for every request and every SSE reconnect and never persists it. Refresh or re-authentication remains the responsibility of the authentication library or application that owns the flow. Errors thrown by those application-owned flows are preserved rather than converted into transport errors.

The package deliberately does **not** implement authentication protocols, token storage, refresh coordination, OIDC/PKCE, password login, React state, or UI.

## SSE

SSE is a capability of the same HTTP client rather than a separately configured client:

```ts
const events = client.sse('/agent-sessions/123/events', {
  params: {
    after: lastEventId,
  },
  signal: controller.signal,
  onConnected() {
    setConnectionStatus('connected');
  },
  onReconnecting({ retryInMs }) {
    setConnectionStatus('reconnecting');
    console.log(`Retrying in ${retryInMs} ms`);
  },
});

for await (const event of events) {
  console.log(event.type, event.id, event.data);
}
```

The raw stream yields:

```ts
interface SseEvent {
  readonly type: string;
  readonly data: string;
  readonly id?: string;
}
```

Applications can decode raw SSE frames into domain events without teaching the transport about their schema:

```ts
const events = client.sse<AgentEvent>('/agent-sessions/123/events', {
  decode(event) {
    return JSON.parse(event.data) as AgentEvent;
  },
});

for await (const event of events) {
  applyAgentEvent(event);
}
```

Transport heartbeat comments are consumed by the SSE parser and are not emitted as application events. Named and unnamed SSE events are exposed uniformly, so consumers do not need to pre-register every possible event name.

The stream reconnects after network loss or a clean unexpected EOF, uses server-provided `retry:` values, sends `Last-Event-ID` on reconnect, and resolves credentials again before every connection attempt. HTTP/protocol failures and application-owned `decode` failures are terminal. A `204 No Content` response closes the stream without reconnecting.

Breaking out of `for await`, calling `close()`, or aborting the supplied `AbortSignal` closes the underlying fetch:

```ts
for await (const event of client.sse('/operations/123/events')) {
  if (isTerminal(event)) {
    break;
  }
}
```

Connection lifecycle callbacks are intentionally limited to `onConnected` and `onReconnecting`. Snapshot recovery, domain retry decisions, and other application policy stay in the consuming feature.

## Errors

Request/response transport failures are normalized to `HttpClientError`:

```ts
import { HttpClientError } from '@nevo/http-client';

try {
  await client.get('/sessions/123');
} catch (error) {
  if (error instanceof HttpClientError) {
    console.log(error.kind, error.status, error.data);
  }

  throw error;
}
```

The normalized kinds are `cancelled`, `http`, `network`, and `unexpected`. Errors owned by external credential/authentication flows are intentionally re-thrown unchanged.
