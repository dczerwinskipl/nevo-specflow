import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { AppWorkspaceProvider } from '@nevo/ui';
import { appRoute } from '../../../app/router/root';
import { useAppServices } from '../../../app/useAppServices';
import { authSessionIdentity } from '../../../auth/store';
import { realRouteSessionContext } from './context/sessionContextTypes';
import { startedSessionContext, startedSessionOf } from '../start/handoff/startedSession';
import { ManagedSessionStart } from '../start/screen/ManagedSessionStart';
import { ManagedSession } from './ManagedSession';
import { useSessionContextNavigation } from './useSessionContextNavigation';

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
  const { onOpenSpecification, onOpenDocuments } = useSessionContextNavigation(sessionId);
  const started = startedSessionOf(sessionId);
  const sessionContext = useMemo(
    () => (started ? startedSessionContext(started) : realRouteSessionContext),
    [started],
  );

  // `browserHistory`: browser/Android Back steps back inside the Context/Work Secondary (sub-page →
  // parent → hide) before leaving the Session (secondary-navigation.md, "Browser and system Back").
  return (
    <AppWorkspaceProvider browserHistory>
      <ManagedSession
        key={owner + sessionId}
        api={services.managedSessionsApi}
        sessionId={sessionId}
        owner={owner}
        // A Session started here keeps the context it was started with (its Specification, or none).
        sessionContext={sessionContext}
        onOpenSpecification={onOpenSpecification}
        onOpenDocuments={onOpenDocuments}
      />
    </AppWorkspaceProvider>
  );
}

function NewManagedSession() {
  const services = useAppServices();
  const navigate = useNavigate();
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

  return (
    <ManagedSessionStart
      key={owner}
      owner={owner}
      api={services.managedSessionsApi}
      // The start screen is replaced by the Session (history replace): Back does not return to an
      // empty start state.
      onOpenSession={(sessionId) =>
        void navigate({ to: '/sessions/$sessionId', params: { sessionId }, replace: true })
      }
    />
  );
}

export const managedSessionAppRoutes = [managedNewSessionRoute, managedSessionRoute] as const;
