import { useQuery } from '@tanstack/react-query';
import { specificationKeys } from '../queries';
import type { SpecificationWorkspaceData } from '../workspace/model';

export interface SpecificationNavigationMetadata {
  readonly title: string;
  readonly documentCount: number;
  readonly hasGit: boolean | undefined;
}

/**
 * Sidebar reads only an existing Workspace cache entry; it never fetches the
 * aggregate to render navigation for a directly opened Task or Document.
 * A dedicated lightweight Runtime navigation read model may replace this
 * cache-only adapter when the backend exposes one.
 */
export function useSpecificationNavigationMetadata(specId: string | null) {
  const query = useQuery<SpecificationWorkspaceData, Error, SpecificationNavigationMetadata>({
    queryKey: specificationKeys.detail(specId ?? ''),
    enabled: false,
    select: (data) => ({
      title: data.title,
      documentCount: data.documents.length,
      hasGit: data.hasGit,
    }),
  });
  return specId ? query.data : undefined;
}
