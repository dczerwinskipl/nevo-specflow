import {
  createOperationRoute,
  createSpecificationRoute,
  newSessionRoute,
} from '../features/specs/creation/routes';
import { createRoute, createRouter, type RouterHistory } from '@tanstack/react-router';

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
  specificationIndexRoute,
  validateSpecificationSearch,
  specsForbiddenRoute,
} from '../features/specs/routes';
import { defaultSpecFlowServices } from '../services';
import { taskAppRoutes, specificationTaskRoute } from '../features/tasks/routes';
import { documentsAppRoutes } from '../features/documents/routes';
import { sessionsAppRoutes } from '../features/sessions/routes';
import { gitAppRoutes } from '../features/git/routes';
import { createSpecFlowAppServices, type SpecFlowAppServices } from './dependencies';
import { UiPlaygroundScreen } from './screens';
import { NotFoundView } from './errors/NotFoundView';
import { RouteErrorView } from './errors/RouteErrorView';
import { rootRoute, appRoute, type SpecFlowRouterContext } from './router/root';

export {
  rootRoute,
  appRoute,
  loginRoute,
  runtimeUnavailableRoute,
  specsRoute,
  specificationRoute,
  specificationTaskRoute,
  validateSpecificationSearch,
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
  appRoute.addChildren([
    ...specsAppRoutes,
    createSpecificationRoute,
    createOperationRoute,
    specificationRoute.addChildren([
      specificationIndexRoute,
      ...taskAppRoutes,
      ...documentsAppRoutes,
      ...sessionsAppRoutes,
      newSessionRoute,
      ...gitAppRoutes,
    ]),
    uiPlaygroundRoute,
  ]),
]);

export function createSpecFlowRouter(
  history?: RouterHistory,
  services: SpecFlowAppServices = createSpecFlowAppServices(),
) {
  const context: SpecFlowRouterContext = {
    services,
    auth: services.authStore,
  };

  return createRouter({
    routeTree,
    context,
    defaultErrorComponent: RouteErrorView,
    defaultNotFoundComponent: NotFoundView,
    // Defects reach the console (no remote telemetry in a local product); the boundary shows a generic screen.
    defaultOnCatch: (error) => console.error('Route render failed', error),
    ...(history ? { history } : {}),
  });
}

export const router = createSpecFlowRouter(undefined, defaultSpecFlowServices);

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createSpecFlowRouter>;
  }
  interface HistoryState {
    /** Primary location that promoted a Document Preview or list item to Full. */
    specflowDocumentReturnTo?: 'overview' | 'documents';
  }
}
