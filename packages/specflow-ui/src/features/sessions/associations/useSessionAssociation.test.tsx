// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SessionAssociationRead } from '@nevo/specflow-contracts/sessions';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api';
import { sessionAssociationKeys, useSessionAssociation } from './queries';

const association = vi.fn<() => Promise<SessionAssociationRead>>();
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({
    options: { context: { services: { sessionAssociationsApi: { association } } } },
  }),
}));

const read: SessionAssociationRead = {
  sessionId: 's1',
  association: {
    kind: 'specification',
    specification: {
      state: 'available',
      value: { specId: 'spec-s', title: 'Auth', collection: 'current' },
    },
    tasks: [],
  },
};
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
  association.mockReset();
  association.mockResolvedValueOnce(read).mockRejectedValue(error);
  const { result } = renderHook(() => useSessionAssociation('s1'), { wrapper });
  await waitFor(() => expect(result.current.data).toEqual(read));
  await act(() => client.refetchQueries({ queryKey: sessionAssociationKeys.read('s1') }));
  await waitFor(() => expect(result.current.isError).toBe(true));

  return result.current;
}

describe('the association read after a failed refetch of the same principal', () => {
  it('drops the association on a definitive 403', async () => {
    expect((await refetchedAfter(failure('forbidden', 403))).data).toBeUndefined();
  });

  it('drops the association on a definitive 404', async () => {
    expect((await refetchedAfter(failure('not-found', 404))).data).toBeUndefined();
  });

  it('keeps the association already understood through a transient failure', async () => {
    expect((await refetchedAfter(failure('network'))).data).toEqual(read);
  });
});
