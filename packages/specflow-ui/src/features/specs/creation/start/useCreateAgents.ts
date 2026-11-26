import { useQuery } from '@tanstack/react-query';
import { useAppServices } from '../../../../app/useAppServices';
import { startCatalogueFromProviders } from '../../../sessions';
import type { AgentCatalogue } from '../../../tasks';

export const createAgentsKey = ['create', 'agent-providers'] as const;

/**
 * The agents a Create with an agent can start, read once for the start screen and the agent form
 * (one cache entry): the project's provider catalogue for a standalone start
 * (`GET /api/session-providers`), the same data Run with agent reads for a Specification.
 */
export function useCreateAgents(enabled = true): {
  readonly agents: AgentCatalogue;
  readonly refreshing: boolean;
  readonly refresh: () => void;
} {
  const { managedSessionsApi } = useAppServices();
  const providers = useQuery({
    queryKey: createAgentsKey,
    queryFn: ({ signal }) => managedSessionsApi.providers({}, signal),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const agents: AgentCatalogue = providers.data
    ? {
        status: 'ready',
        catalogue: startCatalogueFromProviders(providers.data.items),
        providers: providers.data.items,
      }
    : providers.isError
      ? { status: 'error' }
      : { status: 'loading' };

  return {
    agents,
    refreshing: providers.isFetching,
    refresh: () => void providers.refetch(),
  };
}
