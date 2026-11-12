import {
  decide,
  findStep,
  lastArrival,
  type DeclaredEffect,
  type WorkflowDecision,
  type WorkflowIntent,
} from '@nevo/workflow';
import type { ExecutionCatalogue } from '../definitions/catalogue';
import type { SpecFlowAnnotations, WorkflowDefinition } from '../definitions/model';
import { resolveContinuation, type ContinuationDecision } from '../continuation/resolve';
import { WorkflowError } from '../errors';
import { allTasksClosed, applyTaskEffects, isTaskEscalated, tasksStuck } from '../tasks/tasks';
import type { ExecutionTask, WorkflowActor, WorkflowRun, WorkflowSubject } from '../state/model';
import { finishingSession } from './actors';
import { pinnedDefinitionIfUnchanged } from './loaded-execution';
import type { ExecutionWorkingSet } from './working-set';

/**
 * The SpecFlow side of a coordinator decision: Task effects, the Task events that settle a wait
 * step, and the continuation decision. All of it lands in the same working set, so it becomes
 * durable in one change. The decisions are derived from the planned state ({@link continuationOf},
 * {@link waitDecision}), exactly as inspection derives attention, so an operation's result and a
 * later inspection agree.
 */

export type Decision = WorkflowDecision<SpecFlowAnnotations, WorkflowActor>;

export interface AdvanceContext {
  readonly set: ExecutionWorkingSet;
  readonly catalogue: ExecutionCatalogue;
  readonly at: string;
}

/** Apply the declared Task effects of the transitions and returns a decision took. */
export function applyEffects(
  context: AdvanceContext,
  declared: readonly DeclaredEffect<SpecFlowAnnotations>[],
): void {
  for (const effect of declared) {
    const effects =
      effect.source === 'transition'
        ? effect.transition.annotations.effects
        : effect.entry.annotations.effects;
    for (const task of applyTaskEffects(context.set.tasks(), effects)) {
      context.set.setTask(task);
    }
  }
}

/**
 * What follows a `ready` or `terminal` run, from its last event: after a finished attempt, its
 * transition and the Session that finished it (none when a person finished it, so a `reuse`
 * continuation reports `session-unavailable`); after an owner return, an owner action. The
 * archetypes are the current ones. Pure.
 */
export function continuationOf(
  run: WorkflowRun,
  definition: WorkflowDefinition,
  catalogue: ExecutionCatalogue,
): ContinuationDecision {
  const position = run.position;
  if (position.state === 'terminal') {
    return { kind: 'none', reason: 'terminal' };
  }

  if (position.state !== 'ready') {
    throw new WorkflowError('WORKFLOW_POSITION_INVALID', 'No step is ready to start.');
  }

  const next = findStep(definition, position.step);
  if (!next) {
    throw new WorkflowError(
      'WORKFLOW_STATE_CORRUPT',
      `The run refers to an unknown step "${position.step}".`,
    );
  }

  const arrival = lastArrival(run, definition);
  const transition = arrival?.kind === 'transition' ? arrival.transition : undefined;
  const finishing =
    arrival?.kind === 'transition' ? finishingSession(arrival.finishedBy) : undefined;

  return resolveContinuation({
    ...(transition ? { transition } : {}),
    next,
    archetypes: (id) => catalogue.archetype(id),
    ...(finishing ? { finishing } : {}),
  });
}

/**
 * Decide what follows the subject's decision. A transition into a wait step entered it (the core
 * does that, a wait step has no work); it completes as soon as every Task is closed, which can be
 * immediately. A wait step is never entered while a Task is still `draft` or on hold by its own
 * escalation: every Task must be approved or cancelled, and every escalation resolved, before
 * implementation is handed over, so that change is refused.
 */
export function advance(
  context: AdvanceContext,
  subject: WorkflowSubject,
  definition: WorkflowDefinition,
  intent: WorkflowIntent,
): ContinuationDecision {
  if (intent.kind === 'await-event') {
    assertTasksDecided(context, intent.step);

    return settleWait(context) ?? { kind: 'none', reason: 'waiting-for-tasks' };
  }

  return continuationOf(context.set.run(subject), definition, context.catalogue);
}

const escalatedTasks = (tasks: readonly ExecutionTask[]) =>
  tasks.filter(isTaskEscalated).sort((left, right) => (left.taskId < right.taskId ? -1 : 1));

/** Checked on the state the change would produce, before anything is written. */
function assertTasksDecided(context: AdvanceContext, step: string): void {
  const tasks = [...context.set.tasks()].sort((left, right) =>
    left.taskId < right.taskId ? -1 : 1,
  );
  const drafts = tasks.filter((task) => task.status === 'draft').map((task) => task.taskId);
  const escalated = tasks.filter(isTaskEscalated).map((task) => task.taskId);
  const problems = [
    ...(drafts.length > 0 ? [`Tasks still draft: ${drafts.join(', ')}`] : []),
    ...(escalated.length > 0 ? [`Tasks escalated: ${escalated.join(', ')}`] : []),
  ];
  if (problems.length > 0) {
    throw new WorkflowError(
      'WORKFLOW_INPUT_INVALID',
      `Cannot enter the wait step "${step}": ${problems.join('; ')}.`,
    );
  }
}

/**
 * The handoff of a `task-escalated` transition: the escalated Tasks by id. Each Task's feedback is
 * in its status change, which the next step sees in its context; the text stays far below the
 * stored feedback limit.
 */
function escalationFeedback(escalated: readonly ExecutionTask[]): string {
  return `Escalated Tasks: ${escalated.map((task) => task.taskId).join(', ')}. Each Task's escalation feedback is in its status change.`;
}

/** Record the wait step's completion and decide what follows. */
function completeWait(
  context: AdvanceContext,
  subject: WorkflowSubject,
  definition: WorkflowDefinition,
  decision: Decision,
): ContinuationDecision {
  context.set.setRun(subject, decision.nextRun);
  applyEffects(context, decision.declaredEffects);

  return advance(context, subject, definition, decision.intent);
}

/**
 * What a Specification active on its wait step needs: escalated Tasks give `task-escalated` (all of
 * them, in id order), otherwise Tasks that can no longer progress (broken Tasks included), or no open
 * Task at all, give `tasks-stuck`; else it waits. Pure.
 */
export function waitDecision(
  step: string,
  tasks: readonly ExecutionTask[],
  broken: readonly string[],
): ContinuationDecision {
  const escalated = escalatedTasks(tasks);
  if (escalated.length > 0) {
    return {
      kind: 'attention',
      step,
      reason: 'task-escalated',
      taskIds: escalated.map((task) => task.taskId),
    };
  }

  // Every Task closed while the wait is still active only happens when a Task file changed outside
  // the Engine (for example a restored record): no Task event will complete the wait any more.
  return tasksStuck(tasks, broken) || allTasksClosed(tasks, broken)
    ? { kind: 'attention', step, reason: 'tasks-stuck' }
    : { kind: 'none', reason: 'waiting-for-tasks' };
}

/**
 * Settle the Specification's active wait step with a Task event. A Task escalated (on hold by its
 * own escalation) is the event `task-escalated`, with the escalated Tasks named in the handoff;
 * otherwise every Task closed (terminal or cancelled, also when there is no Task; a broken Task is
 * never closed) is the event `tasks-finished`. Returns the Specification's decision, or `undefined`
 * when the Specification is not waiting.
 *
 * It runs inside a Task's finish or a Task status change, and when the wait is entered (never
 * with an escalated Task: `advance` refuses that). A Specification without a run (Tasks run without
 * one) is left alone, and so is one that is not active on its wait step (for example one returned
 * to its breakdown): it cannot enter the wait step again until the escalation is resolved. So is one
 * whose pinned workflow changed: the Task's
 * change succeeds and the next Specification operation fails with `WORKFLOW_DEFINITION_CHANGED`.
 * While Tasks are open, see {@link waitDecision}.
 */
export function settleWait(context: AdvanceContext): ContinuationDecision | undefined {
  const specification = context.set.startedSpecification();
  if (!specification) {
    return undefined;
  }

  const subject: WorkflowSubject = { kind: 'specification', specId: specification.specId };
  const run = context.set.run(subject);
  const position = run.position;
  if (position.state !== 'active') {
    return undefined;
  }

  const definition = pinnedDefinitionIfUnchanged(context.catalogue, run);
  if (!definition || findStep(definition, position.step)?.kind !== 'wait') {
    return undefined;
  }

  const tasks = context.set.tasks();
  const broken = context.set.brokenTasks();
  const escalated = escalatedTasks(tasks);
  if (escalated.length > 0) {
    const decision = decide(definition, run, {
      kind: 'event',
      at: context.at,
      name: 'task-escalated',
      feedback: escalationFeedback(escalated),
    });
    // A wait step that declares no `task-escalated` transition keeps waiting with attention.
    if (decision.declaredEffects.length > 0) {
      return completeWait(context, subject, definition, decision);
    }
  }

  if (!allTasksClosed(tasks, broken)) {
    return waitDecision(position.step, tasks, broken);
  }

  const decision = decide(definition, run, {
    kind: 'event',
    at: context.at,
    name: 'tasks-finished',
  });
  if (decision.declaredEffects.length === 0) {
    throw new WorkflowError(
      'WORKFLOW_STATE_CORRUPT',
      'The wait step has no tasks-finished transition.',
    );
  }

  return completeWait(context, subject, definition, decision);
}
