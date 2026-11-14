// @vitest-environment jsdom
import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestServicesRouterContext } from '../../../../../test-support/app/TestServicesRouterContext';
import { createSpecFlowQueryClient } from '../../../../app/queryClient';
import { createSpecFlowAppServices } from '../../../../services';
import { createOptionsWireFixture, workspaceListFixture } from './creationOptions.stories-support';
import { useCreateOptions } from './useCreateOptions';

afterEach(cleanup);

describe('useCreateOptions', () => {
  it('refetches the workspace list with the options on window focus, so a new workspace still joins', async () => {
    let read = 0;
    const services = createSpecFlowAppServices({
      workspaceApi: {
        list: () => Promise.resolve(workspaceListFixture(read > 1 ? 'many-workspaces' : 'default')),
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={createSpecFlowQueryClient()}>
        <TestServicesRouterContext services={services}>{children}</TestServicesRouterContext>
      </QueryClientProvider>
    );
    const fetch = vi.fn(() => {
      read += 1;

      return Promise.resolve(createOptionsWireFixture(read > 1 ? 'many-workspaces' : 'default'));
    });
    const { result } = renderHook(
      () =>
        useCreateOptions({
          queryKey: ['test-create-options'],
          fetch,
          isForbidden: () => false,
          refetchOnWindowFocus: true,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(result.current.options?.workspaces).toHaveLength(6);

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(result.current.options?.workspaces).toHaveLength(14));
    expect(result.current.state.status).toBe('ready');
  });
});
