// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterContextProvider } from '@tanstack/react-router';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { RuntimeInfoApi } from '../services/runtimeInfoApi';
import { createSpecFlowAppServices } from '../services';
import { createSpecFlowRouter } from './router';
import { useRuntimeMode } from './useRuntimeMode';

function wrapperFor(runtimeInfoApi: RuntimeInfoApi) {
  const router = createSpecFlowRouter(
    createMemoryHistory({ initialEntries: ['/'] }),
    createSpecFlowAppServices({ runtimeInfoApi }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <RouterContextProvider router={router}>{children}</RouterContextProvider>
      </QueryClientProvider>
    );
  };
}

describe('useRuntimeMode', () => {
  it.each(['project', 'demo'] as const)('reports the %s data mode of the Runtime', async (mode) => {
    const { result } = renderHook(() => useRuntimeMode(), {
      wrapper: wrapperFor({ getInfo: () => Promise.resolve({ dataMode: mode }) }),
    });
    expect(result.current).toBe('loading');
    await waitFor(() => expect(result.current).toBe(mode));
  });

  it('is unavailable, never a guessed mode, when Runtime info cannot be read', async () => {
    const { result } = renderHook(() => useRuntimeMode(), {
      wrapper: wrapperFor({ getInfo: () => Promise.reject(new Error('down')) }),
    });
    await waitFor(() => expect(result.current).toBe('unavailable'));
  });
});
