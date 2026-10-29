import { createRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { SpecificationAggregatePage } from '../specs';
import { specificationRoute } from '../specs/routes';
import { parseSpecificationCollection } from '../../app/router/search';

import { ChangesView } from './views/ChangesView';
import { RepositoryView } from './views/RepositoryView';

function parseChangesSource(source: unknown): 'base' | 'uncommitted' | 'mr' {
  return source === 'mr' || source === 'uncommitted' ? source : 'base';
}

export const repositoryRoute = createRoute({
  getParentRoute: () => specificationRoute,
  path: 'repository',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: parseSpecificationCollection(search),
  }),
  component: RepositoryRouteScreen,
});

export const changesRoute = createRoute({
  getParentRoute: () => specificationRoute,
  path: 'changes',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: parseSpecificationCollection(search),
    source: parseChangesSource(search.source),
  }),
  component: ChangesRouteScreen,
});

function RepositoryRouteScreen() {
  const { specId } = repositoryRoute.useParams();
  const { collection } = repositoryRoute.useSearch();
  const navigate = repositoryRoute.useNavigate();
  const { t } = useTranslation();

  return (
    <SpecificationAggregatePage
      specId={specId}
      title={t('specification.repositoryHeading')}
      section="repository"
      loadingShape="summary"
    >
      {(data) => (
        <RepositoryView
          showHeading={false}
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
  const { t } = useTranslation();

  return (
    <SpecificationAggregatePage
      specId={specId}
      title={t('specification.changesHeading')}
      section="changes"
      loadingShape="summary"
    >
      {(data) => (
        <ChangesView
          showHeading={false}
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
