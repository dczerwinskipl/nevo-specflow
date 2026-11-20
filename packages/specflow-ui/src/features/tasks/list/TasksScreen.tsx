import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button } from '@nevo/ui';
import type { SpecificationWorkspaceData } from '../../specs/read-model';
import { NewTaskDialog } from '../authoring/NewTaskDialog';
import { useSpecificationActions } from '../read-model';
import { emptyTasks } from '../overview/tasksStepLine';
import { TasksPage } from './TasksPage';
import { useTaskListState } from './useTaskListState';

export interface TasksScreenProps {
  readonly specId: string;
  readonly collection: 'current' | 'archive';
  readonly data: SpecificationWorkspaceData;
  readonly blocking: boolean;
  readonly group?: string;
  readonly fullTaskHref: (taskId: string) => string;
  readonly onOpenTask: (taskId: string) => void;
  readonly onClearFilter: () => void;
}

/**
 * The Tasks page of a Specification with its data and New task: the Specification projection
 * decides whether a Task may be created (`specification.createTask`) and with which types (a
 * current Specification).
 */
export function TasksScreen({
  specId,
  collection,
  data,
  blocking,
  group,
  fullTaskHref,
  onOpenTask,
  onClearFilter,
}: TasksScreenProps) {
  const { t } = useTranslation();
  // One filter at a time (the route keeps them apart): blocking, else a group.
  const state = useTaskListState(
    specId,
    blocking ? { blocking: 'specification' } : group ? { group } : {},
  );
  const actions = useSpecificationActions(specId, collection === 'current');
  const [open, setOpen] = useState(false);
  const specification = actions.data?.specification;
  // The same empty line as the Overview's Tasks.
  const empty = emptyTasks(t, actions.data);

  return (
    <>
      <TasksPage
        state={state}
        blocking={blocking}
        {...(group ? { group } : {})}
        fullTaskHref={fullTaskHref}
        onOpenTask={onOpenTask}
        onClearFilter={onClearFilter}
        specificationTitle={data.title}
        empty={empty}
        {...(specification?.createTask.kind === 'allowed'
          ? { onNewTask: () => setOpen(true) }
          : {})}
        notice={
          actions.isError ? (
            <Alert
              tone="attention"
              title={t('taskAuthoring.tasks.actionsFailed')}
              actions={
                <Button size="sm" variant="secondary" onClick={() => void actions.refetch()}>
                  {t('common.retry')}
                </Button>
              }
            />
          ) : null
        }
      />
      {specification ? (
        <NewTaskDialog
          specId={specId}
          specTitle={data.title}
          open={open}
          onOpenChange={setOpen}
          taskTypes={specification.taskTypes}
          tasks={data.taskGroups.flatMap((taskGroup) =>
            taskGroup.tasks.map((task) => ({ id: task.id, title: task.title })),
          )}
        />
      ) : null}
    </>
  );
}
