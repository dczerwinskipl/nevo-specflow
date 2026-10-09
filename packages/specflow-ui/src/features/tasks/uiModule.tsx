import { Alert } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type {
  SpecFlowUiModule,
  SpecificationWorkSectionContext,
} from '../../app/ui-modules/contracts';
import { TasksSection } from './contributions/specification-work';

function TaskGroupsWorkSection({ specId, data, actions }: SpecificationWorkSectionContext) {
  const { t } = useTranslation();
  if (
    data.sectionAvailability?.tasks === 'forbidden' ||
    data.sectionAvailability?.tasks === 'unavailable'
  ) {
    return (
      <Alert tone="attention" title={t('specification.unavailableTitle')}>
        {t('specification.unavailableDescription', { id: specId })}
      </Alert>
    );
  }

  return (
    <TasksSection
      key={specId}
      taskGroups={data.taskGroups}
      isPreparing={data.isPreparing}
      totalTasksCount={data.totalTasksCount}
      completedTasksCount={data.completedTasksCount}
      executionReadiness={data.executionReadiness}
      onPreviewTask={actions.previewTask}
      fullTaskHref={actions.fullTaskHref}
      onExecuteTasks={actions.executeTasks}
      canExecute={actions.canExecute !== false}
    />
  );
}

export const tasksUiModule: SpecFlowUiModule = {
  id: 'specflow.tasks',
  contributions: [
    {
      extensionPoint: 'specification.work.sections',
      id: 'specflow.tasks.task-groups',
      slot: 'main',
      isVisible: ({ data }) =>
        !data.isEmpty ||
        data.sectionAvailability?.tasks === 'forbidden' ||
        data.sectionAvailability?.tasks === 'unavailable',
      render: (context) => <TaskGroupsWorkSection {...context} />,
    },
  ],
};
