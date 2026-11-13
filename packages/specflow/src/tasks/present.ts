import type { ExecutionInspection, TaskResourceResult } from '@nevo/specflow-engine';

import { positionLine } from '../workflow/present';

type InspectedTask = ExecutionInspection['tasks'][number];

function stateOf(task: InspectedTask): string {
  const { readiness } = task;
  if (readiness.kind === 'status') {
    return readiness.status;
  }

  return readiness.kind === 'dependencies'
    ? `waits for ${readiness.waitingFor.join(', ')}`
    : 'ready';
}

/** One line per Task, in index order, then the Tasks whose files are broken. */
export function listLines(inspection: ExecutionInspection): string[] {
  const lines = inspection.tasks.map(
    (task) =>
      `${task.record.taskId}  ${task.record.status}  ${positionLine(task.record.run?.position ?? { state: 'not-started' })}  ${task.record.title}`,
  );
  for (const taskId of inspection.brokenTasks) {
    lines.push(`${taskId}  broken (restore its files from Git)`);
  }

  return lines.length > 0 ? lines : ['No Tasks.'];
}

export function taskDetailLines(task: InspectedTask): string[] {
  const { record } = task;

  return [
    `Task: ${record.taskId}`,
    `Title: ${record.title}`,
    ...(record.summary !== undefined ? [`Summary: ${record.summary}`] : []),
    `Type: ${record.type}`,
    `Status: ${record.status}${record.statusChange?.reason ? ` (${record.statusChange.reason})` : ''}`,
    `State: ${stateOf(task)}`,
    `Position: ${positionLine(record.run?.position ?? { state: 'not-started' })}`,
    `Depends on: ${record.dependsOn.length > 0 ? record.dependsOn.join(', ') : 'none'}`,
    `Revision: ${task.revision}`,
    ...(task.handoff?.feedback ? [`Handoff: ${task.handoff.feedback}`] : []),
    ...(task.definitionChanged ? ['Workflow: its pinned definition changed'] : []),
  ];
}

/** The answer of create and edit: the Task and the revision the next edit or removal names. */
export function resourceLines(verb: string, result: TaskResourceResult): string[] {
  return [
    `${verb}: Task ${result.task.taskId} (${result.task.status})`,
    `Revision: ${result.revision}`,
  ];
}
