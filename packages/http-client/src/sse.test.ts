import { afterEach, describe, expect, it, vi } from 'vitest';

import { bearerTokenCredentials, createHttpClient } from './index';

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
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
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

  it('keeps absolute SSE URLs inside a configured base URL by default', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(sseResponse('data: protected\n\n'));
    vi.stubGlobal('fetch', fetchMock);

    const client = createHttpClient({
      baseURL: 'https://api.example.test',
    });
    const stream = client.sse('https://other.example.test/events');
    const iterator = stream[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { data: 'protected' },
    });

    stream.close();

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/https://other.example.test/events',
    );
  });

  it('clears Last-Event-ID after an empty id field', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce((_input, init) => {
        const headers = new Headers(init?.headers);
        expect(headers.get('Last-Event-ID')).toBeNull();

        return Promise.resolve(sseResponse('retry: 1\nid: 7\ndata: first\n\n'));
      })
      .mockImplementationOnce((_input, init) => {
        const headers = new Headers(init?.headers);
        expect(headers.get('Last-Event-ID')).toBe('7');

        return Promise.resolve(sseResponse('id:\ndata: second\n\n'));
      })
      .mockImplementationOnce((_input, init) => {
        const headers = new Headers(init?.headers);
        expect(headers.get('Last-Event-ID')).toBeNull();

        return Promise.resolve(sseResponse('data: third\n\n'));
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = createHttpClient();
    const stream = client.sse('/events');
    const iterator = stream[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      value: { data: 'first', id: '7' },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { data: 'second', id: '' },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { data: 'third' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(stream.lastEventId).toBe('');

    stream.close();
  });

  it('decodes domain events without treating heartbeat comments as messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(sseResponse(': keep-alive\n\nevent: update\ndata: {"value":42}\n\n')),
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
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(sseResponse('data: invalid\n\n'));
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
      .mockImplementationOnce((_input, init) => {
        const headers = new Headers(init?.headers);
        expect(headers.get('Authorization')).toBe('Bearer first');
        expect(headers.get('Last-Event-ID')).toBeNull();

        return Promise.resolve(sseResponse('retry: 1\nid: 7\nevent: update\ndata: first\n\n'));
      })
      .mockImplementationOnce((_input, init) => {
        const headers = new Headers(init?.headers);
        expect(headers.get('Authorization')).toBe('Bearer second');
        expect(headers.get('Last-Event-ID')).toBe('7');

        return Promise.resolve(sseResponse('event: update\ndata: second\n\n'));
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
    const request = { signal: undefined as AbortSignal | undefined };
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation((_input, init) => {
        request.signal = init?.signal ?? undefined;
        return Promise.resolve(sseResponse('data: one\n\n'));
      }),
    );

    const client = createHttpClient();
    const stream = client.sse('/events');

    for await (const event of stream) {
      expect(event.data).toBe('one');
      break;
    }

    expect(request.signal?.aborted).toBe(true);
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
    await expect(failedIterator.next()).rejects.toMatchObject({
      kind: 'http',
      status: 401,
      data: 'nope',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
