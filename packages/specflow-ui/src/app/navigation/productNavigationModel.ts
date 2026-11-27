import { productIcons } from '../../shared/product-icons';

const specificationViews = [
  {
    id: 'overview',
    to: '/specs/$specId',
    labelKey: 'specification.viewOverview',
    icon: productIcons.overview,
  },
  {
    id: 'sessions',
    to: '/specs/$specId/sessions',
    labelKey: 'specification.viewSessions',
    icon: productIcons.session.collection,
  },
  {
    id: 'tasks',
    // The Tasks page; a Full Task under it keeps Tasks active.
    to: '/specs/$specId/tasks',
    labelKey: 'specification.viewTasks',
    icon: productIcons.task.collection,
  },
  {
    id: 'documents',
    to: '/specs/$specId/documents',
    labelKey: 'specification.viewDocuments',
    icon: productIcons.document.collection,
  },
  {
    id: 'changes',
    to: '/specs/$specId/changes',
    labelKey: 'specification.changesHeading',
    icon: productIcons.changes,
    requiresGit: true,
  },
  {
    id: 'repository',
    to: '/specs/$specId/repository',
    labelKey: 'specification.viewRepository',
    icon: productIcons.repository,
    requiresGit: true,
  },
] as const;

export function productNavigationItems(
  specId: string | null,
  pathname: string,
  hasGit?: boolean,
  /**
   * Whether the navigation metadata read has settled. Until then capability-dependent
   * destinations (Git) are not rendered, so a cold load never shows items the settled
   * metadata would remove. Once settled, an unknown Git capability keeps them (unknown is
   * not absent).
   */
  metadataSettled = true,
  /** The view that is active off its own route (a Session of the Specification: `sessions`). */
  activeViewId?: string,
) {
  const views = specificationViews.filter(
    (view) => !('requiresGit' in view && (!metadataSettled || hasGit === false)),
  );

  return views.map((view) => {
    const path = specId && view.to?.replace('$specId', encodeURIComponent(specId));

    return {
      ...view,
      active:
        activeViewId !== undefined
          ? view.id === activeViewId
          : Boolean(
              path &&
              (pathname === path || (view.id !== 'overview' && pathname.startsWith(`${path}/`))),
            ),
    };
  });
}

/** The documentation reader's addresses: `/docs` and `/workspaces/:workspaceId/docs…`. */
export function isDocumentationPath(pathname: string): boolean {
  return /^\/(?:docs|workspaces\/[^/]+\/docs)(?:\/|$)/.test(pathname);
}

/**
 * The "select a specification" hint only helps on routes where a specification could have been
 * opened from a list. While creating one (`/specs/new`, including its manual/agent states) there
 * is nothing to select, so the hint would be confusing; the documentation reader is not about a
 * Specification at all.
 */
export function showsNoSpecificationHint(pathname: string): boolean {
  return (
    pathname !== '/specs/new' &&
    !pathname.startsWith('/specs/new/') &&
    !isDocumentationPath(pathname)
  );
}
