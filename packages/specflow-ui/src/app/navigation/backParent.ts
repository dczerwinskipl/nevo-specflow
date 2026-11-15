/**
 * Where a Back control leads: a defined parent in the product hierarchy, never raw browser
 * history. The parent depends only on the screen and, where an existing contract carries it, on
 * the context of the visit (router state, search), so it also resolves for a screen opened from a
 * deep link, a reload or another tab.
 */
export type BackParentId = 'specifications' | 'overview' | 'tasks' | 'documents' | 'sessions';

/** A parent inside one Specification: its target needs that Specification's id. */
export type SpecificationBackParentId = Exclude<BackParentId, 'specifications'>;

/** The parent's name in the Back label ("Back to <parent>"): the parent screen's own title. */
export const backParentTitleKey = {
  specifications: 'navigation.specifications',
  overview: 'specification.viewOverview',
  tasks: 'specification.viewTasks',
  documents: 'specification.viewDocuments',
  sessions: 'specification.viewSessions',
} as const satisfies Record<BackParentId, string>;

type Collection = 'current' | 'archive';

/** The Specifications list, keeping the collection. */
export function specificationsTarget(collection: Collection) {
  return { to: '/' as const, search: { collection } };
}

/** Router navigation options for a parent inside a Specification, keeping the collection. */
export function specificationParentTarget(
  parent: SpecificationBackParentId,
  specId: string,
  collection: Collection,
) {
  const params = { specId };
  const search = { collection };
  switch (parent) {
    case 'overview':
      return { to: '/specs/$specId' as const, params, search };
    case 'tasks':
      // Tasks is the Overview's Work section (the navigation's Tasks destination).
      return { to: '/specs/$specId' as const, params, search, hash: 'tasks-heading' };
    case 'documents':
      return { to: '/specs/$specId/documents' as const, params, search };
    case 'sessions':
      return { to: '/specs/$specId/sessions' as const, params, search };
  }
}

/**
 * A document's parent. Promoted from the Specification Overview (the visit's router state
 * `specflowDocumentReturnTo`), it returns there; otherwise, a deep link included, its parent is
 * the Documents list. A way back to a Session takes precedence (it is a flow of its own).
 */
export function documentBackParent({
  returnTo,
  sessionReturn,
}: {
  returnTo: unknown;
  sessionReturn: boolean;
}): 'overview' | 'documents' {
  return !sessionReturn && returnTo === 'overview' ? 'overview' : 'documents';
}

/**
 * How a Back to the routed parent moves: when the previous history entry is the parent's own visit
 * (its index was recorded when the screen was opened from it), Back steps there, so that visit
 * returns as it was left (its scroll), also after a reload (the history entries and their state
 * survive it); otherwise (a deep link, a later push such as a new document tab) it navigates to the
 * parent.
 */
export function backByHistory({
  parentIndex,
  currentIndex,
}: {
  parentIndex: number | undefined;
  currentIndex: number | undefined;
}): boolean {
  return (
    parentIndex !== undefined && currentIndex !== undefined && parentIndex === currentIndex - 1
  );
}

/**
 * The parent of a flow page (Narrow body Back): the list the flow was started from. A Session
 * start refused because Sessions are turned off leads to the Overview, not to the disabled area.
 */
export function flowBackParent(
  view: 'new-specification' | 'new-session',
  sessionsDisabled = false,
): BackParentId {
  return view === 'new-specification'
    ? 'specifications'
    : sessionsDisabled
      ? 'overview'
      : 'sessions';
}
