import { createRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { SpecificationAggregatePage } from '../specs';
import { specificationRoute } from '../specs/routes';
import { parseSpecificationCollection } from '../../app/router/search';
import { useSpecificationTask } from './useSpecificationTask';
import { SpecificationTaskPage } from './pages/SpecificationTaskPage';
import { TasksScreen } from './list/TasksScreen';

const GROUP_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * The Tasks page search (routing contract: router-owned, validated, absence is the default):
 * `blocking=specification` keeps only the Tasks blocking the Specification (never an id list; the
 * Runtime resolves them when read), `group` opens the page at one group, expanded. Any other value
 * is dropped.
 */
export function validateTasksSearch(search: Record<string, unknown>): {
  collection: 'current' | 'archive';
  blocking?: 'specification';
  group?: string;
} {
  return {
    collection: parseSpecificationCollection(search),
    ...(search.blocking === 'specification' ? { blocking: 'specification' as const } : {}),
    ...(typeof search.group === 'string' && GROUP_ID.test(search.group)
      ? { group: search.group }
      : {}),
  };
}

export const specificationTasksRoute = createRoute({
  getParentRoute: () => specificationRoute,
  path: 'tasks',
  validateSearch: validateTasksSearch,
  component: SpecificationTasksRouteScreen,
});

export const specificationTaskRoute = createRoute({
  getParentRoute: () => specificationRoute,
  path: 'tasks/$taskId',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: parseSpecificationCollection(search),
  }),
  component: SpecificationTaskRouteScreen,
});

function SpecificationTasksRouteScreen() {
  const { t } = useTranslation();
  const { specId } = specificationTasksRoute.useParams();
  const { collection, blocking, group } = specificationTasksRoute.useSearch();
  const navigate = specificationTasksRoute.useNavigate();
  const fullTaskHref = (taskId: string) =>
    `/specs/${encodeURIComponent(specId)}/tasks/${encodeURIComponent(taskId)}?collection=${collection}`;

  return (
    <SpecificationAggregatePage
      specId={specId}
      title={t('specification.viewTasks')}
      section="tasks"
    >
      {(data) => (
        <TasksScreen
          specId={specId}
          collection={collection}
          data={data}
          blocking={blocking === 'specification'}
          {...(group ? { group } : {})}
          fullTaskHref={fullTaskHref}
          onOpenTask={(taskId) =>
            void navigate({
              to: '/specs/$specId/tasks/$taskId',
              params: { specId, taskId },
              search: { collection },
            })
          }
          // Clearing the filter replaces the entry Review tasks pushed.
          onClearBlocking={() =>
            void navigate({ search: { collection, ...(group ? { group } : {}) }, replace: true })
          }
        />
      )}
    </SpecificationAggregatePage>
  );
}

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

export const taskAppRoutes = [specificationTasksRoute, specificationTaskRoute] as const;
