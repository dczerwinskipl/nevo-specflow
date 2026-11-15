import { useQuery, type QueryKey } from '@tanstack/react-query';
import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import { isApiError } from '../../../../api';
import { useWorkspaces } from '../../../workspaces/read-model';
import { useVisitFreshOptions } from './visitFreshOptions';
import { joinCreateOptions, type CreateOptionsView } from '../workspace/model/createOptionsView';
import type { WorkspaceOptionsState } from '../workspace/model/workspaceChoice';

export interface CreateOptionsSource {
  queryKey: QueryKey;
  fetch: (signal: AbortSignal) => Promise<CreateOptions>;
  /** Whether a failed read means the principal may not Create (shown as read-only, not as a fault). */
  isForbidden: (error: unknown) => boolean;
  /** Each fetch inspects Git (slow) on the project Runtime, so only the demo refetches on focus. */
  refetchOnWindowFocus: boolean;
  enabled?: boolean;
}

export type CreateOptionsRefresh =
  { kind: 'failed' } | { kind: 'fresh'; options: CreateOptionsView };

export interface CreateOptionsModel {
  /** Fresh options of this visit; undefined until they arrived (a cached answer is not shown). */
  options: CreateOptionsView | undefined;
  state: WorkspaceOptionsState;
  forbidden: boolean;
  fetching: boolean;
  /** The last refresh of either read failed; `options` are then the previously loaded ones. */
  refreshFailed: boolean;
  refresh: () => Promise<CreateOptionsRefresh | undefined>;
}

/**
 * The Create options of the visit: a snapshot of Git state that changes outside the UI, joined
 * with the shared workspace list (names, paths, Specifications). Both are always refetched on
 * entering (never trusted from the cache), never retried on their own, projected into the loading /
 * error / forbidden / ready state the workspace section draws. A workspace list the principal may
 * not read (no `workspace.view`) is forbidden like the options; any other failed read, or a pair
 * that does not join, is an error.
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
  const workspaceList = useWorkspaces({
    enabled: source.enabled,
    fresh: true,
    refetchOnWindowFocus: source.refetchOnWindowFocus,
  });
  const freshOptions = useVisitFreshOptions(query);
  const freshList = useVisitFreshOptions(workspaceList);
  const options =
    freshOptions && freshList ? joinCreateOptions(freshOptions, freshList) : undefined;
  // The list is read through the API transport in both modes: its 403 is an `ApiError`.
  const forbidden =
    (query.isError && source.isForbidden(query.error)) ||
    (workspaceList.isError &&
      isApiError(workspaceList.error) &&
      workspaceList.error.kind === 'forbidden');
  const state: WorkspaceOptionsState = options
    ? { status: 'ready', options }
    : query.isError || workspaceList.isError
      ? { status: forbidden ? 'forbidden' : 'error' }
      : freshOptions && freshList
        ? { status: 'error' }
        : { status: 'loading' };

  return {
    options,
    state,
    forbidden,
    fetching: query.isFetching || workspaceList.isFetching,
    refreshFailed: query.isRefetchError || workspaceList.isRefetchError,
    async refresh() {
      if (query.isFetching || workspaceList.isFetching) {
        return undefined;
      }

      const [result, listResult] = await Promise.all([query.refetch(), workspaceList.refetch()]);

      // A failed refetch still resolves with the previous data: branch on the status, not on data.
      if (result.isError || !result.data || listResult.isError || !listResult.data) {
        return { kind: 'failed' };
      }

      const joined = joinCreateOptions(result.data, listResult.data);

      return joined ? { kind: 'fresh', options: joined } : { kind: 'failed' };
    },
  };
}
