import { useQuery } from '@tanstack/react-query';
import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { useAppServices } from '../../../../app/useAppServices';
import { useSpecificationWorkspace } from '../../../specs/read-model';
import type { AgentTitles } from '../presentation';

/** The provider catalogue's title of a model; `undefined` when the catalogue does not list it. */
export function catalogueModelTitle(
  providers: readonly ProviderDescriptor[] | undefined,
  providerId: string | undefined,
  modelId: string | undefined,
): string | undefined {
  return providers
    ?.find((provider) => provider.providerId === providerId)
    ?.models.find((model) => model.modelId === modelId)?.title;
}

/**
 * The provider's own title for a recorded model (`claude-opus-5-5` becomes "Opus 5.5"), read from
 * the Runtime's provider catalogue; the id itself while the catalogue is not read or does not list
 * it. The same catalogue the Run with agent dialog reads for the Specification.
 */
export function useModelTitle(specId: string | undefined) {
  const { managedSessionsApi } = useAppServices();
  const catalogue = useQuery({
    queryKey: ['workflow', 'agent-providers', specId ?? null],
    queryFn: ({ signal }) =>
      managedSessionsApi.providers(specId === undefined ? {} : { specId }, signal),
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  return (providerId: string | undefined, modelId: string | undefined): string | undefined =>
    catalogueModelTitle(catalogue.data?.items, providerId, modelId) ?? modelId;
}

/**
 * Where an agent is named from ({@link AgentTitles}): the Specification's Sessions (the titles the
 * Runtime resolved for what each ran, the same read as the Sessions list) and the provider
 * catalogue. Without a Specification only the catalogue.
 */
export function useAgentTitles(specId: string | undefined): AgentTitles {
  const { specificationApi } = useAppServices();
  const catalogue = useModelTitle(specId);
  const sessions = useSpecificationWorkspace(specId ?? '', specificationApi).data?.sessions;

  return {
    catalogue,
    session: (sessionId) => sessions?.find((candidate) => candidate.id === sessionId),
  };
}
