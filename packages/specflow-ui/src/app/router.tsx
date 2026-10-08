import type { AuthSessionResponse } from '@nevo/specflow-contracts/authentication';
import { useEffect } from 'react';
import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';

import type { AuthStore } from '../auth/store';
import { LoginScreen, safeReturnTo } from '../auth/LoginScreen';
import { RuntimeUnavailableScreen } from '../auth/RuntimeUnavailableScreen';
import { SpecFlowShell } from './SpecFlowShell';
import { UiPlaygroundScreen } from './screens';
import { SpecsOverview } from '../features/specs/overview/SpecsOverview';
import { useSpecsOverview } from '../features/specs/overview/useSpecsOverview';
import { SpecsAccessDenied } from '../features/specs/overview/SpecsAccessDenied';
import { SpecificationSurface } from '../features/specs/SpecificationSurface';
import { useSpecificationWorkspace } from '../features/specs/useSpecificationWorkspace';
import { defaultSpecFlowServices } from '../services';
import type { SpecificationWorkspaceView } from '../features/specs/workspace/model';
import type { SpecsOverviewSource } from '../features/specs/overview/model';
import { createSpecFlowAppServices, type SpecFlowAppServices } from './dependencies';

export interface SpecFlowRouterContext {
  readonly services: SpecFlowAppServices;
  readonly auth: AuthStore;
  readonly specs: SpecsOverviewSource;
}

export type AppAccessDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'login'; readonly returnTo: string }
  | { readonly kind: 'runtime-unavailable'; readonly returnTo: string };

export type LoginAccessDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'app'; readonly returnTo: string }
  | { readonly kind: 'runtime-unavailable'; readonly returnTo: string };

const rootRoute = createRootRouteWithContext<SpecFlowRouterContext>()({
  component: Outlet,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.returnTo === 'string' ? { returnTo: search.returnTo } : {}),
    ...(typeof search.error === 'string' ? { error: search.error } : {}),
  }),
  beforeLoad: async ({ context, search }) => {
    const decision = await resolveLoginAccess(context.auth, search.returnTo);

    if (decision.kind === 'runtime-unavailable') {
      redirect({
        to: '/runtime-unavailable',
        search: { returnTo: decision.returnTo },
        throw: true,
      });
    }

    if (decision.kind === 'app') {
      redirect({ href: decision.returnTo, throw: true });
    }
  },
  component: LoginRouteScreen,
});

const runtimeUnavailableRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/runtime-unavailable',
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.returnTo === 'string' ? { returnTo: search.returnTo } : {}),
  }),
  component: RuntimeUnavailableRouteScreen,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  beforeLoad: async ({ context, location }) => {
    const returnTo = safeReturnTo(`${location.pathname}${location.searchStr}${location.hash}`);
    const decision = await resolveAppAccess(context.auth, returnTo);

    if (decision.kind === 'runtime-unavailable') {
      redirect({
        to: '/runtime-unavailable',
        search: { returnTo: decision.returnTo },
        throw: true,
      });
    }

    if (decision.kind === 'login') {
      redirect({
        to: '/login',
        search: { returnTo: decision.returnTo },
        throw: true,
      });
    }
  },
  component: AppRouteLayout,
});

const specsForbiddenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/access-denied',
  component: SpecsAccessDenied,
});

const specsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: search.collection === 'archive' ? ('archive' as const) : ('current' as const),
  }),
  component: SpecsRouteScreen,
});

const uiPlaygroundRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/ui-playground',
  component: UiPlaygroundScreen,
});

const specificationRoute = createRoute({
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

const routeTree = rootRoute.addChildren([
  loginRoute,
  runtimeUnavailableRoute,
  specsForbiddenRoute,
  appRoute.addChildren([specsRoute, specificationRoute, uiPlaygroundRoute]),
]);

export function createSpecFlowRouter(
  history?: RouterHistory,
  servicesOrAuth:
    | SpecFlowAppServices
    | AuthStore
    | {
        readonly auth: AuthStore;
        readonly specs?: SpecsOverviewSource;
      } = createSpecFlowAppServices(),
  specs?: SpecsOverviewSource,
) {
  let services: SpecFlowAppServices;

  if ('http' in servicesOrAuth && 'specificationApi' in servicesOrAuth) {
    services = servicesOrAuth;
  } else if ('auth' in servicesOrAuth) {
    services = createSpecFlowAppServices({
      authStore: servicesOrAuth.auth,
      specsSource: servicesOrAuth.specs,
    });
  } else if ('ensureSession' in servicesOrAuth) {
    services = createSpecFlowAppServices({
      authStore: servicesOrAuth,
      specsSource: specs,
    });
  } else {
    services = createSpecFlowAppServices();
  }

  const context: SpecFlowRouterContext = {
    services,
    auth: services.authStore,
    specs: services.specsSource,
  };

  return createRouter({
    routeTree,
    context,
    ...(history ? { history } : {}),
  });
}

function SpecsRouteScreen() {
  const { specs, auth } = specsRoute.useRouteContext();
  const { collection } = specsRoute.useSearch();
  const navigate = specsRoute.useNavigate();
  const { state, refresh } = useSpecsOverview(specs, collection);
  useEffect(() => {
    if (state.errorStatus === 403) {
      void navigate({ to: '/access-denied', replace: true });
    } else if (state.errorStatus === 401) {
      // Refresh the cached authentication context before the login guard runs.
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
          }),
        });
      }}
    />
  );
}

export const router = createSpecFlowRouter(undefined, defaultSpecFlowServices);

export async function resolveAppAccess(
  auth: AuthStore,
  returnTo: string,
): Promise<AppAccessDecision> {
  const safeTarget = safeReturnTo(returnTo);
  let session: AuthSessionResponse;

  try {
    session = await auth.ensureSession();
  } catch {
    return { kind: 'runtime-unavailable', returnTo: safeTarget };
  }

  return session.authenticationRequired && !session.authenticated
    ? { kind: 'login', returnTo: safeTarget }
    : { kind: 'allow' };
}

export async function resolveLoginAccess(
  auth: AuthStore,
  returnTo: string | undefined,
): Promise<LoginAccessDecision> {
  const safeTarget = safeReturnTo(returnTo);
  let session: AuthSessionResponse;

  try {
    session = await auth.ensureSession();
  } catch {
    return { kind: 'runtime-unavailable', returnTo: safeTarget };
  }

  return !session.authenticationRequired || session.authenticated
    ? { kind: 'app', returnTo: safeTarget }
    : { kind: 'allow' };
}

function AppRouteLayout() {
  const { auth } = appRoute.useRouteContext();
  return (
    <SpecFlowShell auth={auth}>
      <Outlet />
    </SpecFlowShell>
  );
}

function LoginRouteScreen() {
  const { auth } = loginRoute.useRouteContext();
  const search = loginRoute.useSearch();
  return <LoginScreen auth={auth} initialError={search.error} returnTo={search.returnTo} />;
}

function RuntimeUnavailableRouteScreen() {
  const { auth } = runtimeUnavailableRoute.useRouteContext();
  const search = runtimeUnavailableRoute.useSearch();
  return <RuntimeUnavailableScreen auth={auth} returnTo={search.returnTo} />;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createSpecFlowRouter>;
  }
}
