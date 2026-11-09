import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { createRoute, redirect, useNavigate } from '@tanstack/react-router';
import { AppWorkspaceProvider } from '@nevo/ui';
import { appRoute } from '../../../app/router/root';
import { parseSpecificationCollection } from '../../../app/router/search';
import { useAppServices } from '../../../app/useAppServices';
import { useNotify } from '../../../shared/notifications/notifications';
import { useAuthOwner } from './useAuthOwner';
import { associationContext } from '../associations/associationContext';
import {
  invalidateSpecificationSessions,
  sessionAssociationKeys,
  useSessionAssociation,
} from '../associations/queries';
import { homeSpecification } from '../associations/useSessionHomeSpecification';
import { ManagedSession } from './ManagedSession';
import { useSessionContextNavigation } from './useSessionContextNavigation';

/**
 * Retired standalone start (session-association-ux §2, U1): every new Session starts from a
 * Specification, so an old link or bookmark lands on the Specifications list, without a toast.
 */
export const managedNewSessionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/sessions/new',
  beforeLoad: () => redirect({ to: '/', search: { collection: 'current' }, replace: true }),
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
  const association = useSessionAssociation(sessionId);
  const queryClient = useQueryClient();
  const { data, isError } = association;
  const sessionContext = useMemo(
    () =>
      associationContext(
        data ? { status: 'success', data } : isError ? { status: 'error' } : { status: 'pending' },
      ),
    [data, isError],
  );
  const navigate = useNavigate();
  const notify = useNotify();
  const { t } = useTranslation();
  const toSpecifications = () =>
    navigate({ to: '/', search: { collection: 'current' }, replace: true });
  const home = homeSpecification(data);
  const onSessionChanged = () => {
    if (home) {
      void invalidateSpecificationSessions(queryClient, home.specId);
    }
  };

  const onSessionDeleted = () => {
    // The destination follows the association read when the delete succeeded
    // (session-association-ux §4); `replace`: Back does not reopen the deleted Session.
    const destination = home
      ? navigate({
          to: '/specs/$specId/sessions',
          params: { specId: home.specId },
          search: { collection: home.collection === 'archived' ? 'archive' : 'current' },
          replace: true,
        })
      : toSpecifications();
    if (home) {
      void invalidateSpecificationSessions(queryClient, home.specId);
    }

    void destination.then(() => {
      queryClient.removeQueries({ queryKey: sessionAssociationKeys.read(sessionId), exact: true });
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
        // The association read (seeded by a start here) is the one source of the Specification.
        sessionContext={sessionContext}
        onOpenSpecification={onOpenSpecification}
        onOpenDocuments={onOpenDocuments}
        onSessionDeleted={onSessionDeleted}
        onSessionChanged={onSessionChanged}
        onGoToSpecifications={() => void toSpecifications()}
      />
    </AppWorkspaceProvider>
  );
}

/**
 * Focus lands on the destination's page heading after a deleted Session's screen is replaced
 * (full-session.md "Session actions"): the Primary `WorkspaceHeader` title, once it has rendered.
 */
function focusPrimaryHeading() {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('h1[data-workspace-header-title="true"]')?.focus();
  });
}

export const managedSessionAppRoutes = [managedNewSessionRoute, managedSessionRoute] as const;
