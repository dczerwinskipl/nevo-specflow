import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router';

import { SpecFlowShell } from './SpecFlowShell';
import { HomeScreen, UiPlaygroundScreen } from './screens';

const rootRoute = createRootRoute({
  component: () => (
    <SpecFlowShell>
      <Outlet />
    </SpecFlowShell>
  ),
});

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomeScreen });
const uiPlaygroundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ui-playground',
  component: UiPlaygroundScreen,
});

const routeTree = rootRoute.addChildren([homeRoute, uiPlaygroundRoute]);

export function createSpecFlowRouter(history?: RouterHistory) {
  return createRouter({ routeTree, ...(history ? { history } : {}) });
}

export const router = createSpecFlowRouter();

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createSpecFlowRouter>;
  }
}
