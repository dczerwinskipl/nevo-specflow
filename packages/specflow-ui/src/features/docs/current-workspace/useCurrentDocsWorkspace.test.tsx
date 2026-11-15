// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { WorkspaceList } from '@nevo/specflow-contracts/workspaces';
import { afterEach, describe, expect, it } from 'vitest';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { docsKeys } from '../read-model';
import { createCurrentWorkspaceStore } from './currentWorkspaceStore';
import { useCurrentDocsWorkspace } from './useCurrentDocsWorkspace';

afterEach(cleanup);

const workspace = (workspaceId: string, kind: 'primary' | 'linked') => ({
  workspaceId,
  kind,
  name: workspaceId,
  path: `/repo/${workspaceId}`,
  available: true,
  isRuntimeWorkspace: kind === 'primary',
  specifications: [],
});
const list: WorkspaceList = {
  projectFolderId: 'main',
  workspaces: [
    workspace('main', 'primary'),
    workspace('sso', 'linked'),
    {
      ...workspace('broken', 'linked'),
      available: false,
      unavailableReason: 'checkout-unavailable',
    },
  ],
};

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const services = createSpecFlowAppServices({
    workspaceApi: { list: () => Promise.resolve(list) },
  });
  const values = new Map<string, string>();
  const store = createCurrentWorkspaceStore({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TestServicesRouterContext services={services}>{children}</TestServicesRouterContext>
    </QueryClientProvider>
  );
  const hook = renderHook(
    ({ route, source }: { route?: string; source?: 'pick' }) =>
      useCurrentDocsWorkspace({ routeWorkspaceId: route, routeSource: source, store }),
    {
      wrapper,
      initialProps: {},
    },
  );

  return { hook, queryClient, store };
}

describe('useCurrentDocsWorkspace', () => {
  it('replaces /docs with the current workspace, and a gone route with the project folder and its notice', async () => {
    const { hook, store } = setup();
    await waitFor(() => expect(hook.result.current.redirectTo).toBe('main'));

    hook.rerender({ route: 'closed' });
    await waitFor(() => expect(store.get().notice).toEqual({ reason: 'not-registered' }));
    expect(hook.result.current).toMatchObject({ workspaceId: 'main', redirectTo: 'main' });

    hook.rerender({ route: 'main' });
    expect(hook.result.current).toMatchObject({
      workspaceId: 'main',
      redirectTo: undefined,
      notice: { reason: 'not-registered' },
    });
  });

  it('a switch drops the previous workspace reads, so a late answer cannot be shown', async () => {
    const { hook, queryClient, store } = setup();
    hook.rerender({ route: 'main' });
    await waitFor(() => expect(hook.result.current.workspaceId).toBe('main'));
    queryClient.setQueryData(docsKeys.tree('main'), { workspaceId: 'main', corpusRevision: 'r1' });

    hook.rerender({ route: 'sso' });
    await waitFor(() => expect(hook.result.current.workspaceId).toBe('sso'));
    expect(store.get()).toEqual({ workspaceId: 'sso', source: 'route' });
    await waitFor(() => expect(queryClient.getQueryData(docsKeys.tree('main'))).toBeUndefined());
  });

  it('keeps a pick made while the route still names the previous workspace', async () => {
    const { hook, store } = setup();
    hook.rerender({ route: 'sso', source: undefined });
    await waitFor(() => expect(store.get()).toEqual({ workspaceId: 'sso', source: 'route' }));

    // The picker writes the store first; the router commits its navigation later.
    act(() => store.pick('broken'));
    hook.rerender({ route: 'broken', source: 'pick' });

    await waitFor(() => expect(store.get()).toEqual({ workspaceId: 'broken', source: 'pick' }));
    expect(hook.result.current).toMatchObject({ workspaceId: 'broken', redirectTo: undefined });
    expect(hook.result.current.notice).toBeUndefined();
  });
});
