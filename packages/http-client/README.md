# @nevo/http-client

Product-neutral HTTP client infrastructure for Nevo applications.

The package is built on **Axios** for ordinary request/response HTTP. Its public request API is intentionally Axios-like: `get`, `post`, `put`, `patch`, `delete`, familiar generic response typing, per-request headers/params/signals, and a raw `axios` escape hatch.

That similarity is deliberate. Developers who already know Axios should not need to learn a new HTTP abstraction just to use Nevo libraries. `@nevo/http-client` keeps the familiar request model and adds the pieces we need consistently across Nevo applications:

- shared credential providers for cookies, bearer tokens, anonymous access, and custom application-owned auth;
- safe client defaults such as bounded request timeouts and absolute-URL protection when a `baseURL` is configured;
- normalized transport errors;
- Server-Sent Events (SSE) with the same base URL, headers, credentials, params, and cancellation model;
- SSE reconnect, `Last-Event-ID`, server-provided `retry:`, and domain-event decoding.

The package does **not** try to replace Axios with a new general-purpose request library, and it does not implement authentication protocols, token storage, refresh coordination, OIDC/PKCE, password login, React state, or UI.

Axios owns request/response transport. SSE uses browser `fetch` plus `eventsource-parser` for protocol framing because Axios is not the right abstraction for a long-lived browser event stream.

## Basic usage

Create one client and reuse it for ordinary HTTP requests:

```ts
import { createHttpClient } from '@nevo/http-client';

const api = createHttpClient({
  baseURL: '/api',
  timeoutMs: 10_000,
});

interface SpecSummary {
  id: string;
  title: string;
}

const specs = await api.get<SpecSummary[]>('/specs');
```

The common helpers follow the shape developers expect from Axios:

```ts
interface CreateSpecRequest {
  title: string;
}

interface Spec {
  id: string;
  title: string;
}

const created = await api.post<Spec, CreateSpecRequest>(
  '/specs',
  { title: 'SSE transport' },
  {
    headers: {
      'X-Request-Source': 'specflow-ui',
    },
  },
);

const filtered = await api.get<Spec[], { status: string }>('/specs', {
  params: {
    status: 'active',
  },
});
```

For less common cases, `request()` exposes the same package-owned request model:

```ts
const spec = await api.request<Spec, CreateSpecRequest>({
  method: 'post',
  url: '/specs',
  body: {
    title: 'HTTP client',
  },
});
```

The public config is intentionally small and transport-neutral rather than exposing all of `AxiosRequestConfig`. If an application genuinely needs an Axios-specific feature, the configured instance remains available explicitly:

```ts
const response = await api.axios.request({
  method: 'HEAD',
  url: '/health',
  validateStatus: (status) => status < 500,
});
```

Use that escape hatch for exceptional Axios-specific behavior rather than making every Nevo consumer depend on Axios configuration details.

## Credentials

Applications compose authentication outside this package and supply only the credentials needed by the transport.

### Cookie-backed browser session

```ts
import { cookieCredentials, createHttpClient } from '@nevo/http-client';

const api = createHttpClient({
  baseURL: '/api',
  credentials: cookieCredentials(),
});

const me = await api.get<{ id: string; name: string }>('/me');
```

For request/response calls this maps to Axios cookie credentials. For SSE it maps to the corresponding browser `fetch` credentials mode.

### Bearer token owned by the application

```ts
import { bearerTokenCredentials, createHttpClient } from '@nevo/http-client';

const api = createHttpClient({
  baseURL: 'https://api.example.com',
  credentials: bearerTokenCredentials(async () => {
    return authSession.getAccessToken();
  }),
});
```

The token callback is evaluated for **every request and every SSE reconnect**. The client does not persist the token. Refresh or re-authentication remains the responsibility of the authentication library or application that owns the flow.

Errors thrown by those application-owned flows are preserved rather than converted into transport errors.

### Anonymous or custom credentials

```ts
import {
  anonymousCredentials,
  createHttpClient,
  customCredentials,
} from '@nevo/http-client';

const localApi = createHttpClient({
  baseURL: '/api',
  credentials: anonymousCredentials(),
});

const providerApi = createHttpClient({
  baseURL: '/api',
  credentials: customCredentials(({ method, url }) => ({
    headers: {
      'X-Client-Context': `${method} ${url}`,
    },
  })),
});
```

## SSE

`client.sse()` returns a single-consumer async iterable.

Transport heartbeat comments are consumed by the SSE parser and are not emitted as application events. Named and unnamed SSE events are exposed uniformly as `SseEvent` values.

```ts
const stream = api.sse('/events');

for await (const event of stream) {
  console.log(event.type, event.data, event.id);
}
```

SSE uses the same client-level base URL, default headers, credentials, params, and cancellation conventions as ordinary requests:

```ts
const controller = new AbortController();

const stream = api.sse('/events', {
  params: {
    sessionId: 'session-42',
  },
  headers: {
    'X-Request-Source': 'specflow-ui',
  },
  signal: controller.signal,
  onConnected: () => {
    console.log('connected');
  },
  onReconnecting: ({ retryInMs, error }) => {
    console.log('reconnecting', retryInMs, error);
  },
});

for await (const event of stream) {
  // Process events until the consumer stops, the signal is aborted,
  // the server returns 204, or a terminal protocol/HTTP error occurs.
}
```

Applications can decode wire events into domain events without putting domain knowledge in the transport package:

```ts
interface SessionEvent {
  sessionId: string;
  status: string;
}

const stream = api.sse<SessionEvent>('/events', {
  decode: (event) => JSON.parse(event.data) as SessionEvent,
});

for await (const event of stream) {
  console.log(event.sessionId, event.status);
}
```

If application-owned decoding throws, that error is terminal and is propagated to the consumer rather than treated as a network failure.

The stream reconnects after network loss or a clean unexpected EOF, uses server-provided `retry:` values, sends `Last-Event-ID` on reconnect, and resolves credentials again before every connection attempt. HTTP/protocol failures are terminal. A `204 No Content` response closes the stream without reconnecting.

Breaking out of `for await`, calling `close()`, or aborting the supplied `AbortSignal` closes the underlying fetch:

```ts
const stream = api.sse('/events');

for await (const event of stream) {
  if (event.type === 'completed') {
    break;
  }
}

// Equivalent explicit cancellation when needed:
// stream.close();
```

Connection lifecycle callbacks are intentionally limited to `onConnected` and `onReconnecting`. Snapshot recovery, application retries, cache invalidation, and other domain policy stay in the consuming application.

## URL boundary

When a `baseURL` is configured, absolute request URLs are disabled by default so request credentials cannot accidentally escape that API boundary.

A consumer may opt in explicitly when it truly needs mixed origins:

```ts
const api = createHttpClient({
  baseURL: '/api',
  allowAbsoluteUrls: true,
});
```

Prefer one client per API boundary instead of enabling mixed origins globally.
