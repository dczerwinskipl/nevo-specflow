import { useQuery } from '@tanstack/react-query';
import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { useAppServices } from '../../../../app/useAppServices';
import { useSpecificationWorkspace } from '../../../specs/read-model';
import type { AgentCatalogue, AgentTitles } from '../presentation';

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
 * The Runtime's provider catalogue as titles: the tool's ("Claude Code") and a recorded model's
 * (`claude-opus-5-5` is "Opus 5.5"); `undefined` for what it does not list or before it is read.
 * The same catalogue the Run with agent dialog reads for the Specification.
 */
export function useAgentCatalogue(specId: string | undefined): AgentCatalogue {
  const { managedSessionsApi } = useAppServices();
  const catalogue = useQuery({
    queryKey: ['workflow', 'agent-providers', specId ?? null],
    queryFn: ({ signal }) =>
      managedSessionsApi.providers(specId === undefined ? {} : { specId }, signal),
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const items = catalogue.data?.items;

  return {
    provider: (providerId) => items?.find((provider) => provider.providerId === providerId)?.title,
    model: (providerId, modelId) => catalogueModelTitle(items, providerId, modelId),
  };
}

/**
 * Where an agent is named from ({@link AgentTitles}): the Specification's Sessions (the titles the
 * Runtime resolved for what each ran, the same read as the Sessions list) and the provider
 * catalogue. Without a Specification only the catalogue.
 */
export function useAgentTitles(specId: string | undefined): AgentTitles {
  const { specificationApi } = useAppServices();
  const catalogue = useAgentCatalogue(specId);
  const sessions = useSpecificationWorkspace(specId ?? '', specificationApi).data?.sessions;

  return {
    catalogue,
    session: (sessionId) => sessions?.find((candidate) => candidate.id === sessionId),
  };
}
