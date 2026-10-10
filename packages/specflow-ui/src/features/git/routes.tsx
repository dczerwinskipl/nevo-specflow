import { createRoute } from '@tanstack/react-router';
import { appRoute } from '../../app/router/root';
import { SpecificationAggregatePage } from '../specs/pages/SpecificationAggregatePage';
import { ChangesView } from './views/ChangesView';
import { RepositoryView } from './views/RepositoryView';

function parseChangesSource(source: unknown): 'base' | 'uncommitted' | 'mr' {
  return source === 'mr' || source === 'uncommitted' ? source : 'base';
}

export const repositoryRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/specs/$specId/repository',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: search.collection === 'archive' ? ('archive' as const) : ('current' as const),
  }),
  component: RepositoryRouteScreen,
});

export const changesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/specs/$specId/changes',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: search.collection === 'archive' ? ('archive' as const) : ('current' as const),
    source: parseChangesSource(search.source),
  }),
  component: ChangesRouteScreen,
});

function RepositoryRouteScreen() {
  const { specId } = repositoryRoute.useParams();
  const { collection } = repositoryRoute.useSearch();
  const navigate = repositoryRoute.useNavigate();
  return (
    <SpecificationAggregatePage specId={specId} title="Repository" section="repository">
      {(data) => (
        <RepositoryView
          repoContext={data.repoContext}
          onGoToChanges={() =>
            void navigate({
              to: '/specs/$specId/changes',
              params: { specId },
              search: { collection, source: 'base' },
            })
          }
        />
      )}
    </SpecificationAggregatePage>
  );
}

function ChangesRouteScreen() {
  const { specId } = changesRoute.useParams();
  const { source, collection } = changesRoute.useSearch();
  const navigate = changesRoute.useNavigate();
  return (
    <SpecificationAggregatePage specId={specId} title="Changes" section="changes">
      {(data) => (
        <ChangesView
          changes={data.changes}
          currentSource={source}
          onSourceChange={(nextSource) => {
            void navigate({ search: { collection, source: nextSource } });
          }}
        />
      )}
    </SpecificationAggregatePage>
  );
}

export const gitAppRoutes = [repositoryRoute, changesRoute] as const;
