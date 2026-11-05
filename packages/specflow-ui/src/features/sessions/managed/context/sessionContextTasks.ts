import type { SessionContextTaskRef, SessionContextViewModel } from './sessionContextTypes';

/** Every Task the view model references (current execution, Attention, Related), once each. */
export function collectTasks(value: SessionContextViewModel): SessionContextTaskRef[] {
  const tasks = new Map<string, SessionContextTaskRef>();
  const add = (task: SessionContextTaskRef) => tasks.set(task.id, task);
  const execution =
    value.executionScope?.status === 'ready' ? value.executionScope.value : undefined;
  if (execution?.kind === 'single-task') {
    add(execution.task);
  } else if (execution?.kind === 'batch') {
    execution.tasks.forEach(add);
  }

  if (value.attention?.status === 'ready') {
    value.attention.value.forEach((item) => item.task && add(item.task));
  }

  if (value.relatedTasks?.status === 'ready') {
    value.relatedTasks.value.forEach(add);
  }

  return [...tasks.values()];
}
