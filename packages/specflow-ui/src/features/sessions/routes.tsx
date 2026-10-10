import { createRoute } from '@tanstack/react-router';
import { appRoute } from '../../app/router/root';
import { SpecificationAggregatePage } from '../specs/pages/SpecificationAggregatePage';
import { SessionsView } from './views/SessionsView';

export const sessionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/specs/$specId/sessions',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: search.collection === 'archive' ? ('archive' as const) : ('current' as const),
  }),
  component: SessionsRouteScreen,
});

function SessionsRouteScreen() {
  const { specId } = sessionsRoute.useParams();
  return (
    <SpecificationAggregatePage specId={specId} title="Sessions" section="sessions">
      {(data) => <SessionsView sessions={data.sessions} />}
    </SpecificationAggregatePage>
  );
}

export const sessionsAppRoutes = [sessionsRoute] as const;
