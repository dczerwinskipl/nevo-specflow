import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button } from '@nevo/ui';
import { NewTaskDialog } from '../../authoring/NewTaskDialog';
import { useSpecificationActions } from '../../authoring/useTaskAuthoring';
import { TasksSection, type TasksSectionProps } from './TasksSection';

/**
 * The Tasks section of a project Runtime: the Specification projection decides whether a Task may
 * be created (`specification.createTask`) and with which task types; New task opens the dialog.
 */
export function ProjectTasksSection({
  specId,
  specTitle,
  ...props
}: Omit<TasksSectionProps, 'onNewTask'> & { readonly specId: string; readonly specTitle: string }) {
  const { t } = useTranslation();
  const actions = useSpecificationActions(specId);
  const [open, setOpen] = useState(false);
  const specification = actions.data?.specification;
  const tasks = props.taskGroups.flatMap((group) => group.tasks);

  return (
    <>
      {actions.isError ? (
        <Alert
          className="mb-3"
          tone="attention"
          title={t('taskAuthoring.tasks.actionsFailed')}
          actions={
            <Button size="sm" variant="secondary" onClick={() => void actions.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : null}
      <TasksSection
        {...props}
        onNewTask={specification?.createTask.kind === 'allowed' ? () => setOpen(true) : undefined}
      />
      {specification ? (
        <NewTaskDialog
          specId={specId}
          specTitle={specTitle}
          open={open}
          onOpenChange={setOpen}
          taskTypes={specification.taskTypes}
          tasks={tasks.map((task) => ({ id: task.id, title: task.title }))}
        />
      ) : null}
    </>
  );
}
