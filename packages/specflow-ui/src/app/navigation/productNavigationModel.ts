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
    // Tasks has no standalone route; it is the "main" Work section already rendered on the
    // Specification Overview route, identified by #tasks-heading. Navigating here focuses that
    // section instead of inventing a separate Tasks page.
    to: '/specs/$specId',
    hash: 'tasks-heading',
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
  hash = '',
  /**
   * Whether the navigation metadata read has settled. Until then capability-dependent
   * destinations (Git) are not rendered, so a cold load never shows items the settled
   * metadata would remove. Once settled, an unknown Git capability keeps them (unknown is
   * not absent).
   */
  metadataSettled = true,
) {
  const views = specificationViews.filter(
    (view) => !('requiresGit' in view && (!metadataSettled || hasGit === false)),
  );
  // A view that points at the same route as another (e.g. Tasks shares the Overview route and
  // is distinguished only by an in-page #hash anchor) is only "active" for its own hash; the
  // plain route owner is active once no sibling's hash claims it.
  const hashesByPath = new Map<string, string[]>();
  for (const view of views) {
    if (!('hash' in view)) {
      continue;
    }

    const list = hashesByPath.get(view.to) ?? [];
    list.push(view.hash);
    hashesByPath.set(view.to, list);
  }

  return views.map((view) => {
    const path = specId && view.to?.replace('$specId', encodeURIComponent(specId));
    const siblingHashes = hashesByPath.get(view.to) ?? [];
    const ownHash = 'hash' in view ? view.hash : undefined;
    const hashMatches = ownHash ? hash === ownHash : !siblingHashes.includes(hash);

    return {
      ...view,
      active: Boolean(
        path &&
        hashMatches &&
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
