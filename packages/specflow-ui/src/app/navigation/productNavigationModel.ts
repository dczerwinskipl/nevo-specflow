import { Home, MessagesSquare, ListChecks, Files, GitCompare, FolderGit2 } from 'lucide-react';

const specificationViews = [
  { id: 'overview', to: '/specs/$specId', labelKey: 'specification.viewOverview', icon: Home },
  {
    id: 'sessions',
    to: '/specs/$specId/sessions',
    labelKey: 'specification.viewSessions',
    icon: MessagesSquare,
  },
  {
    id: 'tasks',
    // The Tasks page; a Full Task under it keeps Tasks active.
    to: '/specs/$specId/tasks',
    labelKey: 'specification.viewTasks',
    icon: ListChecks,
  },
  {
    id: 'documents',
    to: '/specs/$specId/documents',
    labelKey: 'specification.viewDocuments',
    icon: Files,
  },
  {
    id: 'changes',
    to: '/specs/$specId/changes',
    labelKey: 'specification.changesHeading',
    icon: GitCompare,
    requiresGit: true,
  },
  {
    id: 'repository',
    to: '/specs/$specId/repository',
    labelKey: 'specification.viewRepository',
    icon: FolderGit2,
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

/**
 * The "select a specification" hint only helps on routes where a specification could have been
 * opened from a list. While creating one (`/specs/new`, including its manual/agent states) there
 * is nothing to select, so the hint would be confusing.
 */
export function showsNoSpecificationHint(pathname: string): boolean {
  return pathname !== '/specs/new' && !pathname.startsWith('/specs/new/');
}
