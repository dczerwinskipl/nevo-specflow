import { useEffect, useState } from 'react';
import { Button, EmptyState, InformationList, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { TaskExecutionReadiness, TaskGroup } from '../../read-model/model';
import { WorkspaceSection } from '../../../../shared/workspace-section';
import { getGroupTone } from './presentation';
import { TaskGroupHeader } from './TaskGroupHeader';
import { TaskRow } from './TaskRow';

/**
 * The empty Tasks body: `inline` (a row-sized, start-aligned state under the header), variant A of
 * the owner's 2026-11-08 review of the Tasks empty state; pending the owner's A/B choice.
 */
const TASKS_EMPTY_STATE_VARIANT = 'inline';

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
}: TasksSectionProps) {
  const { t } = useTranslation();

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

  const countLabel = isPreparing
    ? t('specification.tasksInPreparation', { count: totalTasks })
    : t('specification.tasksProgressCount', {
        completed: completedCount,
        total: totalTasks,
      });

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
          ) : null
        }
      />

      {isPreparing && !noTasks ? (
        <Typography variant="body-sm" className="text-content-secondary">
          {t('specification.tasksPreparingNotice')}
        </Typography>
      ) : null}

      {noTasks ? (
        // The next step belongs to the preparation block or Continue session, not to this state.
        <EmptyState
          variant={TASKS_EMPTY_STATE_VARIANT}
          icon="list-checks"
          title={t('specification.tasksEmptyTitle')}
          description={t('specification.tasksEmptyDescription')}
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
