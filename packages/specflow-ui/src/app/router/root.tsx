import { createRootRouteWithContext, createRoute, Outlet, redirect } from '@tanstack/react-router';
import type { AuthStore } from '../../auth/store';
import { resolveAppAccess, safeReturnTo } from '../../auth/access';
import type { SpecsOverviewSource } from '../../features/specs/overview/model';
import type { SpecFlowAppServices } from '../dependencies';
import { SpecFlowShell } from '../SpecFlowShell';

export interface SpecFlowRouterContext {
  readonly services: SpecFlowAppServices;
  readonly auth: AuthStore;
  readonly specs: SpecsOverviewSource;
}

export const rootRoute = createRootRouteWithContext<SpecFlowRouterContext>()({
  component: Outlet,
});

export const appRoute = createRoute({
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

function AppRouteLayout() {
  const { auth } = appRoute.useRouteContext();
  return (
    <SpecFlowShell auth={auth}>
      <Outlet />
    </SpecFlowShell>
  );
}
