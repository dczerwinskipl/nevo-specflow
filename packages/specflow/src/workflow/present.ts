import type {
  ActionPosition,
  ActionProjection,
  ContinuationDecision,
  FinishStepResult,
  ReturnToStepResult,
  RunPosition,
  StartBlocker,
  StartResult,
  WorkflowSubject,
} from '@nevo/specflow-engine';

/** `Task <id>` or `Specification`: the subject as a person reads it. */
export function subjectLabel(subject: WorkflowSubject): string {
  return subject.kind === 'task' ? `Task ${subject.taskId}` : 'Specification';
}

export function positionLine(position: RunPosition): string {
  switch (position.state) {
    case 'not-started':
      return 'not started';
    case 'active':
      return `active on "${position.step}" (attempt ${position.attempt})`;
    case 'ready':
      return `ready to start "${position.step}"`;
    case 'terminal':
      return `ended: ${position.outcome}`;
  }
}

export function continuationLine(decision: ContinuationDecision): string {
  switch (decision.kind) {
    case 'none':
      return `nothing follows (${decision.reason})`;
    case 'continue':
      return `an agent may continue with "${decision.step}"`;
    case 'attention':
      return `needs the owner: "${decision.step}" (${decision.reason})`;
  }
}

function blockerLine(blocker: StartBlocker): string {
  switch (blocker.kind) {
    case 'status':
      return `the Task is ${blocker.status}`;
    case 'dependencies':
      return `waits for ${blocker.waitingFor.join(', ')}`;
    case 'broken':
      return `the Task files are broken (${blocker.reason})`;
    case 'definition-changed':
      return `the workflow "${blocker.pinned.id}" changed or is gone`;
    case 'type-not-allowed':
    case 'definition-missing':
    case 'not-configured':
      return blocker.message;
    case 'context-unresolved':
      return `required context does not resolve (entries ${blocker.entries.map((entry) => entry.index).join(', ')})`;
  }
}

function positionLines(position: ActionPosition): string[] {
  switch (position.kind) {
    case 'not-started':
      return [
        `State: not started; a first start pins ${position.preview.workflowId} (revision ${position.preview.revision})`,
        `Next step: ${position.next.step.id}`,
      ];
    case 'ready':
      return [`State: ready`, `Next step: ${position.next.step.id}`];
    case 'active':
      return [
        `State: active on "${position.step.id}" (attempt ${position.attempt.number})`,
        `Worked by: ${position.attempt.actor.class}`,
      ];
    case 'waiting':
      return [
        `State: waiting on "${position.step.id}" for ${position.blockingTasks.count} of ${position.totalTasks} Tasks`,
        ...(position.attention ? [`Attention: ${position.attention.reason}`] : []),
      ];
    case 'blocked':
      return [
        'State: blocked',
        ...position.blockers.map((blocker) => `Blocked: ${blockerLine(blocker)}`),
      ];
    case 'terminal':
      return [`State: ended (${position.outcome})`];
  }
}

/** The action projection as the owner reads it; only what is allowed is listed as an action. */
export function actionLines(projection: ActionProjection): string[] {
  const lines = [`${subjectLabel(projection.subject)}`];
  if (projection.workflow) {
    lines.push(
      `Workflow: ${projection.workflow.workflowId} (revision ${projection.workflow.revision})`,
    );
  }

  lines.push(...positionLines(projection.position));
  const { start, finish, return: back } = projection.actions;
  if (start) {
    lines.push(
      `Action: start "${start.step}"` +
        (start.expectedWorkflowRevision
          ? ` (--expected-workflow-revision ${start.expectedWorkflowRevision})`
          : ''),
    );
  }

  if (finish) {
    for (const transition of finish.transitions) {
      lines.push(
        `Action: finish "${finish.step}" attempt ${finish.attempt}` +
          (transition.result !== undefined ? ` --result ${transition.result}` : '') +
          ` (${transition.id}${transition.feedback === 'required' ? ', feedback required' : ''}` +
          `${transition.unavailable ? `, unavailable: ${transition.unavailable}` : ''})`,
      );
    }
  }

  for (const target of back?.targets ?? []) {
    lines.push(
      `Action: return to "${target.step}"${target.feedback === 'required' ? ' (reason required)' : ''}`,
    );
  }

  if (projection.task) {
    const open = (['approve', 'hold', 'resume', 'cancel', 'remove'] as const).filter(
      (action) => projection.task?.[action].kind === 'allowed',
    );
    lines.push(`Task actions: ${open.length > 0 ? open.join(', ') : 'none'}`);
  }

  return lines;
}

export function startLines(result: StartResult): string[] {
  if (result.kind === 'terminal') {
    return [`${subjectLabel(result.subject)} has ended; nothing to start.`];
  }

  const { context } = result;
  const lines = [
    `${result.kind === 'resumed' ? 'Resumed' : 'Started'}: ${subjectLabel(result.subject)}, step "${context.step.id}" (attempt ${context.attempt})`,
    `Purpose: ${context.step.purpose}`,
  ];
  for (const transition of context.finish.transitions) {
    lines.push(
      `Finish with: ${transition.result !== undefined ? `--result ${transition.result}` : '(no result)'}` +
        ` -> ${transition.id}${transition.feedback === 'required' ? ' (feedback required)' : ''}`,
    );
  }

  return lines;
}

export function finishLines(result: FinishStepResult): string[] {
  return [
    `${result.replayed ? 'Already finished' : 'Finished'}: ${subjectLabel(result.subject)} via "${result.transition}"`,
    `Position: ${positionLine(result.position)}`,
    `Next: ${continuationLine(result.continuation)}`,
    ...(result.createdTasks.length > 0 ? [`Drafted Tasks: ${result.createdTasks.join(', ')}`] : []),
    ...(result.specification ? [`Specification: ${continuationLine(result.specification)}`] : []),
  ];
}

export function returnLines(result: ReturnToStepResult): string[] {
  return [
    `Returned: ${subjectLabel(result.subject)}`,
    `Position: ${positionLine(result.position)}`,
    `Next: ${continuationLine(result.continuation)}`,
  ];
}
