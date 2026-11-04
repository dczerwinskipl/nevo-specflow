import { useMemo } from 'react';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { AppWorkspaceProvider } from '@nevo/ui';
import { appRoute } from '../../../app/router/root';
import { useAppServices } from '../../../app/useAppServices';
import { useAuthOwner } from './useAuthOwner';
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
  const { sessionId } = managedSessionRoute.useParams();

  return <ManagedSessionRouteView sessionId={sessionId} />;
}

/** The Session route's composition for one `sessionId`; the router keeps it mounted across ids. */
export function ManagedSessionRouteView({ sessionId }: { sessionId: string }) {
  const services = useAppServices();
  const owner = useAuthOwner() ?? 'unavailable';
  const { onOpenSpecification, onOpenDocuments } = useSessionContextNavigation(sessionId);
  const started = startedSessionOf(owner, sessionId);
  const sessionContext = useMemo(
    () => (started ? startedSessionContext(started) : realRouteSessionContext),
    [started],
  );

  // `browserHistory`: browser/Android Back steps back inside the Context/Work Secondary (sub-page →
  // parent → hide) before leaving the Session (secondary-navigation.md, "Browser and system Back").
  // `scopeKey`: the router keeps this component mounted from `/sessions/A` to `/sessions/B`, so the
  // provider would keep A's open tabs; the Session's identity scopes them.
  return (
    <AppWorkspaceProvider browserHistory scopeKey={`${owner}:${sessionId}`}>
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
  const owner = useAuthOwner();
  if (owner === undefined) {
    return null;
  }

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
