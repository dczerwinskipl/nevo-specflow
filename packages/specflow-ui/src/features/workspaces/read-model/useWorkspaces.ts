import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { WorkspaceList } from '@nevo/specflow-contracts/workspaces';
import { useAppServices } from '../../../app/useAppServices';
import { workspaceKeys } from './queries';

export interface UseWorkspacesOptions {
  enabled?: boolean;
  /**
   * Whether a cached list is never trusted on mount: it is refetched and not retried, for a
   * consumer that joins it with another snapshot of the same instant (Create Specification).
   */
  fresh?: boolean;
  /** With `fresh`: refetch on window focus like the snapshot it is joined with (default no). */
  refetchOnWindowFocus?: boolean;
}

/** The registered workspaces of the project: one shared query under the key `['workspaces']`. */
export function useWorkspaces(options: UseWorkspacesOptions = {}): UseQueryResult<WorkspaceList> {
  const { workspaceApi } = useAppServices();

  return useQuery({
    queryKey: workspaceKeys.list,
    queryFn: ({ signal }) => workspaceApi.list(signal),
    enabled: options.enabled ?? true,
    ...(options.fresh
      ? {
          retry: false,
          staleTime: 0,
          refetchOnMount: 'always' as const,
          refetchOnWindowFocus: options.refetchOnWindowFocus ?? false,
        }
      : {}),
  });
}
