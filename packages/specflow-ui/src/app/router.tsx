import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';

import { createAuthStore, type AuthStore } from '../auth/store';
import { LoginScreen, safeReturnTo } from '../auth/LoginScreen';
import { RuntimeUnavailableScreen } from '../auth/RuntimeUnavailableScreen';
import { SpecFlowShell } from './SpecFlowShell';
import { HomeScreen, UiPlaygroundScreen } from './screens';

export interface SpecFlowRouterContext {
  readonly auth: AuthStore;
}

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
    let session;
    try {
      session = await context.auth.ensureSession();
    } catch {
      throw redirect({
        to: '/runtime-unavailable',
        search: { returnTo: safeReturnTo(search.returnTo) },
      });
    }

    if (!session.authenticationRequired || session.authenticated) {
      throw redirect({ href: safeReturnTo(search.returnTo) });
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
    const returnTo = safeReturnTo(
      `${location.pathname}${location.searchStr}${location.hash}`,
    );
    let session;
    try {
      session = await context.auth.ensureSession();
    } catch {
      throw redirect({
        to: '/runtime-unavailable',
        search: { returnTo },
      });
    }

    if (session.authenticationRequired && !session.authenticated) {
      throw redirect({
        to: '/login',
        search: { returnTo },
      });
    }
  },
  component: () => (
    <SpecFlowShell>
      <Outlet />
    </SpecFlowShell>
  ),
});

const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: HomeScreen,
});

const uiPlaygroundRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/ui-playground',
  component: UiPlaygroundScreen,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  runtimeUnavailableRoute,
  appRoute.addChildren([homeRoute, uiPlaygroundRoute]),
]);

export function createSpecFlowRouter(history?: RouterHistory, auth: AuthStore = createAuthStore()) {
  return createRouter({
    routeTree,
    context: { auth },
    ...(history ? { history } : {}),
  });
}

export const router = createSpecFlowRouter();

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
