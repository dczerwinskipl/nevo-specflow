import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { AppWorkspaceProvider } from '@nevo/ui';
import { appRoute } from '../../../app/router/root';
import { parseSpecificationCollection } from '../../../app/router/search';
import { useApplicationCollection } from '../../../app/navigation/ApplicationLocation';
import { useAppServices } from '../../../app/useAppServices';
import { useNotify } from '../../../shared/notifications/notifications';
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
  // The Specification's collection the Session was opened from; Context → Documents hands it on so
  // an archived Specification is not reopened under `current`.
  validateSearch: (search: Record<string, unknown>) => ({
    collection: parseSpecificationCollection(search),
  }),
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
  const navigate = useNavigate();
  const notify = useNotify();
  const { t } = useTranslation();
  const toNewSession = () =>
    // `replace`: Back does not reopen the deleted Session.
    navigate({ to: '/sessions/new', search: { collection: 'current' }, replace: true });
  const onSessionDeleted = () => {
    void toNewSession().then(() => {
      notify(t('managedSession.sessionActions.deleted'));
      focusPrimaryHeading();
    });
  };

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
        onSessionDeleted={onSessionDeleted}
        onNewSession={() => void toNewSession()}
      />
    </AppWorkspaceProvider>
  );
}

function NewManagedSession() {
  const services = useAppServices();
  const navigate = useNavigate();
  const collection = useApplicationCollection();
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
        void navigate({
          to: '/sessions/$sessionId',
          params: { sessionId },
          search: { collection },
          replace: true,
        })
      }
    />
  );
}

/**
 * Focus lands on the destination's page heading after a deleted Session's screen is replaced
 * (session-actions-ux §3.5): the Primary `WorkspaceHeader` title, once it has rendered.
 */
function focusPrimaryHeading() {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('h1[data-workspace-header-title="true"]')?.focus();
  });
}

export const managedSessionAppRoutes = [managedNewSessionRoute, managedSessionRoute] as const;
