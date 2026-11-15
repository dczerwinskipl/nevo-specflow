/** What the router tells a blocker about a location (`shouldBlockFn({ current, next })`). */
export interface RouteLocationLike {
  fullPath: string;
  params: Record<string, unknown>;
}

const documentsScreen = /^\/specs\/\$specId\/documents(?:\/\$documentId)?\/?$/;
const specificationOverview = /^\/specs\/(?!new(?:\/|$))[^/]+\/?$/;

/**
 * The Specification Overview's address (`/specs/:specId`, not the Create flow's `/specs/new`): the
 * only screen whose scroll the router restores (`router.tsx`). Other screens own their scroll (the
 * documentation reader's reading positions, the Documents panes), and a router restore would race
 * them.
 */
export function isSpecificationOverviewPath(pathname: string): boolean {
  return specificationOverview.test(pathname);
}

/** The Documents list or one document of a specification. */
export function isDocumentsLocation(location: RouteLocationLike): boolean {
  return documentsScreen.test(location.fullPath);
}

/**
 * Moving between the Documents routes of ONE specification (list, any document) is not leaving the
 * Documents screen: tabs switch, open and close inside it, so no leave guard asks.
 */
export function isWithinSpecDocuments(
  current: RouteLocationLike,
  next: RouteLocationLike,
  specId?: string,
): boolean {
  if (!isDocumentsLocation(current) || !isDocumentsLocation(next)) {
    return false;
  }

  if (current.params.specId !== next.params.specId) {
    return false;
  }

  return specId === undefined || next.params.specId === specId;
}
