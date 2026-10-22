// @vitest-environment jsdom
import type { OperationProgressEvent } from '@nevo/specflow-contracts/operations';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OperationsApi } from './operationsApi';
import { useOperationProgress } from './useOperationProgress';

const operationId = '3f0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f60';
const base = { operationId, kind: 'specification-create', at: 'now' };

/** A stream the test drives by hand. */
function controlledApi() {
  const queue: (OperationProgressEvent | Error | 'end')[] = [];
  let wake: (() => void) | undefined;
  const signals: AbortSignal[] = [];
  const opened = vi.fn();
  const api: OperationsApi = {
    async *watchProgress(streamUrl, signal) {
      opened(streamUrl);
      if (signal) signals.push(signal);
      for (;;) {
        while (queue.length === 0) {
          if (signal?.aborted) return;
          await new Promise<void>((resolve) => {
            wake = resolve;
            signal?.addEventListener('abort', () => resolve(), { once: true });
          });
        }
        const next = queue.shift()!;
        if (next === 'end') return;
        if (next instanceof Error) throw next;
        yield next;
      }
    },
  };
  return {
    api,
    opened,
    signals,
    push(item: OperationProgressEvent | Error | 'end') {
      queue.push(item);
      wake?.();
    },
  };
}

const streamUrlOf = (id: string) => `/api/specs/create/operations/${id}/events`;

function setup(api: OperationsApi, props: { enabled: boolean; operationId?: string }) {
  return renderHook(
    (current: { enabled: boolean; operationId?: string }) =>
      useOperationProgress({
        api,
        streamUrl: current.operationId ? streamUrlOf(current.operationId) : undefined,
        enabled: current.enabled,
      }),
    { initialProps: { ...props, operationId: props.operationId ?? operationId } },
  );
}

/** Pushes an item and lets the consuming loop and React settle. */
async function emit(
  stream: ReturnType<typeof controlledApi>,
  item: OperationProgressEvent | Error | 'end',
) {
  await act(async () => {
    stream.push(item);
    await Promise.resolve();
  });
}

const snapshot: OperationProgressEvent = {
  ...base,
  type: 'snapshot',
  status: 'running',
  steps: [
    { id: 'reserving', status: 'running' },
    { id: 'registering', status: 'pending' },
  ],
};

afterEach(() => cleanup());

describe('useOperationProgress', () => {
  it('draws the checklist from the stream while enabled', async () => {
    const stream = controlledApi();
    const hook = setup(stream.api, { enabled: true });
    expect(hook.result.current.steps).toEqual([]);
    await emit(stream, snapshot);
    expect(hook.result.current.steps).toEqual([
      { id: 'reserving', status: 'running' },
      { id: 'registering', status: 'pending' },
    ]);
    await emit(stream, { ...base, type: 'step', step: 'reserving', status: 'done' });
    expect(hook.result.current.steps[0]).toEqual({ id: 'reserving', status: 'done' });
    expect(stream.opened).toHaveBeenCalledWith(streamUrlOf(operationId));
  });

  it('does not open a stream while disabled or without an operation id', () => {
    const stream = controlledApi();
    setup(stream.api, { enabled: false });
    expect(stream.opened).not.toHaveBeenCalled();
    const renderWithoutId = renderHook(() =>
      useOperationProgress({
        api: stream.api,
        streamUrl: undefined,
        enabled: true,
      }),
    );
    expect(renderWithoutId.result.current.steps).toEqual([]);
    expect(stream.opened).not.toHaveBeenCalled();
  });

  it('silently falls back to no steps when the stream fails', async () => {
    const stream = controlledApi();
    const hook = setup(stream.api, { enabled: true });
    await emit(stream, new Error('stream refused'));
    expect(hook.result.current.steps).toEqual([]);
    expect(hook.result.current.available).toBe(false);
  });

  it('reports the stream as lost when it fails, drops or ends without a terminal event', async () => {
    const failed = controlledApi();
    const failedHook = setup(failed.api, { enabled: true });
    expect(failedHook.result.current.lost).toBe(false);
    await emit(failed, new Error('stream refused'));
    expect(failedHook.result.current.lost).toBe(true);

    const dropped = controlledApi();
    const droppedHook = setup(dropped.api, { enabled: true });
    await emit(dropped, snapshot);
    await emit(dropped, new Error('dropped'));
    expect(droppedHook.result.current.lost).toBe(true);
    expect(droppedHook.result.current.available).toBe(true);

    const ended = controlledApi();
    const endedHook = setup(ended.api, { enabled: true });
    await emit(ended, snapshot);
    await emit(ended, 'end');
    expect(endedHook.result.current.lost).toBe(true);
    expect(endedHook.result.current.outcome).toBe('running');
  });

  it('is not lost while events flow and records the terminal outcome', async () => {
    const stream = controlledApi();
    const hook = setup(stream.api, { enabled: true });
    await emit(stream, snapshot);
    await emit(stream, { ...base, type: 'completed', result: {} });
    expect(hook.result.current.outcome).toBe('completed');
    expect(hook.result.current.lost).toBe(false);
  });

  it('keeps the last drawn steps when the stream breaks after a snapshot', async () => {
    const stream = controlledApi();
    const hook = setup(stream.api, { enabled: true });
    await emit(stream, snapshot);
    await emit(stream, new Error('dropped'));
    expect(hook.result.current.steps).toHaveLength(2);
  });

  it('redraws from the fresh snapshot the server sends after a reconnect', async () => {
    const stream = controlledApi();
    const hook = setup(stream.api, { enabled: true });
    await emit(stream, snapshot);
    await emit(stream, { ...base, type: 'step', step: 'reserving', status: 'done' });
    await emit(stream, {
      ...snapshot,
      type: 'snapshot',
      steps: [
        { id: 'reserving', status: 'done' },
        { id: 'registering', status: 'running' },
      ],
    });
    expect(hook.result.current.steps).toEqual([
      { id: 'reserving', status: 'done' },
      { id: 'registering', status: 'running' },
    ]);
  });

  it('aborts the stream when it is disabled and when the component unmounts', async () => {
    const stream = controlledApi();
    const hook = setup(stream.api, { enabled: true });
    await emit(stream, snapshot);
    expect(stream.signals[0]?.aborted).toBe(false);
    hook.rerender({ enabled: false, operationId });
    expect(stream.signals[0]?.aborted).toBe(true);
    expect(hook.result.current.steps).toEqual([]);

    const second = controlledApi();
    const mounted = setup(second.api, { enabled: true });
    await emit(second, snapshot);
    mounted.unmount();
    expect(second.signals[0]?.aborted).toBe(true);
  });

  it('starts from a clean checklist for another operation', async () => {
    const stream = controlledApi();
    const hook = setup(stream.api, { enabled: true });
    await emit(stream, snapshot);
    hook.rerender({ enabled: true, operationId: '00000000-0000-4000-8000-000000000009' });
    expect(hook.result.current.steps).toEqual([]);
    expect(stream.signals[0]?.aborted).toBe(true);
  });
});
