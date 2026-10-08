import { useState } from 'react';
import { Button, Icon, InformationList, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { TaskGroup } from '../model';
import { useWorkspaceRuntime } from '../WorkspaceContext';
import { getGroupTone } from './presentation';
import { TaskGroupHeader } from './TaskGroupHeader';
import { TaskRow } from './TaskRow';

export interface TasksSectionProps {
  readonly taskGroups: readonly TaskGroup[];
  readonly isPreparing?: boolean;
  readonly totalTasksCount?: number;
  readonly completedTasksCount?: number;
}

export function TasksSection({
  taskGroups,
  isPreparing = false,
  totalTasksCount,
  completedTasksCount,
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

  return (
    <section aria-labelledby="tasks-heading" className="border-t border-border-subtle pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-4 shrink-0 items-center justify-center text-content-muted">
            <Icon name="list-checks" size="sm" />
          </span>
          <Typography
            as="h2"
            variant="title-sm"
            id="tasks-heading"
            className="font-semibold text-content-primary"
          >
            {t('specification.tasksHeading')}{' '}
            <span className="text-body-xs font-normal text-content-muted">
              {isPreparing
                ? t('specification.tasksInPreparation', { count: totalTasks })
                : t('specification.tasksProgressCount', {
                    completed: completedCount,
                    total: totalTasks,
                  })}
            </span>
          </Typography>
        </div>

        <div className="flex items-center gap-3">
          {selectedTasks.size > 0 ? (
            <span className="text-body-xs text-content-muted">
              {t('specification.selectedTasksCount', { count: selectedTasks.size })}
            </span>
          ) : null}
          <Button
            size="sm"
            disabled={selectedTasks.size === 0}
            onClick={() => runtime.executeTasks(Array.from(selectedTasks))}
          >
            {t('specification.executeWithAgent')}
          </Button>
        </div>
      </div>

      {isPreparing ? (
        <Typography variant="body-sm" className="mt-2 text-content-secondary">
          {t('specification.tasksPreparingNotice')}
        </Typography>
      ) : null}

      <div className="mt-4 grid gap-4">
        {taskGroups.map((group) => {
          const isCollapsed = collapsedGroups.has(group.id);

          return (
            <div key={group.id} className="grid gap-1">
              <TaskGroupHeader
                name={group.name}
                count={group.tasks.length}
                isCollapsed={isCollapsed}
                tone={getGroupTone(group)}
                onToggle={() => toggleGroup(group.id)}
              />

              {!isCollapsed ? (
                <InformationList selectable>
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
    </section>
  );
}
