// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SessionListItem, SessionListPage } from '@nevo/specflow-contracts/sessions';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api';
import { sessionAssociationKeys } from '../associations/queries';
import { useSpecificationSessionList } from './useSpecificationSessionList';

const list = vi.fn<() => Promise<SessionListPage>>();
vi.mock('../../../app/useAppServices', () => ({
  useAppServices: () => ({ sessionAssociationsApi: { list } }),
}));

const page = { items: [{ sessionId: 's1' } as SessionListItem] } as SessionListPage;
const failure = (kind: 'forbidden' | 'not-found' | 'network', status?: number) =>
  new ApiError({
    kind,
    operation: 'sessions.associations',
    outcome: 'not-applied',
    retryable: kind === 'network',
    ...(status ? { status } : {}),
  });

async function refetchedAfter(error: ApiError) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  list.mockReset();
  list.mockResolvedValueOnce(page).mockRejectedValue(error);
  const { result } = renderHook(() => useSpecificationSessionList('spec-s', 'current'), {
    wrapper,
  });
  await waitFor(() => expect(result.current.status).toBe('ready'));
  await act(() =>
    client.refetchQueries({ queryKey: sessionAssociationKeys.list('spec-s', 'current') }),
  );
  const key = sessionAssociationKeys.list('spec-s', 'current');
  await waitFor(() => expect(client.getQueryState(key)?.status).toBe('error'));
  // The hook has rendered the settled refetch.
  await act(() => Promise.resolve());

  return result.current;
}

describe('the Specification Sessions list after a failed refetch of the same principal', () => {
  it('drops the rows on a definitive 403', async () => {
    expect((await refetchedAfter(failure('forbidden', 403))).status).toBe('forbidden');
  });

  it('drops the rows on a definitive 404', async () => {
    expect((await refetchedAfter(failure('not-found', 404))).status).toBe('failed');
  });

  it('keeps the rows already shown through a transient failure', async () => {
    const state = await refetchedAfter(failure('network'));
    expect(state).toMatchObject({ status: 'ready', rows: page.items });
  });
});
