// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { HttpClientError } from '@nevo/http-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api';
import { documentTreeFixture } from '../../../../test-support/documents/fixtures';
import { NotificationProvider } from '../../../shared/notifications/notifications';
import { assignTypeFor } from '../workspace/DocumentsTreeActions';
import { useDocumentOperations } from './useDocumentOperations';

afterEach(cleanup);

const tree = documentTreeFixture({
  documents: [
    {
      id: 'u-a',
      path: 'a.md',
      classification: 'unclassified',
      type: undefined,
      actions: {
        rename: { available: true },
        move: { available: true },
        delete: { available: true },
        classify: { available: true },
      },
    },
  ],
});

/** A write refused before anything was sent (no connection at dispatch): definite. */
const notApplied = () =>
  new ApiError({
    kind: 'network',
    operation: 'documents.operate',
    outcome: 'not-applied',
    retryable: true,
  });

function setup(onOperate: () => Promise<never>) {
  const onBusyChange = vi.fn();
  const view = renderHook(
    () =>
      useDocumentOperations({
        tree,
        onAdd: () => Promise.resolve(),
        onOperate,
        onBusyChange,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <NotificationProvider>{children}</NotificationProvider>
      ),
    },
  );
  return { view, onBusyChange };
}

describe('a refused document operation', () => {
  it('treats a classified not-applied refusal as definite: nothing stays locked', async () => {
    const { view, onBusyChange } = setup(() => Promise.reject(notApplied()));
    let outcome: unknown;
    await act(async () => {
      outcome = await view.result.current.actions.classify(
        { id: 'u-a', expectedRevision: '1' },
        'research',
        'Research',
        () => undefined,
      );
    });
    expect(outcome).toEqual({ ok: false, focusName: false });
    expect(view.result.current.state.unknown).toBe(false);
    expect(view.result.current.actions.isUnknown()).toBe(false);
    expect(view.result.current.state.busy).toBe(false);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(view.result.current.state.error).toBe('documents.tree.error.default');
  });

  it('keeps an answer without a status as an unknown outcome (it may have been applied)', async () => {
    const { view, onBusyChange } = setup(() =>
      Promise.reject(new HttpClientError('reset', { kind: 'network' })),
    );
    await act(async () => {
      await view.result.current.actions.classify(
        { id: 'u-a', expectedRevision: '1' },
        'research',
        'Research',
        () => undefined,
      );
    });
    expect(view.result.current.state.unknown).toBe(true);
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
  });
});

describe('Assign type of a tab', () => {
  const actions = { assignType: vi.fn(), removeRegistration: vi.fn() };

  it('is offered only where the document and the Runtime can classify', () => {
    expect(assignTypeFor(actions, tree, 'u-a')).toBe(actions.assignType);
    const notServed = {
      ...tree,
      capabilities: {
        ...tree.capabilities,
        classify: { available: false, reason: 'branch-protected' as const },
      },
    };
    expect(assignTypeFor(actions, notServed, 'u-a')).toBeUndefined();
    const registered = documentTreeFixture({ documents: [{ id: 'ux', path: 'ux.md' }] });
    expect(assignTypeFor(actions, registered, 'ux')).toBeUndefined();
    expect(assignTypeFor(null, tree, 'u-a')).toBeUndefined();
  });
});
