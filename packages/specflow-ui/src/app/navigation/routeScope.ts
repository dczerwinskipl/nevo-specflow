/** What the router tells a blocker about a location (`shouldBlockFn({ current, next })`). */
export interface RouteLocationLike {
  fullPath: string;
  params: Record<string, unknown>;
}

const documentsScreen = /^\/specs\/\$specId\/documents(?:\/\$documentId)?\/?$/;

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
  if (!isDocumentsLocation(current) || !isDocumentsLocation(next)) return false;
  if (current.params.specId !== next.params.specId) return false;
  return specId === undefined || next.params.specId === specId;
}
