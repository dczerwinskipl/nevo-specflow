import { createRoute, redirect } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { SpecificationAggregatePage } from '../specs';
import type { SpecificationWorkspaceData } from '../specs/read-model';
import { specificationRoute } from '../specs/routes';
import { parseSpecificationCollection } from '../../app/router/search';
import { startSessionOffered } from './associations/startSessionGate';
import type { SessionCollection } from './list/loadSessions';
import { SpecificationSessionsList } from './list/SpecificationSessionsList';
import { useSpecificationSessionList } from './list/useSpecificationSessionList';
import { sessionsDisabled } from './navigation/summary';

/**
 * The Sessions collection of the list (`sessionCollection`; `collection` already names the
 * Specification's). Absent means **Bieżące**, so links into the list need not name it.
 */
function parseSessionCollection(search: Record<string, unknown>): {
  sessionCollection?: SessionCollection;
} {
  return search.sessionCollection === 'archive' ? { sessionCollection: 'archive' } : {};
}

export const sessionsRoute = createRoute({
  getParentRoute: () => specificationRoute,
  path: 'sessions',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: parseSpecificationCollection(search),
    ...parseSessionCollection(search),
  }),
  component: SessionsRouteScreen,
});

function SessionsRouteScreen() {
  const { specId } = sessionsRoute.useParams();
  const { t } = useTranslation();

  return (
    <SpecificationAggregatePage
      specId={specId}
      title={t('specification.viewSessions')}
      section="sessions"
      // The list reads the Session list read; the workspace only gates New Session.
      ownSource
      loading={<SessionsListScreen specId={specId} />}
    >
      {(data) => <SessionsListScreen specId={specId} data={data} />}
    </SpecificationAggregatePage>
  );
}

function SessionsListScreen({
  specId,
  data,
}: {
  specId: string;
  /** The workspace read, once it is there: until then no New Session is offered. */
  data?: SpecificationWorkspaceData;
}) {
  const { collection, sessionCollection = 'current' } = sessionsRoute.useSearch();
  const navigate = sessionsRoute.useNavigate();
  const disabled = data ? sessionsDisabled(data) : false;
  // Sessions turned off (the workspace says so): the list read is not even sent.
  const state = useSpecificationSessionList(specId, sessionCollection, disabled);

  return (
    <SpecificationSessionsList
      state={state}
      collection={sessionCollection}
      onCollectionChange={(next) =>
        void navigate({
          search: (previous) => ({
            collection: previous.collection,
            ...(next === 'archive' ? { sessionCollection: next } : {}),
          }),
          replace: true,
        })
      }
      onNewSession={
        startSessionOffered(data?.startSession)
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
        (sessionId) =>
          void navigate({
            to: '/sessions/$sessionId',
            params: { sessionId },
            search: { collection },
          })
      }
    />
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
  validateSearch: (search: Record<string, unknown>) => ({
    collection: parseSpecificationCollection(search),
  }),
  beforeLoad: ({ params, search }) =>
    redirect({
      to: '/sessions/$sessionId',
      params: { sessionId: params.sessionId },
      search: { collection: search.collection },
      replace: true,
    }),
});

export const sessionsAppRoutes = [sessionsRoute, sessionDetailRoute] as const;
