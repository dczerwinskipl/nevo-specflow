import { useState } from 'react';
import { Button, InformationList, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { TaskExecutionReadiness, TaskGroup } from '../../../specs/workspace/model';
import { useWorkspaceRuntime } from '../../../specs/workspace/WorkspaceContext';
import { WorkspaceSection } from '../../../specs/workspace/sections/WorkspaceSection';
import { getGroupTone } from './presentation';
import { TaskGroupHeader } from './TaskGroupHeader';
import { TaskRow } from './TaskRow';

export interface TasksSectionProps {
  readonly taskGroups: readonly TaskGroup[];
  readonly isPreparing?: boolean;
  readonly totalTasksCount?: number;
  readonly completedTasksCount?: number;
  readonly executionReadiness?: TaskExecutionReadiness;
}

export function TasksSection({
  taskGroups,
  isPreparing = false,
  totalTasksCount,
  completedTasksCount,
  executionReadiness,
}: TasksSectionProps) {
  const { t } = useTranslation();
  const runtime = useWorkspaceRuntime();

  const [selectedTasks, setSelectedTasks] = useState<ReadonlySet<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());

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

  const completedCount =
    completedTasksCount ??
    taskGroups.flatMap((g) => g.tasks).filter((task) => task.lifecycle === 'completed').length;
  const totalTasks = totalTasksCount ?? taskGroups.flatMap((g) => g.tasks).length;

  const countLabel = isPreparing
    ? t('specification.tasksInPreparation', { count: totalTasks })
    : t('specification.tasksProgressCount', {
        completed: completedCount,
        total: totalTasks,
      });

  const isExecutionDisabled =
    runtime.canExecute === false || executionReadiness?.canExecute === false;

  const executionTitle =
    runtime.canExecute === false
      ? t('common.notImplemented')
      : executionReadiness?.canExecute === false
        ? executionReadiness.reasonCode === 'not_implemented'
          ? t('common.notImplemented')
          : executionReadiness.reasonCode === 'source_unavailable'
            ? t('specification.unavailableTitle')
            : (executionReadiness.blockers?.[0] ?? t('specification.executeGenericBlockedNotice'))
        : undefined;

  return (
    <WorkspaceSection aria-labelledby="tasks-heading">
      <WorkspaceSection.Header
        id="tasks-heading"
        title={t('specification.tasksHeading')}
        icon="list-checks"
        count={countLabel}
        actions={
          selectedTasks.size > 0 ? (
            <div className="flex items-center gap-3">
              <span className="text-body-xs text-content-muted">
                {t('specification.selectedTasksCount', { count: selectedTasks.size })}
              </span>
              <Button
                size="sm"
                disabled={isExecutionDisabled}
                title={executionTitle}
                onClick={() => runtime.executeTasks(Array.from(selectedTasks))}
              >
                {selectedTasks.size === 1
                  ? t('specification.executeSingleTask')
                  : t('specification.executeMultipleTasks', { count: selectedTasks.size })}
              </Button>
            </div>
          ) : null
        }
      />

      {isPreparing ? (
        <Typography variant="body-sm" className="text-content-secondary">
          {t('specification.tasksPreparingNotice')}
        </Typography>
      ) : null}

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
                      onPreview={runtime.previewTask}
                      fullTaskHref={runtime.fullTaskHref(task.id)}
                    />
                  ))}
                </InformationList>
              ) : null}
            </div>
          );
        })}
      </div>
    </WorkspaceSection>
  );
}
