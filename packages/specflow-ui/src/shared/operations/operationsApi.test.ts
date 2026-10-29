import {
  HttpClientError,
  type HttpRequestClient,
  type SseRequestConfig,
  type SseStream,
} from '@nevo/http-client';
import type { OperationProgressEvent } from '@nevo/specflow-contracts/operations';
import { describe, expect, it, vi } from 'vitest';

import { createRuntimeOperationsApi } from './operationsApi';

const operationId = '3f0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f60';
const streamUrl = `/api/specs/create/operations/${operationId}/events`;
const wire = (event: Record<string, unknown>, id?: string) => ({
  type: String(event.type),
  data: JSON.stringify({ operationId, kind: 'specification-create', at: 'now', ...event }),
  ...(id ? { id } : {}),
});

function client(events: readonly { type: string; data: string; id?: string }[]) {
  const close = vi.fn();
  const sse = vi.fn(
    (
      _url: string,
      config?: SseRequestConfig<OperationProgressEvent | undefined>,
    ): SseStream<unknown> => ({
      close,
      async *[Symbol.asyncIterator]() {
        for (const event of events) {
          yield config?.decode ? config.decode(event) : event;
        }

        // A live stream would stay open; the API must stop on its own after a terminal event.
        await new Promise((resolve) => setTimeout(resolve, 50));
        yield config?.decode?.(wire({ type: 'step', step: 'late', status: 'done' }));
      },
    }),
  );

  return { http: { sse } as unknown as HttpRequestClient, sse, close };
}

async function collect(iterable: AsyncIterable<OperationProgressEvent>) {
  const seen: OperationProgressEvent[] = [];
  for await (const event of iterable) {
    seen.push(event);
  }

  return seen;
}

describe('operations API (SSE)', () => {
  it('opens exactly the stream URL it is given (the feature owns the route)', async () => {
    const { http, sse } = client([wire({ type: 'completed', result: {} })]);
    await collect(createRuntimeOperationsApi(http).watchProgress(streamUrl));
    expect(sse).toHaveBeenCalledTimes(1);
    expect(sse.mock.calls[0]?.[0]).toBe(streamUrl);
  });

  it('decodes events, skips malformed ones and stops after the terminal event', async () => {
    const { http, close } = client([
      wire(
        { type: 'snapshot', status: 'running', steps: [{ id: 'reserving', status: 'running' }] },
        '0',
      ),
      { type: 'message', data: 'not json' },
      { type: 'step', data: JSON.stringify({ type: 'nope' }) },
      wire({ type: 'step', step: 'reserving', status: 'done' }, '1'),
      wire({ type: 'completed', result: { specId: 'x' } }, '2'),
    ]);
    const seen = await collect(createRuntimeOperationsApi(http).watchProgress(streamUrl));
    expect(seen.map((event) => event.type)).toEqual(['snapshot', 'step', 'completed']);
    expect(close).toHaveBeenCalled();
  });

  it('passes the abort signal to the stream and ends when it aborts', async () => {
    const controller = new AbortController();
    const sse = vi.fn((_url: string, config?: SseRequestConfig<unknown>): SseStream<unknown> => ({
      close: vi.fn(),
      async *[Symbol.asyncIterator]() {
        yield config?.decode?.(wire({ type: 'snapshot', status: 'running', steps: [] }));
        await new Promise((resolve) => setTimeout(resolve, 20));
      },
    }));
    const api = createRuntimeOperationsApi({ sse } as unknown as HttpRequestClient);
    const seen: OperationProgressEvent[] = [];
    for await (const event of api.watchProgress(streamUrl, controller.signal)) {
      seen.push(event);
      controller.abort();
    }

    expect(seen).toHaveLength(1);
    expect(sse.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
});

describe('operations API (list)', () => {
  const listUrl = '/api/specs/operations';
  const answer = {
    items: [{ operationId, kind: 'specification-create', status: 'in-progress', updatedAt: 'now' }],
    counts: { inProgress: 1, recoveryRequired: 0, failed: 0, completed: 0 },
    truncated: false,
    generatedAt: 'now',
  };
  const httpWith = (get: ReturnType<typeof vi.fn>) => ({ get }) as unknown as HttpRequestClient;
  const failure = (status: number) => new HttpClientError('failed', { kind: 'http', status });

  it('reads and decodes the list, sending the held tag when there is one', async () => {
    const get = vi.fn().mockResolvedValue(answer);
    const result = await createRuntimeOperationsApi(httpWith(get)).list(listUrl, { etag: 'W/"1"' });
    expect(result.kind).toBe('list');
    expect(get.mock.calls[0]?.[0]).toBe(listUrl);
    expect(get.mock.calls[0]?.[1]).toMatchObject({ headers: { 'If-None-Match': 'W/"1"' } });
  });

  it('treats 304 as not modified', async () => {
    const get = vi.fn().mockRejectedValue(failure(304));
    expect(await createRuntimeOperationsApi(httpWith(get)).list(listUrl)).toEqual({
      kind: 'not-modified',
    });
  });

  it.each([404, 403, 501])(
    'treats %i as no list on this Runtime, not as an error',
    async (status) => {
      const get = vi.fn().mockRejectedValue(failure(status));
      expect(await createRuntimeOperationsApi(httpWith(get)).list(listUrl)).toEqual({
        kind: 'unavailable',
      });
    },
  );

  it('fails on a server error and on an answer that is not a list', async () => {
    await expect(
      createRuntimeOperationsApi(httpWith(vi.fn().mockRejectedValue(failure(503)))).list(listUrl),
    ).rejects.toBeInstanceOf(HttpClientError);
    await expect(
      createRuntimeOperationsApi(httpWith(vi.fn().mockResolvedValue('<html>'))).list(listUrl),
    ).rejects.toThrow('unexpected shape');
  });
});
