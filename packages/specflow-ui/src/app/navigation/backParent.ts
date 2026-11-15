/**
 * Where a Back control leads: a defined parent in the product hierarchy, never raw browser
 * history. The parent depends only on the screen and, where an existing contract carries it, on
 * the context of the visit (router state, search), so it also resolves for a screen opened from a
 * deep link, a reload or another tab.
 */
export type BackParentId = 'specifications' | 'overview' | 'tasks' | 'documents' | 'sessions';

/** The parent's name in the Back label ("Back to <parent>"): the parent screen's own title. */
export const backParentTitleKey = {
  specifications: 'navigation.specifications',
  overview: 'specification.viewOverview',
  tasks: 'specification.viewTasks',
  documents: 'specification.viewDocuments',
  sessions: 'specification.viewSessions',
} as const satisfies Record<BackParentId, string>;

type Collection = 'current' | 'archive';

/** Router navigation options for a parent; the collection and the Specification are kept. */
export function backParentTarget(
  parent: BackParentId,
  specId: string | undefined,
  collection: Collection,
) {
  switch (parent) {
    case 'specifications':
      return { to: '/' as const, search: { collection } };
    case 'overview':
      return {
        to: '/specs/$specId' as const,
        params: { specId: specId ?? '' },
        search: { collection },
      };
    case 'tasks':
      // Tasks is the Overview's Work section (the navigation's Tasks destination).
      return {
        to: '/specs/$specId' as const,
        params: { specId: specId ?? '' },
        search: { collection },
        hash: 'tasks-heading',
      };
    case 'documents':
      return {
        to: '/specs/$specId/documents' as const,
        params: { specId: specId ?? '' },
        search: { collection },
      };
    case 'sessions':
      return {
        to: '/specs/$specId/sessions' as const,
        params: { specId: specId ?? '' },
        search: { collection },
      };
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

/** The parent of a flow page (Narrow body Back): the list the flow was started from. */
export function flowBackParent(view: 'new-specification' | 'new-session'): BackParentId {
  return view === 'new-session' ? 'sessions' : 'specifications';
}
