import { useState } from 'react';
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
  const actions = useSpecificationActions(specId);
  const [open, setOpen] = useState(false);
  const specification = actions.data?.specification;
  const tasks = props.taskGroups.flatMap((group) => group.tasks);

  return (
    <>
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
