import { useRuntimeMode } from '../../app/useRuntimeMode';
import { createRoute, redirect } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { SpecificationAggregatePage } from '../specs';
import { specificationRoute } from '../specs/routes';
import { parseSpecificationCollection } from '../../app/router/search';

import { SessionsView } from './views/SessionsView';

export const sessionsRoute = createRoute({
  getParentRoute: () => specificationRoute,
  path: 'sessions',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: parseSpecificationCollection(search),
  }),
  component: SessionsRouteScreen,
});

function SessionsRouteScreen() {
  const { specId } = sessionsRoute.useParams();
  const { collection } = sessionsRoute.useSearch();
  const { t } = useTranslation();
  const navigate = sessionsRoute.useNavigate();
  const demo = useRuntimeMode() === 'demo';

  return (
    <SpecificationAggregatePage
      specId={specId}
      title={t('specification.viewSessions')}
      section="sessions"
    >
      {(data) => (
        <SessionsView
          sessions={data.sessions}
          showHeading={false}
          onNewConversation={
            demo
              ? () =>
                  void navigate({
                    to: '/specs/$specId/sessions/new',
                    params: { specId },
                    search: { collection },
                  })
              : undefined
          }
          onOpenSession={
            // Full Session is canonical at the top-level `/sessions/:sessionId` route regardless of
            // Runtime mode (see sessionDetailRoute below, which now only redirects there).
            (sessionId) => void navigate({ to: '/sessions/$sessionId', params: { sessionId } })
          }
        />
      )}
    </SpecificationAggregatePage>
  );
}

/**
 * Retired demo-era placeholder: Full Session is canonical at the top-level `/sessions/:sessionId`
 * route (ManagedSession, real feed/API). This nested route now only redirects there so old
 * links/bookmarks keep working, instead of rendering the superseded `SessionScreen`.
 */
export const sessionDetailRoute = createRoute({
  getParentRoute: () => specificationRoute,
  path: 'sessions/$sessionId',
  beforeLoad: ({ params }) =>
    redirect({
      to: '/sessions/$sessionId',
      params: { sessionId: params.sessionId },
      replace: true,
    }),
});

export const sessionsAppRoutes = [sessionsRoute, sessionDetailRoute] as const;
