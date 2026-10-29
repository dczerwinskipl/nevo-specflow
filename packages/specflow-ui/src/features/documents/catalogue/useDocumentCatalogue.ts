import type { ArchetypeCatalogue } from '@nevo/specflow-contracts/documents';
import { useQuery } from '@tanstack/react-query';
import { useDocumentsApi } from '../useDocumentsApi';
import { documentCatalogueKeys } from '../read-model/queries';

/**
 * The archetype catalogue for the tree labels and the type chooser. Best effort: while it loads or
 * when it cannot be read (for example a reader without the Create capability), type labels fall
 * back to the type id and the chooser shows its loading or failure line.
 */
export function useDocumentCatalogue() {
  const { api, kind } = useDocumentsApi();
  return useQuery<ArchetypeCatalogue>({
    queryKey: documentCatalogueKeys.catalogue(kind),
    queryFn: ({ signal }) => api.catalogue(signal),
    // The catalogue changes only with a Runtime configuration change.
    staleTime: 5 * 60 * 1000,
  });
}
