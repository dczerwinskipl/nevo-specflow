import { Alert } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { contributeTo, type UiModule } from '../../app/ui-modules/contracts';
import {
  specificationAttentionItems,
  specificationWorkSections,
  type SpecificationWorkSectionContext,
} from '../specs';
import { FeatureUnavailable } from '../../app/errors/FeatureUnavailable';
import { useRuntimeMode } from '../../app/useRuntimeMode';
import { ProjectTasksSection, TasksSection } from './contributions/specification-work';

function TaskGroupsWorkSection({ specId, data, actions }: SpecificationWorkSectionContext) {
  const { t } = useTranslation();
  const runtimeMode = useRuntimeMode();
  if (
    data.sectionAvailability?.tasks === 'unavailable' &&
    data.sectionUnavailableReason?.tasks === 'not_implemented'
  ) {
    return <FeatureUnavailable className="border-none" />;
  }

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

  const sectionProps = {
    taskGroups: data.taskGroups,
    isPreparing: data.isPreparing,
    totalTasksCount: data.totalTasksCount,
    completedTasksCount: data.completedTasksCount,
    executionReadiness: data.executionReadiness,
    onPreviewTask: actions.previewTask,
    fullTaskHref: actions.fullTaskHref,
    onExecuteTasks: actions.executeTasks,
    canExecute: actions.canExecute !== false,
  };
  // Task authoring is a project Runtime capability (the demo Runtime serves no workflow routes).
  if (runtimeMode === 'project') {
    return (
      <ProjectTasksSection key={specId} specId={specId} specTitle={data.title} {...sectionProps} />
    );
  }

  return <TasksSection key={specId} {...sectionProps} />;
}

export const tasksUiModule: UiModule = {
  id: 'specflow.tasks',
  contributions: [
    contributeTo(specificationWorkSections, {
      id: 'specflow.tasks.task-groups',
      slot: 'main',
      // Also with no Tasks: an available empty section shows its empty state under the header, so
      // the navigator's Zadania (`#tasks-heading`) always has a target.
      isVisible: ({ data }) => !data.isEmpty || data.sectionAvailability?.tasks !== undefined,
      Component: TaskGroupsWorkSection,
    }),
    contributeTo(specificationAttentionItems, {
      id: 'specflow.tasks.attention',
      getItems: ({ data, actions }) => {
        const source = data.featureAttention?.tasks;
        if (!source || (source.state === 'unavailable' && source.reason === 'source_unavailable')) {
          return { state: 'unavailable' };
        }

        if (source.state !== 'available') {
          return { state: 'excluded' };
        }

        return source.items.map((item) => ({
          item,
          icon: 'list-checks',
          action: item.targetId
            ? {
                label: item.actionLabel,
                labelKey:
                  item.actionCode === 'task' ? 'specification.attentionViewTask' : undefined,
                onClick: () => actions.previewTask(item.targetId!),
              }
            : undefined,
        }));
      },
    }),
  ],
};
