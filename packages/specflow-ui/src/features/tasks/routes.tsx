import { createRoute } from '@tanstack/react-router';
import { appRoute } from '../../app/router/root';
import { useSpecificationTask } from './useSpecificationTask';
import { SpecificationTaskPage } from './pages/SpecificationTaskPage';

export const specificationTaskRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/specs/$specId/tasks/$taskId',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: search.collection === 'archive' ? ('archive' as const) : ('current' as const),
  }),
  component: SpecificationTaskRouteScreen,
});

function SpecificationTaskRouteScreen() {
  const { specId, taskId } = specificationTaskRoute.useParams();
  const { collection } = specificationTaskRoute.useSearch();
  const { services } = specificationTaskRoute.useRouteContext();
  const navigate = specificationTaskRoute.useNavigate();
  const taskState = useSpecificationTask(specId, taskId, services.taskApi);
  const onBack = () =>
    void navigate({ to: '/specs/$specId', params: { specId }, search: { collection } });
  return (
    <SpecificationTaskPage
      specId={specId}
      taskId={taskId}
      collection={collection}
      taskState={taskState}
      onBack={onBack}
    />
  );
}

export const taskAppRoutes = [specificationTaskRoute] as const;
