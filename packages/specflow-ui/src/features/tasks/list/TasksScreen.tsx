import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button } from '@nevo/ui';
import { useRuntimeMode } from '../../../app/useRuntimeMode';
import type { SpecificationWorkspaceData } from '../../specs/read-model';
import { NewTaskDialog } from '../authoring/NewTaskDialog';
import { useSpecificationActions } from '../authoring/useTaskAuthoring';
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
  readonly onClearBlocking: () => void;
}

/**
 * The Tasks page of a Specification with its data and New task: the Specification projection
 * decides whether a Task may be created (`specification.createTask`) and with which types (project
 * Runtime, current Specification).
 */
export function TasksScreen({
  specId,
  collection,
  data,
  blocking,
  group,
  fullTaskHref,
  onOpenTask,
  onClearBlocking,
}: TasksScreenProps) {
  const { t } = useTranslation();
  const project = useRuntimeMode() === 'project';
  const state = useTaskListState(
    specId,
    blocking,
    project ? { kind: 'project' } : { kind: 'workspace', data },
  );
  const actions = useSpecificationActions(specId, project && collection === 'current');
  const [open, setOpen] = useState(false);
  const specification = actions.data?.specification;

  return (
    <>
      <TasksPage
        state={state}
        blocking={blocking}
        {...(group ? { group } : {})}
        fullTaskHref={fullTaskHref}
        onOpenTask={onOpenTask}
        onClearBlocking={onClearBlocking}
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
