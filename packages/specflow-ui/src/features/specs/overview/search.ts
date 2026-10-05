import type { SpecsOverviewProjection, SpecOverviewIdentity } from './model';

/** One filtered projection owns rows, group counts and the no-results decision. */
export function filterSpecsOverview(
  projection: SpecsOverviewProjection,
  query: string,
): SpecsOverviewProjection {
  const term = query.trim().toLowerCase();
  const matches = (item: SpecOverviewIdentity) => item.title.toLowerCase().includes(term);
  if (projection.collection === 'archive')
    return { ...projection, items: projection.items.filter(matches) };
  return { ...projection, items: projection.items.filter(matches) };
}
