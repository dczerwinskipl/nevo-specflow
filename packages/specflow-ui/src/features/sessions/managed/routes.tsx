import { useCallback, useSyncExternalStore } from 'react';
import { createRoute } from '@tanstack/react-router';
import { AppWorkspaceProvider } from '@nevo/ui';
import { appRoute } from '../../../app/router/root';
import { useAppServices } from '../../../app/useAppServices';
import { authSessionIdentity } from '../../../auth/store';
import { ManagedSession } from './ManagedSession';
import { CreateSession } from './creation/CreateSession';

export const managedNewSessionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/sessions/new',
  component: NewManagedSession,
});
export const managedSessionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/sessions/$sessionId',
  component: ManagedSessionRoute,
});
function ManagedSessionRoute() {
  const { sessionId } = managedSessionRoute.useParams(),
    services = useAppServices();
  const subscribe = useCallback(
    (listener: () => void) => services.authStore.subscribe(listener),
    [services.authStore],
  );
  const readAuth = useCallback(() => services.authStore.getState(), [services.authStore]);
  const auth = useSyncExternalStore(subscribe, readAuth, readAuth);
  const owner = auth.status === 'ready' ? authSessionIdentity(auth.session) : 'unavailable';

  return (
    <AppWorkspaceProvider>
      <ManagedSession
        key={owner + sessionId}
        api={services.managedSessionsApi}
        sessionId={sessionId}
        owner={owner}
      />
    </AppWorkspaceProvider>
  );
}

function NewManagedSession() {
  const services = useAppServices();
  const subscribe = useCallback(
    (listener: () => void) => services.authStore.subscribe(listener),
    [services.authStore],
  );
  const readAuth = useCallback(() => services.authStore.getState(), [services.authStore]);
  const auth = useSyncExternalStore(subscribe, readAuth, readAuth);
  if (auth.status !== 'ready') {
    return null;
  }

  const owner = authSessionIdentity(auth.session);

  return <CreateSession key={owner} owner={owner} api={services.managedSessionsApi} />;
}

export const managedSessionAppRoutes = [managedNewSessionRoute, managedSessionRoute] as const;
