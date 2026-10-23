import type { SpecOverviewItem, SpecsCollection, SpecsOverview } from '../model';

/** From this many rows the list is long enough to offer a search (always in the archive). */
const searchThreshold = 12;

export function filterSpecsOverview(projection: SpecsOverview, query: string): SpecsOverview {
  const term = query.trim().toLowerCase();
  if (!term) return projection;

  const matches = (item: SpecOverviewItem) =>
    [
      item.title,
      item.key ?? '',
      ...(item.tags ?? []),
      ...(item.pullRequests ?? []).map((pr) => `PR #${pr.number}`),
    ].some((field) => field.toLowerCase().includes(term));

  // Narrowed per collection: the item type differs between the two projections.
  return projection.collection === 'archive'
    ? { ...projection, items: projection.items.filter(matches) }
    : { ...projection, items: projection.items.filter(matches) };
}

/** The search box stays while a term is typed, so clearing the results never removes it. */
export function isSearchable(
  collection: SpecsCollection,
  term: string,
  projection: SpecsOverview | undefined,
): boolean {
  return (
    collection === 'archive' ||
    term.trim().length > 0 ||
    (projection?.items.length ?? 0) >= searchThreshold
  );
}
