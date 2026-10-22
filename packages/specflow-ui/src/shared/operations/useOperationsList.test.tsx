// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  operationItem,
  operationList,
  operationsStub,
  runningItem,
} from '../../../test-support/operations/fixtures';
import type { OperationListItem } from './operationList';
import { useOperationsList } from './useOperationsList';

const url = '/api/specs/operations';
const running = operationList([runningItem(1)]);
const idle = operationList([operationItem({ status: 'completed' })]);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  focusManager.setFocused(true);
  vi.useRealTimers();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    // Query notifications are batched on a 0 ms timer.
    await vi.advanceTimersByTimeAsync(1);
  });
}

function mount(
  api: ReturnType<typeof operationsStub>,
  onCompleted?: (rows: readonly OperationListItem[]) => void,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useOperationsList({ api, listUrl: url, onCompleted }), { wrapper });
}

describe('useOperationsList cadence', () => {
  it('reads at once, then every 3 s while something runs', async () => {
    const api = operationsStub(running);
    const { result } = mount(api);
    expect(result.current.loading).toBe(true);
    await advance(0);
    expect(result.current.loading).toBe(false);
    expect(result.current.list?.items).toHaveLength(1);
    expect(api.calls).toHaveLength(1);
    await advance(3_000);
    expect(api.calls).toHaveLength(2);
    await advance(3_000);
    expect(api.calls).toHaveLength(3);
  });

  it('slows to 15 s when nothing runs', async () => {
    const api = operationsStub(idle);
    mount(api);
    await advance(0);
    await advance(14_000);
    expect(api.calls).toHaveLength(1);
    await advance(1_000);
    expect(api.calls).toHaveLength(2);
  });

  it('does not poll in a hidden tab and reads again when the tab comes back', async () => {
    const api = operationsStub(running);
    mount(api);
    await advance(0);
    act(() => focusManager.setFocused(false));
    await advance(30_000);
    expect(api.calls).toHaveLength(1);
    act(() => focusManager.setFocused(true));
    await advance(0);
    expect(api.calls).toHaveLength(2);
  });

  it('backs off while reads fail, keeps the rows and recovers', async () => {
    const api = operationsStub(running, new Error('down'), new Error('down'), running);
    const { result } = mount(api);
    await advance(0);
    await advance(3_000); // second read fails
    expect(result.current.failed).toBe(true);
    expect(result.current.list?.items).toHaveLength(1);
    await advance(5_000); // backoff is 6 s after the first failure
    expect(api.calls).toHaveLength(2);
    await advance(1_000);
    expect(api.calls).toHaveLength(3);
    await advance(11_000); // 12 s after the second failure
    expect(api.calls).toHaveLength(3);
    await advance(1_000);
    expect(api.calls).toHaveLength(4);
    expect(result.current.failed).toBe(false);
  });

  it('is unavailable without retrying when the Runtime serves no list', async () => {
    const api = operationsStub({ kind: 'unavailable' });
    const { result } = mount(api);
    await advance(0);
    expect(result.current.unavailable).toBe(true);
    await advance(120_000);
    expect(api.calls).toHaveLength(1);
  });

  it('reads nothing without a list url', async () => {
    const api = operationsStub(running);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useOperationsList({ api, listUrl: undefined }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await advance(20_000);
    expect(api.calls).toHaveLength(0);
    expect(result.current.loading).toBe(false);
  });
});

describe('useOperationsList completion', () => {
  const id = '00000000-0000-4000-8000-0000000000aa';
  const before = operationList([runningItem(3, { operationId: id })]);
  const after = operationList([operationItem({ operationId: id, status: 'completed' })]);

  it('reports a row that went from running to completed, once', async () => {
    const onCompleted = vi.fn<(rows: readonly OperationListItem[]) => void>();
    mount(operationsStub(before, after, after), onCompleted);
    await advance(0);
    expect(onCompleted).not.toHaveBeenCalled();
    await advance(3_000);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(onCompleted.mock.calls[0]?.[0]?.[0]?.operationId).toBe(id);
    await advance(15_000);
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it('reports a row that first shows up already completed, but not on the first read', async () => {
    const onCompleted = vi.fn<(rows: readonly OperationListItem[]) => void>();
    mount(operationsStub(operationList([]), after), onCompleted);
    await advance(0);
    expect(onCompleted).not.toHaveBeenCalled();
    await advance(15_000);
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when the first read already holds a completed row', async () => {
    const onCompleted = vi.fn<(rows: readonly OperationListItem[]) => void>();
    mount(operationsStub(after), onCompleted);
    await advance(0);
    expect(onCompleted).not.toHaveBeenCalled();
  });
});
