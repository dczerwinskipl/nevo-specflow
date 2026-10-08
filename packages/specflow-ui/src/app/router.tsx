import { createRoute, createRouter, type RouterHistory } from '@tanstack/react-router';

import type { AuthStore } from '../auth/store';
import { authRoutes, loginRoute, runtimeUnavailableRoute } from '../auth/routes';
import {
  resolveAppAccess,
  resolveLoginAccess,
  safeReturnTo,
  type AppAccessDecision,
  type LoginAccessDecision,
} from '../auth/access';
import {
  specsAppRoutes,
  specsRootRoutes,
  specsRoute,
  specificationRoute,
  specsForbiddenRoute,
} from '../features/specs/routes';
import type { SpecsOverviewSource } from '../features/specs/overview/model';
import { defaultSpecFlowServices } from '../services';
import { createSpecFlowAppServices, type SpecFlowAppServices } from './dependencies';
import { UiPlaygroundScreen } from './screens';
import { rootRoute, appRoute, type SpecFlowRouterContext } from './router/root';

export {
  rootRoute,
  appRoute,
  loginRoute,
  runtimeUnavailableRoute,
  specsRoute,
  specificationRoute,
  specsForbiddenRoute,
  resolveAppAccess,
  resolveLoginAccess,
  safeReturnTo,
  type SpecFlowRouterContext,
  type AppAccessDecision,
  type LoginAccessDecision,
};

export const uiPlaygroundRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/ui-playground',
  component: UiPlaygroundScreen,
});

export const routeTree = rootRoute.addChildren([
  ...authRoutes,
  ...specsRootRoutes,
  appRoute.addChildren([...specsAppRoutes, uiPlaygroundRoute]),
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

export const router = createSpecFlowRouter(undefined, defaultSpecFlowServices);

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createSpecFlowRouter>;
  }
}
