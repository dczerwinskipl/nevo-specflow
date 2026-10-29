import { skipToken, useQuery } from '@tanstack/react-query';
import type { SpecsOverview } from '../../features/specs/overview/model';
import { specsOverviewKeys } from '../../features/specs/overview/data/queries';

/**
 * Whether the project is known to have no specification at all: the current list (read by the
 * overview, never fetched here) is loaded and empty, and the archive is empty or not loaded. Then
 * "choose a specification from the list" has nothing to point at, so the navigation leaves it out.
 */
export function useNoSpecifications(): boolean {
  const current = useQuery<SpecsOverview>({
    queryKey: specsOverviewKeys.collection('current'),
    queryFn: skipToken,
  });
  const archive = useQuery<SpecsOverview>({
    queryKey: specsOverviewKeys.collection('archive'),
    queryFn: skipToken,
  });

  return current.data?.items.length === 0 && (archive.data?.items.length ?? 0) === 0;
}
