import { afterEach, describe, expect, it, vi } from 'vitest';

import { bearerTokenCredentials, createHttpClient, HttpClientError } from './index';

function sseResponse(body: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'text/event-stream');
  }

  return new Response(body, {
    ...init,
    headers,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HttpClient.sse', () => {
  it('uses the shared base URL and exposes named, unnamed, and multiline events', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse(
        ': heartbeat\n\n' +
          'event: turn.updated\n' +
          'id: 7\n' +
          'data: first\n' +
          'data: second\n\n' +
          'data: plain\n\n',
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createHttpClient({ baseURL: '/api' });
    const stream = client.sse('/events', { params: { after: 3 } });
    const iterator = stream[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        type: 'turn.updated',
        id: '7',
        data: 'first\nsecond',
      },
    });

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        type: 'message',
        data: 'plain',
      },
    });

    stream.close();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/events?after=3');
  });

  it('decodes domain events without treating heartbeat comments as messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse(': keep-alive\n\nevent: update\ndata: {"value":42}\n\n'),
      ),
    );

    const client = createHttpClient();
    const stream = client.sse<{ value: number }>('/events', {
      decode: (event) => JSON.parse(event.data) as { value: number },
    });

    const iterator = stream[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { value: 42 },
    });

    stream.close();
  });

  it('does not reconnect when application-owned decoding fails', async () => {
    const decodeError = new Error('invalid domain event');
    const reconnecting = vi.fn();
    const fetchMock = vi.fn(async () => sseResponse('data: invalid\\n\\n'));
    vi.stubGlobal('fetch', fetchMock);

    const client = createHttpClient();
    const iterator = client
      .sse('/events', {
        decode: () => {
          throw decodeError;
        },
        onReconnecting: reconnecting,
      })
      [Symbol.asyncIterator]();

    await expect(iterator.next()).rejects.toBe(decodeError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reconnecting).not.toHaveBeenCalled();
  });

  it('reconnects with Last-Event-ID and resolves fresh credentials for every attempt', async () => {
    let token = 'first';
    const connected = vi.fn();
    const reconnecting = vi.fn();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async (_input, init) => {
        const headers = new Headers(init?.headers);
        expect(headers.get('Authorization')).toBe('Bearer first');
        expect(headers.get('Last-Event-ID')).toBeNull();

        return sseResponse('retry: 1\nid: 7\nevent: update\ndata: first\n\n');
      })
      .mockImplementationOnce(async (_input, init) => {
        const headers = new Headers(init?.headers);
        expect(headers.get('Authorization')).toBe('Bearer second');
        expect(headers.get('Last-Event-ID')).toBe('7');

        return sseResponse('event: update\ndata: second\n\n');
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = createHttpClient({
      credentials: bearerTokenCredentials(() => token),
    });
    const stream = client.sse('/events', {
      onConnected: connected,
      onReconnecting: reconnecting,
    });
    const iterator = stream[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { type: 'update', data: 'first', id: '7' },
    });

    token = 'second';

    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { type: 'update', data: 'second' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(connected).toHaveBeenCalledTimes(2);
    expect(reconnecting).toHaveBeenCalledWith({
      error: undefined,
      retryInMs: 1,
    });

    stream.close();
  });

  it('aborts the underlying fetch when iteration is stopped early', async () => {
    let requestSignal: AbortSignal | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input, init) => {
        requestSignal = init?.signal as AbortSignal;
        return sseResponse('data: one\n\n');
      }),
    );

    const client = createHttpClient();
    const stream = client.sse('/events');

    for await (const event of stream) {
      expect(event.data).toBe('one');
      break;
    }

    expect(requestSignal?.aborted).toBe(true);
  });

  it('closes cleanly on 204 and rejects terminal HTTP failures', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response('nope', {
          status: 401,
          statusText: 'Unauthorized',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = createHttpClient();

    const closedIterator = client.sse('/closed')[Symbol.asyncIterator]();
    await expect(closedIterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });

    const failedIterator = client.sse('/unauthorized')[Symbol.asyncIterator]();
    await expect(failedIterator.next()).rejects.toMatchObject<HttpClientError>({
      kind: 'http',
      status: 401,
      data: 'nope',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
