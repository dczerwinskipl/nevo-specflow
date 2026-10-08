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
        readonly authStore?: AuthStore;
        readonly auth?: AuthStore;
        readonly specsSource?: SpecsOverviewSource;
        readonly specs?: SpecsOverviewSource;
      } = createSpecFlowAppServices(),
  specs?: SpecsOverviewSource,
) {
  let services: SpecFlowAppServices;

  if ('http' in servicesOrAuth && 'specificationApi' in servicesOrAuth) {
    services = servicesOrAuth;
  } else if ('authStore' in servicesOrAuth || 'auth' in servicesOrAuth) {
    const raw = servicesOrAuth as {
      authStore?: AuthStore;
      auth?: AuthStore;
      specsSource?: SpecsOverviewSource;
      specs?: SpecsOverviewSource;
    };
    services = createSpecFlowAppServices({
      authStore: raw.authStore ?? raw.auth,
      specsSource: raw.specsSource ?? raw.specs,
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
