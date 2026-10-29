// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { HttpClientError } from '@nevo/http-client';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../api';
import { createSpecFlowQueryClient } from '../../../../app/queryClient';
import { createSpecsFixture } from '../../../../../test-support/specs/overview/fixtures';
import type { SpecsOverviewApi } from './api';
import { specsOverviewKeys } from './queries';
import { useSpecsOverview } from './useSpecsOverview';

function render(getOverview: SpecsOverviewApi['getOverview'], seed = false) {
  const client = createSpecFlowQueryClient();
  if (seed)
  // Cached long ago: mounting refreshes it, so a failing read is a failed refresh.
  {
    client.setQueryData(specsOverviewKeys.collection('current'), createSpecsFixture('current'), {
      updatedAt: 0,
    });
  }

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  return renderHook(() => useSpecsOverview({ getOverview }, 'current'), { wrapper });
}

const apiError = (kind: ApiError['kind'], status: number) =>
  new ApiError({
    kind,
    operation: 'specs.overview',
    outcome: 'not-applied',
    retryable: false,
    status,
  });

describe('useSpecsOverview', () => {
  it('shows the rows once read', async () => {
    const { result } = render(() => Promise.resolve(createSpecsFixture('current')));
    await waitFor(() => expect(result.current.state.projection).toBeDefined());
    expect(result.current.state.error).toBe(false);
  });

  it('reports a forbidden read as access denied and keeps no rows on screen', async () => {
    const { result } = render(() => Promise.reject(apiError('forbidden', 403)), true);
    await waitFor(() => expect(result.current.state.error).toBe(true));
    expect(result.current.state.accessDenied).toBe(true);
    expect(result.current.state.projection).toBeUndefined();
  });

  it('keeps the rows and reports a plain failure when a refresh fails', async () => {
    const { result } = render(() => Promise.reject(apiError('server', 500)), true);
    await waitFor(() => expect(result.current.state.error).toBe(true));
    expect(result.current.state.accessDenied).toBe(false);
    expect(result.current.state.projection).toBeDefined();
  });

  it('understands an unclassified client error too (an injected adapter)', async () => {
    const { result } = render(
      () =>
        Promise.reject(
          new HttpClientError('x', { kind: 'http', status: 403, data: { error: 'forbidden' } }),
        ),
      true,
    );
    await waitFor(() => expect(result.current.state.accessDenied).toBe(true));
  });
});
