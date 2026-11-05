// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { HttpClientError } from '@nevo/http-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentTreeFixture } from '../../../../test-support/documents/fixtures';
import { NotificationProvider } from '../../../shared/notifications/notifications';
import { useDocumentOperations } from './useDocumentOperations';

afterEach(cleanup);

const httpError = (code: string, status: number) =>
  new HttpClientError(code, { kind: 'http', status, data: { error: code } });
const wrapper = ({ children }: { children: ReactNode }) => (
  <NotificationProvider>{children}</NotificationProvider>
);

function ops(
  onAdd: (...args: unknown[]) => Promise<void>,
  onOperate: (...args: unknown[]) => Promise<void> = () => Promise.resolve(),
) {
  const onRefresh = vi.fn(() => Promise.resolve());
  const onBusyChange = vi.fn();
  const view = renderHook(
    () =>
      useDocumentOperations({
        tree: documentTreeFixture({ documents: [] }),
        onAdd,
        onOperate,
        onRefresh,
        onBusyChange,
      }),
    { wrapper },
  );

  return { view, onRefresh, onBusyChange };
}

describe('the stale-tree refetch is shared by every write', () => {
  it('a create from New document refetches on SPEC_ARCHIVED', async () => {
    const { view, onRefresh } = ops(() => Promise.reject(httpError('SPEC_ARCHIVED', 409)));
    await act(() => view.result.current.actions.createDocument({ path: 'a.md' }, () => undefined));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('an import refused with SPEC_ARCHIVED refetches the tree too', async () => {
    const { view, onRefresh } = ops(() => Promise.reject(httpError('SPEC_ARCHIVED', 409)));
    await act(() => view.result.current.actions.importFiles([new File(['# A'], 'a.md')], ''));
    expect(view.result.current.state.error).toMatch(/importRejected|Import rejected/);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('a write that waits for Resume holds the tree', () => {
  const recovery = () => httpError('DOCUMENT_RECOVERY_REQUIRED', 503);

  it('keeps the lock after a recovery-required import: nothing else runs, Resume survives', async () => {
    const onAdd = vi.fn().mockRejectedValueOnce(recovery()).mockResolvedValue(undefined);
    const { view, onBusyChange } = ops(onAdd);
    await act(() => view.result.current.actions.importFiles([new File(['# A'], 'a.md')], ''));
    expect(view.result.current.state.resumable).toBe(true);
    expect(view.result.current.state.retry).toHaveLength(1);
    expect(view.result.current.actions.isUnknown()).toBe(true);
    expect(onBusyChange).toHaveBeenLastCalledWith(true); // the leave-page blocker stays
    const action = vi.fn();
    await act(() => view.result.current.actions.guard(action));
    expect(action).not.toHaveBeenCalled();
    await act(() => view.result.current.actions.importFiles([new File(['# B'], 'b.md')], ''));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(view.result.current.state.retry).toHaveLength(1);
    expect(view.result.current.state.resumable).toBe(true);
    // Resume sends the same files and releases the lock on success.
    act(() => view.result.current.actions.retryImport());
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalledTimes(2));
    expect(onAdd).toHaveBeenCalledTimes(2);
    expect(onAdd.mock.calls[1]![0]).toEqual(onAdd.mock.calls[0]![0]);
    expect(view.result.current.actions.isUnknown()).toBe(false);
    expect(view.result.current.state.resumable).toBe(false);
  });

  it('keeps the lock after a recovery-required dialog operation until it is resumed', async () => {
    const onOperate = vi.fn().mockRejectedValueOnce(recovery()).mockResolvedValue(undefined);
    const { view } = ops(() => Promise.resolve(), onOperate);
    const request = {
      action: 'move' as const,
      kind: 'document' as const,
      id: 'd',
      path: 'a.md',
      expectedRevision: '1',
    };
    await act(() => view.result.current.actions.confirmDialog(request, 'x', () => undefined));
    expect(view.result.current.state.unknown).toBe(true);
    expect(view.result.current.state.resumable).toBe(true);
    const action = vi.fn();
    await act(() => view.result.current.actions.guard(action));
    expect(action).not.toHaveBeenCalled();
    await act(() => view.result.current.actions.confirmDialog(request, 'x', () => undefined));
    expect(view.result.current.state.unknown).toBe(false);
    expect(view.result.current.state.resumable).toBe(false);
  });
});
