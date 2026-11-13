import { useEffect, useState } from 'react';
import { Button, EmptyState, InformationList, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { TaskExecutionReadiness, TaskGroup } from '../../read-model/model';
import { WorkspaceSection } from '../../../../shared/workspace-section';
import { getGroupTone } from './presentation';
import { TaskGroupHeader } from './TaskGroupHeader';
import { TaskRow } from './TaskRow';
import { isCancelledTask } from './taskRowLine';

export interface TasksSectionProps {
  readonly taskGroups: readonly TaskGroup[];
  readonly isPreparing?: boolean;
  readonly totalTasksCount?: number;
  readonly completedTasksCount?: number;
  readonly executionReadiness?: TaskExecutionReadiness;
  readonly onPreviewTask: (taskId: string) => void;
  readonly fullTaskHref: (taskId: string) => string;
  readonly onExecuteTasks: (taskIds: readonly string[]) => void;
  readonly canExecute: boolean;
  /**
   * Project mode, when the projection allows creating a Task: the header's New task. Its presence
   * also says Tasks are created by hand, which the empty state and the progress reflect.
   */
  readonly onNewTask?: () => void;
}

export function TasksSection({
  taskGroups,
  isPreparing = false,
  totalTasksCount,
  completedTasksCount,
  executionReadiness,
  onPreviewTask,
  fullTaskHref,
  onExecuteTasks,
  canExecute,
  onNewTask,
}: TasksSectionProps) {
  const { t } = useTranslation();

  const [selectedTasks, setSelectedTasks] = useState<ReadonlySet<string>>(new Set());
  // "On hold or cancelled" (the Engine's `held` group) starts collapsed (UX contract).
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(['held']),
  );

  const handleSelectTask = (taskId: string, selected: boolean) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }

      return next;
    });
  };

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }

      return next;
    });
  };

  const tasks = taskGroups.flatMap((group) => group.tasks);
  const availableIds = new Set(tasks.map((task) => task.id));
  const effectiveSelectedTasks = [...selectedTasks].filter((id) => availableIds.has(id));

  // Drop vanished Task IDs; if the same ID reappears later it must not be
  // silently re-selected from an earlier Workspace revision.
  useEffect(() => {
    const available = new Set(taskGroups.flatMap((group) => group.tasks).map((task) => task.id));
    setSelectedTasks((prev) => {
      if ([...prev].every((id) => available.has(id))) {
        return prev;
      }

      return new Set([...prev].filter((id) => available.has(id)));
    });
  }, [taskGroups]);
  const completedCount =
    completedTasksCount ?? tasks.filter((task) => task.lifecycle === 'completed').length;
  const totalTasks = totalTasksCount ?? tasks.length;
  const noTasks = tasks.length === 0 && totalTasks === 0;

  // Project mode names the cancelled Tasks beside the progress (they are not in its denominator).
  const projectMode = tasks.some((task) => task.statusId !== undefined);
  const cancelledCount = tasks.filter(isCancelledTask).length;
  const countLabel = projectMode
    ? cancelledCount > 0
      ? t('taskAuthoring.tasks.progressCancelled', {
          completed: completedCount,
          total: totalTasks,
          cancelled: cancelledCount,
        })
      : t('taskAuthoring.tasks.progress', { completed: completedCount, total: totalTasks })
    : isPreparing
      ? t('specification.tasksInPreparation', { count: totalTasks })
      : t('specification.tasksProgressCount', {
          completed: completedCount,
          total: totalTasks,
        });
  const newTask = onNewTask ? (
    <Button size="sm" variant="secondary" leadingIcon="plus" onClick={onNewTask}>
      {t('taskAuthoring.tasks.newTask')}
    </Button>
  ) : null;

  const isExecutionDisabled = canExecute === false || executionReadiness?.canExecute === false;

  let executionTitle: string | undefined;
  if (!canExecute) {
    executionTitle = t('common.notImplemented');
  } else if (executionReadiness?.canExecute === false) {
    if (executionReadiness.reasonCode === 'not_implemented') {
      executionTitle = t('common.notImplemented');
    } else if (executionReadiness.reasonCode === 'source_unavailable') {
      executionTitle = t('specification.unavailableTitle');
    } else {
      executionTitle =
        executionReadiness.blockers?.[0] ?? t('specification.executeGenericBlockedNotice');
    }
  }

  return (
    <WorkspaceSection aria-labelledby="tasks-heading">
      <WorkspaceSection.Header
        id="tasks-heading"
        title={t('specification.tasksHeading')}
        icon="list-checks"
        count={noTasks ? undefined : countLabel}
        actions={
          effectiveSelectedTasks.length > 0 ? (
            <div className="flex items-center gap-3">
              {newTask}
              <span className="text-body-sm text-content-muted">
                {t('specification.selectedTasksCount', { count: effectiveSelectedTasks.length })}
              </span>
              <Button
                size="sm"
                disabled={isExecutionDisabled}
                title={executionTitle}
                onClick={() => onExecuteTasks(effectiveSelectedTasks)}
              >
                {effectiveSelectedTasks.length === 1
                  ? t('specification.executeSingleTask')
                  : t('specification.executeMultipleTasks', {
                      count: effectiveSelectedTasks.length,
                    })}
              </Button>
            </div>
          ) : (
            newTask
          )
        }
      />

      {isPreparing && !noTasks ? (
        <Typography variant="body-sm" className="text-content-secondary">
          {t('specification.tasksPreparingNotice')}
        </Typography>
      ) : null}

      {noTasks ? (
        // The next step belongs to the preparation block or Continue session, not to this state.
        // A row-sized, start-aligned state (owner decision D1, 2026-11-08), without a glyph: the
        // section header already shows the Tasks icon.
        <EmptyState
          variant="inline"
          title={t('specification.tasksEmptyTitle')}
          description={
            onNewTask
              ? t('taskAuthoring.tasks.emptyDescription')
              : t('specification.tasksEmptyDescription')
          }
        />
      ) : (
        <div className="grid gap-4">
          {taskGroups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.id);
            const groupControlsId = `task-group-${group.id}`;

            return (
              <div key={group.id} className="grid gap-1">
                <TaskGroupHeader
                  name={group.name}
                  count={group.tasks.length}
                  isCollapsed={isCollapsed}
                  tone={getGroupTone(group)}
                  controlsId={groupControlsId}
                  onToggle={() => toggleGroup(group.id)}
                />

                {!isCollapsed ? (
                  <InformationList selectable id={groupControlsId}>
                    {group.tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        selected={selectedTasks.has(task.id)}
                        isPreparing={isPreparing}
                        onSelect={handleSelectTask}
                        onPreview={onPreviewTask}
                        fullTaskHref={fullTaskHref(task.id)}
                      />
                    ))}
                  </InformationList>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </WorkspaceSection>
  );
}
