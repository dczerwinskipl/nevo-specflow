import { useEffect } from 'react';
import { createRoute } from '@tanstack/react-router';
import { appRoute, rootRoute } from '../../app/router/root';
import { SpecsOverview } from './overview/SpecsOverview';
import { useSpecsOverview } from './overview/useSpecsOverview';
import { SpecsAccessDenied } from './overview/SpecsAccessDenied';
import { SpecificationSurface } from './SpecificationSurface';
import { useSpecificationWorkspace } from './useSpecificationWorkspace';
import type { SpecificationWorkspaceView } from './workspace/model';

export const specsForbiddenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/access-denied',
  component: SpecsAccessDenied,
});

export const specsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: search.collection === 'archive' ? ('archive' as const) : ('current' as const),
  }),
  component: SpecsRouteScreen,
});

export const specificationRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/specs/$specId',
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    collection: 'current' | 'archive';
    view?: SpecificationWorkspaceView;
    task?: string;
  } => ({
    collection: search.collection === 'archive' ? 'archive' : 'current',
    ...(typeof search.view === 'string' ? { view: search.view as SpecificationWorkspaceView } : {}),
    ...(typeof search.task === 'string' ? { task: search.task } : {}),
  }),
  component: SpecificationRouteScreen,
});

function SpecsRouteScreen() {
  const { specs, auth } = specsRoute.useRouteContext();
  const { collection } = specsRoute.useSearch();
  const navigate = specsRoute.useNavigate();
  const { state, refresh } = useSpecsOverview(specs, collection);

  useEffect(() => {
    if (state.errorStatus === 403) {
      void navigate({ to: '/access-denied', replace: true });
    } else if (state.errorStatus === 401) {
      void auth.refresh().then(
        () =>
          navigate({
            to: '/login',
            search: { returnTo: `/?collection=${collection}` },
            replace: true,
          }),
        () =>
          navigate({
            to: '/runtime-unavailable',
            search: { returnTo: `/?collection=${collection}` },
            replace: true,
          }),
      );
    }
  }, [state.errorStatus, auth, navigate, collection]);

  if (state.errorStatus === 401 || state.errorStatus === 403) return null;

  return (
    <SpecsOverview
      state={state}
      onRefresh={refresh}
      sample={specs.sample}
      onCollectionChange={(value) => void navigate({ search: { collection: value } })}
      specificationHref={(specId) =>
        `/specs/${encodeURIComponent(specId)}?collection=${collection}`
      }
      onOpenTarget={(target) =>
        void navigate({
          to: '/specs/$specId',
          params: { specId: target.specId },
          search: { collection },
        })
      }
    />
  );
}

function SpecificationRouteScreen() {
  const { specId } = specificationRoute.useParams();
  const { collection, view, task } = specificationRoute.useSearch();
  const { services, auth } = specificationRoute.useRouteContext();
  const navigate = specificationRoute.useNavigate();
  const { errorStatus } = useSpecificationWorkspace(specId, services.specificationApi);

  useEffect(() => {
    if (errorStatus === 403) {
      void navigate({ to: '/access-denied', replace: true });
    } else if (errorStatus === 401) {
      void auth.refresh().then(
        () =>
          navigate({
            to: '/login',
            search: { returnTo: `/specs/${encodeURIComponent(specId)}?collection=${collection}` },
            replace: true,
          }),
        () =>
          navigate({
            to: '/runtime-unavailable',
            search: { returnTo: `/specs/${encodeURIComponent(specId)}?collection=${collection}` },
            replace: true,
          }),
      );
    }
  }, [errorStatus, auth, navigate, specId, collection]);

  if (errorStatus === 401 || errorStatus === 403) return null;

  return (
    <SpecificationSurface
      specId={specId}
      overviewHref={`/?collection=${collection}`}
      onBack={() => void navigate({ to: '/', search: { collection } })}
      initialView={view}
      initialTask={task}
      onViewChange={(newView) => {
        void navigate({
          search: (prev) => ({
            ...prev,
            view: newView === 'work' ? undefined : newView,
            task: newView === 'task' ? prev.task : undefined,
          }),
        });
      }}
      onTaskChange={(newTaskId) => {
        void navigate({
          search: (prev) => ({
            ...prev,
            view: newTaskId ? 'task' : undefined,
            task: newTaskId ?? undefined,
          }),
        });
      }}
    />
  );
}

export const specsAppRoutes = [specsRoute, specificationRoute] as const;
export const specsRootRoutes = [specsForbiddenRoute] as const;
