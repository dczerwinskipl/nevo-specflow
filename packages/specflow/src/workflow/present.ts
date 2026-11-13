import type {
  AbandonSpecificationResult,
  ActionPosition,
  ActionProjection,
  CloseBlocker,
  ContinuationDecision,
  FinishStepResult,
  GateStatus,
  ReturnToStepResult,
  RunPosition,
  SpecificationExitActions,
  StartBlocker,
  StartResult,
  StartableStep,
  WorkflowSubject,
} from '@nevo/specflow-engine';

/** A step as a person reads it: `Title (id)`, or the id alone when there is no title. */
export function named(step: { readonly id: string; readonly title?: string }): string {
  return step.title !== undefined && step.title !== '' ? `${step.title} (${step.id})` : step.id;
}

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
    case 'context-awaited':
      return `awaits process artifacts that do not exist yet (entries ${blocker.entries.map((entry) => entry.index).join(', ')})`;
    case 'gates-unsatisfied':
      return `entry gates do not hold: ${blocker.gates.map((gate) => gate.id).join(', ')}`;
  }
}

/** Where a gate looked, as a person reads it. */
function scopeLabel(gate: GateStatus): string {
  return gate.scope.kind === 'task' ? `Task ${gate.scope.taskId}` : 'Specification';
}

/** One gate with its status: `[x]` satisfied, `[ ]` not, and why. */
export function gateLine(gate: GateStatus): string {
  const why =
    gate.status === 'satisfied'
      ? ` (document ${gate.documentId ?? '?'})`
      : gate.reason === 'sections-missing'
        ? ` (document ${gate.documentId ?? '?'} lacks: ${(gate.missingSections ?? []).join(', ')})`
        : ` (${gate.reason ?? 'unsatisfied'})`;

  return `[${gate.status === 'satisfied' ? 'x' : ' '}] gate ${gate.id}: ${gate.label}, ${gate.documentType} in ${scopeLabel(gate)}${why}`;
}

function entryGateLines(next: StartableStep | undefined): string[] {
  return (next?.entryGates ?? []).map((gate) => `  ${gateLine(gate)}`);
}

function positionLines(position: ActionPosition): string[] {
  switch (position.kind) {
    case 'not-started':
      return [
        `State: not started; a first start pins ${position.preview.workflowId} (revision ${position.preview.revision})`,
        `Next step: ${named(position.next.step)}`,
        ...entryGateLines(position.next),
      ];
    case 'ready':
      return [
        `State: ready`,
        `Next step: ${named(position.next.step)}`,
        ...entryGateLines(position.next),
      ];
    case 'active':
      return [
        `State: active on ${named(position.step)} (attempt ${position.attempt.number})`,
        `Worked by: ${position.attempt.actor.class}`,
      ];
    case 'waiting':
      return [
        `State: waiting on ${named(position.step)} for ${position.blockingTasks.count} of ${position.totalTasks} Tasks`,
        ...(position.attention ? [`Attention: ${position.attention.reason}`] : []),
      ];
    case 'blocked':
      return [
        'State: blocked',
        ...position.blockers.map((blocker) => `Blocked: ${blockerLine(blocker)}`),
        ...(position.next ? [`Next step: ${named(position.next.step)}`] : []),
        ...entryGateLines(position.next),
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
          ` (${transition.id}${transition.targetTitle !== undefined ? `, to ${transition.targetTitle}` : ''}` +
          `${transition.feedback === 'required' ? ', feedback required' : ''}` +
          `${transition.unavailable ? `, unavailable: ${transition.unavailable}` : ''})`,
      );
      lines.push(...(transition.gates ?? []).map((gate) => `  ${gateLine(gate)}`));
    }
  }

  for (const target of back?.targets ?? []) {
    lines.push(
      `Action: return to ${named({ id: target.step, title: target.title })}${target.feedback === 'required' ? ' (reason required)' : ''}`,
    );
  }

  if (projection.task) {
    const open = (['approve', 'hold', 'resume', 'cancel', 'remove'] as const).filter(
      (action) => projection.task?.[action].kind === 'allowed',
    );
    lines.push(`Task actions: ${open.length > 0 ? open.join(', ') : 'none'}`);
  }

  const exit = projection.specification?.exit;
  if (exit) {
    lines.push(...exitLines(exit));
  }

  return lines;
}

function blockerLines(blockers: readonly CloseBlocker[]): string[] {
  return blockers.map(
    (blocker) => `  held by ${blocker.kind} (${blocker.subjectIds.join(', ')}): ${blocker.message}`,
  );
}

/** Close and Abandon of a Specification as the owner reads them, with what holds each. */
export function exitLines(exit: SpecificationExitActions): string[] {
  const { close, abandon } = exit;

  return [
    close.kind === 'allowed'
      ? 'Close: allowed (Git and workspace rules are checked by the close itself)'
      : 'Close: blocked',
    ...(close.kind === 'blocked' ? blockerLines(close.blockers) : []),
    abandon.kind === 'allowed'
      ? 'Abandon: allowed ("specs abandon <spec-id> --reason <text> --yes")'
      : abandon.kind === 'blocked'
        ? 'Abandon: blocked'
        : `Abandon: unavailable (${abandon.reason})`,
    ...(abandon.kind === 'blocked' ? blockerLines(abandon.blockers) : []),
  ];
}

export function abandonLines(result: AbandonSpecificationResult): string[] {
  const list = (ids: readonly string[]) => (ids.length > 0 ? ids.join(', ') : 'none');

  return [
    `Abandoned: Specification ${result.specId}`,
    `Reason: ${result.abandonment.reason}`,
    `Cancelled Tasks: ${list(result.cancelledTasks)}`,
    `Ended Task runs: ${list(result.abandonedTaskRuns)}`,
  ];
}

export function startLines(result: StartResult): string[] {
  if (result.kind === 'terminal') {
    return [`${subjectLabel(result.subject)} has ended; nothing to start.`];
  }

  const { context } = result;
  const lines = [
    `${result.kind === 'resumed' ? 'Resumed' : 'Started'}: ${subjectLabel(result.subject)}, step ${named(context.step)} (attempt ${context.attempt})`,
    `Purpose: ${context.step.purpose}`,
  ];
  for (const transition of context.finish.transitions) {
    lines.push(
      `Finish with: ${transition.result !== undefined ? `--result ${transition.result}` : '(no result)'}` +
        ` -> ${transition.id}${transition.targetTitle !== undefined ? ` (to ${transition.targetTitle})` : ''}` +
        `${transition.feedback === 'required' ? ' (feedback required)' : ''}`,
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
    // The finish is recorded either way; a failed post action (the commit of the state) is shown.
    ...(result.postActions ?? []).flatMap((post) =>
      post.status === 'failed'
        ? [`Post action ${post.action} failed: ${post.code} ${post.message}`]
        : [],
    ),
  ];
}

export function returnLines(result: ReturnToStepResult): string[] {
  return [
    `Returned: ${subjectLabel(result.subject)}`,
    `Position: ${positionLine(result.position)}`,
    `Next: ${continuationLine(result.continuation)}`,
  ];
}
