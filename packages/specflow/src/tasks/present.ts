import type {
  ExecutionInspection,
  ExecutionReading,
  TaskFacts,
  TaskResourceResult,
} from '@nevo/specflow-engine';

import { attentionLine, positionLine, subjectLabel } from '../workflow/present';

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

/** Whether the next step can start, or what keeps it: the neutral facts, never a group. */
function startLine(facts: TaskFacts | undefined): string {
  if (!facts || facts.position.state === 'active' || facts.position.state === 'terminal') {
    return '';
  }

  if (facts.startable) {
    return '  can start';
  }

  const kinds = facts.startBlockers.map((blocker) =>
    blocker.kind === 'dependencies' ? `waits for ${blocker.waitingFor.join(', ')}` : blocker.kind,
  );

  return `  cannot start: ${kinds.join('; ')}`;
}

/**
 * One line per Task, in index order, with its status, position and whether it can start, then the
 * Tasks whose files are broken, then every attention item.
 */
export function listLines(reading: ExecutionReading): string[] {
  const { inspection } = reading;
  const lines = inspection.tasks.map(
    (task) =>
      `${task.record.taskId}  ${task.record.status}  ${positionLine(task.record.run?.position ?? { state: 'not-started' })}${startLine(reading.facts.get(task.record.taskId))}  ${task.record.title}`,
  );
  for (const taskId of inspection.brokenTasks) {
    lines.push(`${taskId}  broken (restore its files from Git)`);
  }

  if (lines.length === 0) {
    return ['No Tasks.'];
  }

  return [
    ...lines,
    ...reading.attention.map((item) => `${subjectLabel(item.subject)}: ${attentionLine(item)}`),
  ];
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
