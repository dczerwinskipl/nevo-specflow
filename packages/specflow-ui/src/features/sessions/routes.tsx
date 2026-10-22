import { useRuntimeMode } from '../../app/useRuntimeMode';
import { createRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { SpecificationAggregatePage } from '../specs';
import { specificationRoute } from '../specs/routes';
import { parseSpecificationCollection } from '../../app/router/search';

import { AppWorkspaceProvider } from '@nevo/ui';
import { SessionsView } from './views/SessionsView';
import { SessionScreen } from './screens/SessionScreen';

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
            demo
              ? (sessionId) =>
                  void navigate({
                    to: '/specs/$specId/sessions/$sessionId',
                    params: { specId, sessionId },
                    search: { collection },
                  })
              : undefined
          }
        />
      )}
    </SpecificationAggregatePage>
  );
}

export const sessionDetailRoute = createRoute({
  getParentRoute: () => specificationRoute,
  path: 'sessions/$sessionId',
  component: Session,
});

function Session() {
  const { specId, sessionId } = sessionDetailRoute.useParams();
  const navigate = sessionDetailRoute.useNavigate();
  const { collection } = sessionDetailRoute.useSearch();
  return (
    <AppWorkspaceProvider>
      <SessionScreen
        key={sessionId}
        specId={specId}
        sessionId={sessionId}
        onBack={() =>
          void navigate({
            to: '/specs/$specId/sessions',
            params: { specId },
            search: { collection },
          })
        }
      />
    </AppWorkspaceProvider>
  );
}

export const sessionsAppRoutes = [sessionsRoute, sessionDetailRoute] as const;
