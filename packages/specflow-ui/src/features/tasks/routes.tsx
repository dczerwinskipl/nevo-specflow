import { createRoute } from '@tanstack/react-router';
import { specificationRoute } from '../specs/routes';
import { parseSpecificationCollection } from '../../app/router/search';
import { backParentTarget } from '../../app/navigation/backParent';
import { useSpecificationTask } from './useSpecificationTask';
import { SpecificationTaskPage } from './pages/SpecificationTaskPage';

export const specificationTaskRoute = createRoute({
  getParentRoute: () => specificationRoute,
  path: 'tasks/$taskId',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: parseSpecificationCollection(search),
  }),
  component: SpecificationTaskRouteScreen,
});

function SpecificationTaskRouteScreen() {
  const { specId, taskId } = specificationTaskRoute.useParams();
  const { collection } = specificationTaskRoute.useSearch();
  const { services } = specificationTaskRoute.useRouteContext();
  const navigate = specificationTaskRoute.useNavigate();
  const taskState = useSpecificationTask(specId, taskId, services.taskApi);
  // A Task's parent is the Specification's Tasks, also when the page was opened from a deep link.
  const onBack = () => void navigate(backParentTarget('tasks', specId, collection));

  return (
    <SpecificationTaskPage specId={specId} taskId={taskId} taskState={taskState} onBack={onBack} />
  );
}

export const taskAppRoutes = [specificationTaskRoute] as const;
