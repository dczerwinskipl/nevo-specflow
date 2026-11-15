import type { QueryClient } from '@tanstack/react-query';

/**
 * The Specifications list caches (current and archive): data other features refresh (a Close
 * moves a Specification to the archive).
 */
export const specsOverviewKeys = {
  all: ['specs-overview'] as const,
  collection: (collection: 'current' | 'archive') =>
    [...specsOverviewKeys.all, collection] as const,
};

export const specificationKeys = {
  all: ['specifications'] as const,
  spec: (specId: string) => [...specificationKeys.all, specId] as const,
  detail: (specId: string) => [...specificationKeys.spec(specId), 'workspace'] as const,
  changes: (specId: string, source: string) =>
    [...specificationKeys.spec(specId), 'changes', source] as const,
};

/**
 * Refresh only the coherent Workspace steering snapshot. Task details, opened
 * documents and Git Changes have their own freshness and refresh lifecycles.
 * Broad "spec" prefix invalidation would accidentally refetch all of them.
 */
export function invalidateSpecificationWorkspace(queryClient: QueryClient, specId: string) {
  return queryClient.invalidateQueries({
    queryKey: specificationKeys.detail(specId),
    exact: true,
    refetchType: 'active',
  });
}
