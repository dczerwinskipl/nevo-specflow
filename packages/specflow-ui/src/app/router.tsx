import type { AuthSessionResponse } from '@nevo/specflow-contracts/authentication';
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
import { UiPlaygroundScreen } from './screens';
import { SpecsOverview } from '../features/specs/overview/SpecsOverview';
import { useSpecsOverview } from '../features/specs/overview/useSpecsOverview';
import { defaultSpecsSource } from '../features/specs/overview/source';
import type { SpecsOverviewSource } from '../features/specs/overview/model';

export interface SpecFlowRouterContext {
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

const specsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: search.collection === 'archive' ? ('archive' as const) : ('active' as const),
  }),
  component: SpecsRouteScreen,
});

const uiPlaygroundRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/ui-playground',
  component: UiPlaygroundScreen,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  runtimeUnavailableRoute,
  appRoute.addChildren([specsRoute, uiPlaygroundRoute]),
]);

export function createSpecFlowRouter(
  history?: RouterHistory,
  auth: AuthStore = createAuthStore(),
  specs: SpecsOverviewSource = defaultSpecsSource(),
) {
  return createRouter({
    routeTree,
    context: { auth, specs },
    ...(history ? { history } : {}),
  });
}

function SpecsRouteScreen() {
  const { specs } = specsRoute.useRouteContext();
  const { collection } = specsRoute.useSearch();
  const navigate = specsRoute.useNavigate();
  const { state, refresh } = useSpecsOverview(specs, collection);
  return (
    <SpecsOverview
      state={state}
      onRefresh={refresh}
      sample={specs.sample}
      onCollectionChange={(value) => void navigate({ search: { collection: value } })}
    />
  );
}

export const router = createSpecFlowRouter();

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
