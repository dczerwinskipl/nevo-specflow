import { useQuery, type QueryKey } from '@tanstack/react-query';
import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import { useVisitFreshOptions } from './visitFreshOptions';
import type { WorkspaceOptionsState } from './workspace/WorkspacePlaceSection';

export interface CreateOptionsSource {
  queryKey: QueryKey;
  fetch: (signal: AbortSignal) => Promise<CreateOptions>;
  /** Whether a failed read means the principal may not Create (shown as read-only, not as a fault). */
  isForbidden: (error: unknown) => boolean;
  /** Each fetch inspects Git (slow) on the project Runtime, so only the demo refetches on focus. */
  refetchOnWindowFocus: boolean;
  enabled?: boolean;
}

export type CreateOptionsRefresh = { kind: 'failed' } | { kind: 'fresh'; options: CreateOptions };

export interface CreateOptionsModel {
  /** Fresh options of this visit; undefined until they arrived (a cached answer is not shown). */
  options: CreateOptions | undefined;
  state: WorkspaceOptionsState;
  forbidden: boolean;
  fetching: boolean;
  /** The last refresh failed; `options` are then the previously loaded ones. */
  refreshFailed: boolean;
  refresh: () => Promise<CreateOptionsRefresh | undefined>;
}

/**
 * The Create options of the visit: a snapshot of Git state that changes outside the UI. Always
 * refetched on entering (never trusted from the cache), never retried on its own, projected into
 * the loading / error / forbidden / ready state the workspace section draws.
 */
export function useCreateOptions(source: CreateOptionsSource): CreateOptionsModel {
  const query = useQuery({
    queryKey: source.queryKey,
    queryFn: ({ signal }) => source.fetch(signal),
    enabled: source.enabled ?? true,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: source.refetchOnWindowFocus,
  });
  const options = useVisitFreshOptions(query);
  const forbidden = query.isError && source.isForbidden(query.error);
  const state: WorkspaceOptionsState = options
    ? { status: 'ready', options }
    : query.isError
      ? { status: forbidden ? 'forbidden' : 'error' }
      : { status: 'loading' };
  return {
    options,
    state,
    forbidden,
    fetching: query.isFetching,
    refreshFailed: query.isRefetchError,
    async refresh() {
      if (query.isFetching) return undefined;
      const result = await query.refetch();
      // A failed refetch still resolves with the previous data: branch on the status, not on data.
      return result.isError || !result.data
        ? { kind: 'failed' }
        : { kind: 'fresh', options: result.data };
    },
  };
}
