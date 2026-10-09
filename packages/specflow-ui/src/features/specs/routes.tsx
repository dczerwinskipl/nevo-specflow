import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createRoute, redirect } from '@tanstack/react-router';
import { appRoute, rootRoute } from '../../app/router/root';
import { SpecsOverview } from './overview/SpecsOverview';
import { useSpecsOverview } from './overview/useSpecsOverview';
import { SpecsAccessDenied } from './overview/SpecsAccessDenied';
import { SpecificationSurface } from './SpecificationSurface';
import { useSpecificationWorkspace } from './useSpecificationWorkspace';
import type { SpecificationWorkspaceView } from './workspace/model';
import { useSpecificationTask } from './tasks/useSpecificationTask';
import { SpecificationTaskPage } from './tasks/SpecificationTaskPage';

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

const VALID_VIEWS: ReadonlySet<SpecificationWorkspaceView> = new Set([
  'work',
  'documents',
  'sessions',
  'changes',
  'repository',
  'task',
]);

function isValidView(view: unknown): view is SpecificationWorkspaceView {
  return typeof view === 'string' && VALID_VIEWS.has(view as SpecificationWorkspaceView);
}

export function validateSpecificationSearch(search: Record<string, unknown>): {
  collection: 'current' | 'archive';
  view?: SpecificationWorkspaceView;
  task?: string;
} {
  const collection = search.collection === 'archive' ? 'archive' : 'current';
  const rawView = isValidView(search.view) ? search.view : undefined;
  const rawTask =
    typeof search.task === 'string' && search.task.trim().length > 0
      ? search.task.trim()
      : undefined;

  let view: SpecificationWorkspaceView | undefined;
  let task: string | undefined;

  if (rawView === 'task') {
    view = 'task';
    task = rawTask;
  } else if (rawView && rawView !== 'work') {
    view = rawView;
    task = undefined;
  } else if (rawTask) {
    view = 'task';
    task = rawTask;
  }

  return {
    collection,
    ...(view ? { view } : {}),
    ...(task ? { task } : {}),
  };
}

export const specificationRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/specs/$specId',
  validateSearch: validateSpecificationSearch,
  beforeLoad: ({ params, search }) => {
    // Old Full Task search links still reach the resource, without loading the Workspace list.
    if (search.view === 'task') {
      if (search.task) {
        throw redirect({
          to: '/specs/$specId/tasks/$taskId',
          params: { specId: params.specId, taskId: search.task },
          search: { collection: search.collection },
          replace: true,
        });
      }
      throw redirect({
        to: '/specs/$specId',
        params: { specId: params.specId },
        search: { collection: search.collection },
        replace: true,
      });
    }
  },
  component: SpecificationRouteScreen,
});

export const specificationTaskRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/specs/$specId/tasks/$taskId',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: search.collection === 'archive' ? ('archive' as const) : ('current' as const),
  }),
  component: SpecificationTaskRouteScreen,
});

function SpecificationTaskRouteScreen() {
  const { specId, taskId } = specificationTaskRoute.useParams();
  const { collection } = specificationTaskRoute.useSearch();
  const { services, auth } = specificationTaskRoute.useRouteContext();
  const navigate = specificationTaskRoute.useNavigate();
  const taskState = useSpecificationTask(specId, taskId, services.specificationApi);
  const returnTo = `/specs/${encodeURIComponent(specId)}/tasks/${encodeURIComponent(taskId)}?collection=${collection}`;

  useEffect(() => {
    if (taskState.errorStatus === 403) {
      void navigate({ to: '/access-denied', replace: true });
    } else if (taskState.errorStatus === 401) {
      void auth.refresh().then(
        () => navigate({ to: '/login', search: { returnTo }, replace: true }),
        () => navigate({ to: '/runtime-unavailable', search: { returnTo }, replace: true }),
      );
    }
  }, [taskState.errorStatus, auth, navigate, returnTo]);

  if (taskState.errorStatus === 401 || taskState.errorStatus === 403) return null;
  const onBack = () =>
    void navigate({ to: '/specs/$specId', params: { specId }, search: { collection } });
  return (
    <SpecificationTaskPage
      specId={specId}
      taskId={taskId}
      collection={collection}
      taskState={taskState}
      onBack={onBack}
    />
  );
}

function SpecsRouteScreen() {
  const { specs, auth, services } = specsRoute.useRouteContext();
  const runtimeInfo = useQuery({
    queryKey: ['runtime-info'],
    queryFn: ({ signal }) => services.runtimeInfoApi.getInfo(signal),
  });
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
      sample={runtimeInfo.data?.dataMode === 'demo'}
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
      onNavigateView={({ view: nextView, taskId: nextTaskId }) => {
        if (nextView === 'task' && nextTaskId) {
          void navigate({
            to: '/specs/$specId/tasks/$taskId',
            params: { specId, taskId: nextTaskId },
            search: { collection },
          });
          return;
        }
        void navigate({
          search: (prev) => ({
            ...prev,
            view: nextView === 'work' ? undefined : nextView,
            task: nextView === 'task' ? (nextTaskId ?? undefined) : undefined,
          }),
        });
      }}
    />
  );
}

export const specsAppRoutes = [specsRoute, specificationRoute, specificationTaskRoute] as const;
export const specsRootRoutes = [specsForbiddenRoute] as const;
