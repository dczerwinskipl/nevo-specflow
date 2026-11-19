import { useQuery } from '@tanstack/react-query';
import { useAppServices } from '../../../app/useAppServices';

/** The Specification's workflow action projection, under the Specification scope. */
export const specificationActionsKey = (specId: string) =>
  ['specifications', specId, 'workflow-actions'] as const;

/**
 * What the owner may do with the Specification now (`createTask`, the allowed task types) and how
 * its workflow uses each document (`documentRelations`). A read hook other features may use.
 */
export function useSpecificationActions(specId: string, enabled = true) {
  const { taskAuthoringApi } = useAppServices();

  return useQuery({
    queryKey: specificationActionsKey(specId),
    queryFn: ({ signal }) => taskAuthoringApi.specificationActions(specId, signal),
    enabled,
  });
}
