import { createContext, useContext } from 'react';
import {
  AppContent,
  defineSecondaryStack,
  useSecondaryStack,
  WorkspaceHeaderIdentity,
  type SecondaryData,
  type SecondaryScreenProps,
  type WorkspaceHeaderAction,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { appI18n } from '../../../i18n';
import type { ActivityEvent, SpecificationWorkspaceData, TaskGroup, TaskItem } from './model';
import { TaskPreview } from '../../tasks/inspectors/TaskPreview';
import { useSpecificationTask } from '../../tasks/useSpecificationTask';
import { ActivityHistory } from './ActivityHistory';

export interface SpecificationSecondaryContextValue {
  readonly specId: string;
  readonly data: SpecificationWorkspaceData;
  readonly openFullTask: (taskId: string) => void;
  readonly openSession?: (sessionId: string) => void;
  readonly openDoc?: (docId: string) => void;
  readonly previewTask: (taskId: string) => void;
}

export const SpecificationSecondaryDataContext =
  createContext<SpecificationSecondaryContextValue | null>(null);

export interface TaskPreviewSecondaryData {
  readonly specId: string;
  readonly task: TaskItem;
  readonly group?: TaskGroup;
  readonly groups: readonly TaskGroup[];
  readonly openFullTask: (taskId: string) => void;
}

export function useTaskPreviewData({
  specId,
  taskId,
}: {
  specId: string;
  taskId: string;
}): SecondaryData<TaskPreviewSecondaryData> {
  const context = useContext(SpecificationSecondaryDataContext);
  const listTask = context?.data.taskGroups.flatMap((g) => g.tasks).find((t) => t.id === taskId);
  // Attention/Activity may reference a Task absent from the current Workspace projection.
  const detail = useSpecificationTask(specId, taskId, undefined, Boolean(context) && !listTask);
  if (!context) return { status: 'loading' };
  if (!listTask && detail.isPending) return { status: 'loading' };
  if (!listTask && (detail.isError || detail.data?.task.id !== taskId)) {
    return {
      status: 'unavailable',
      message: detail.isTaskNotFound
        ? appI18n.t('specification.taskNotFoundDescription', { taskId })
        : appI18n.t('specification.unavailableDescription', { id: taskId }),
    };
  }
  const task: TaskItem = listTask ?? {
    id: taskId,
    title: detail.data!.task.title,
    status: detail.data!.task.status.lifecycle,
    statusCode: detail.data!.task.status.lifecycle,
    lifecycle: detail.data!.task.status.lifecycle,
    group: '',
  };
  const group = context.data.taskGroups.find(
    (g) => g.id === task.group || g.tasks.some((t) => t.id === task.id),
  );
  return {
    status: 'ready',
    data: {
      specId,
      task,
      group,
      groups: context.data.taskGroups,
      openFullTask: context.openFullTask,
    },
  };
}

export interface TaskPreviewPages {
  preview: Record<never, never>;
}

export function TaskPreviewHeader({
  data,
}: SecondaryScreenProps<TaskPreviewSecondaryData, TaskPreviewPages['preview']>) {
  const { t } = useTranslation();
  return (
    <WorkspaceHeaderIdentity
      headingLevel={2}
      title={t('specification.taskPreviewTitle')}
      subtitle={`${data.task.id} · ${data.task.title}`}
    />
  );
}

export function TaskPreviewScreen({
  data,
}: SecondaryScreenProps<TaskPreviewSecondaryData, TaskPreviewPages['preview']>) {
  return (
    <AppContent>
      <TaskPreview
        task={data.task}
        groups={data.groups}
        specKey={data.specId}
        onOpenFull={data.openFullTask}
      />
    </AppContent>
  );
}

export const taskPreviewStack = defineSecondaryStack<
  { specId: string; taskId: string },
  TaskPreviewSecondaryData,
  TaskPreviewPages
>({
  id: 'specification-task-preview',
  initial: 'preview',
  useData: useTaskPreviewData,
  screens: {
    preview: {
      title: 'Task preview',
      header: TaskPreviewHeader,
      actions: ({ data }): readonly WorkspaceHeaderAction[] => [
        {
          id: 'open-full',
          label: appI18n.t('specification.fullTaskView'),
          icon: 'open-full',
          primary: true,
          onPress: () => data.openFullTask(data.task.id),
        },
      ],
      component: TaskPreviewScreen,
    },
  },
});

export interface HistorySecondaryData {
  readonly specId: string;
  readonly events: readonly ActivityEvent[];
  readonly openTask: (taskId: string) => void;
  readonly openSession?: (sessionId: string) => void;
  readonly openDoc?: (docId: string) => void;
}

export function useHistoryData({
  specId,
}: {
  specId: string;
}): SecondaryData<HistorySecondaryData> {
  const context = useContext(SpecificationSecondaryDataContext);
  if (!context) {
    return { status: 'loading' };
  }
  return {
    status: 'ready',
    data: {
      specId,
      events: context.data.activityEvents,
      openTask: context.previewTask,
      openSession: context.openSession,
      openDoc: context.openDoc,
    },
  };
}

export interface HistoryPages {
  history: Record<never, never>;
}

export function ActivityHistoryHeader() {
  const { t } = useTranslation();
  return (
    <WorkspaceHeaderIdentity
      headingLevel={2}
      icon="clock"
      title={t('specification.activityHistory')}
      subtitle={t('specification.thisSpecification')}
    />
  );
}

export function ActivityHistoryScreen({
  data,
}: SecondaryScreenProps<HistorySecondaryData, HistoryPages['history']>) {
  const nav = useSecondaryStack<HistoryPages>();
  return (
    <AppContent>
      <ActivityHistory
        events={data.events}
        isExplicit={true}
        onOpenTask={(taskId) => {
          void nav.navTo(taskPreviewStack, { specId: data.specId, taskId });
        }}
        onOpenSession={data.openSession}
        onOpenDoc={data.openDoc}
      />
    </AppContent>
  );
}

export const historyStack = defineSecondaryStack<
  { specId: string },
  HistorySecondaryData,
  HistoryPages
>({
  id: 'specification-history',
  initial: 'history',
  useData: useHistoryData,
  screens: {
    history: {
      title: 'Activity history',
      header: ActivityHistoryHeader,
      component: ActivityHistoryScreen,
    },
  },
});
