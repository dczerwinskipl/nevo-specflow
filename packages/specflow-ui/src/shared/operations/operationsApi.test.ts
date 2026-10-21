import type { HttpRequestClient, SseRequestConfig, SseStream } from '@nevo/http-client';
import type { OperationProgressEvent } from '@nevo/specflow-contracts/operations';
import { describe, expect, it, vi } from 'vitest';

import { createRuntimeOperationsApi } from './operationsApi';

const operationId = '3f0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f60';
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
        for (const event of events) yield config?.decode ? config.decode(event) : event;
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
  for await (const event of iterable) seen.push(event);
  return seen;
}

describe('operations API (SSE)', () => {
  it('opens the generic endpoint with the kind and the operation id', async () => {
    const { http, sse } = client([wire({ type: 'completed', result: {} })]);
    await collect(
      createRuntimeOperationsApi(http).watchProgress('specification-create', operationId),
    );
    expect(sse).toHaveBeenCalledTimes(1);
    expect(sse.mock.calls[0]?.[0]).toBe(
      `/api/operations/${operationId}/events?kind=specification-create`,
    );
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
    const seen = await collect(
      createRuntimeOperationsApi(http).watchProgress('specification-create', operationId),
    );
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
    for await (const event of api.watchProgress(
      'specification-create',
      operationId,
      controller.signal,
    )) {
      seen.push(event);
      controller.abort();
    }
    expect(seen).toHaveLength(1);
    expect(sse.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
});
