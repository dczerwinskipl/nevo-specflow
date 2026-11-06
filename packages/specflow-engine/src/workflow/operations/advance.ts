import type { WorkflowEffect } from '@nevo/specflow-contracts/documents';

import type { ExecutionCatalogue } from '../definitions/catalogue';
import { findStep, type WorkflowDefinition, type WorkflowTransition } from '../definitions/model';
import {
  resolveContinuation,
  type ContinuationDecision,
  type FinishingSession,
} from '../continuation/resolve';
import { WorkflowError } from '../errors';
import {
  applyFinish,
  applyStart,
  planStart,
  planWaitFinish,
  type FinishInput,
  type FinishPlan,
} from '../progression/progression';
import { allTasksClosed, applyTaskEffects, isTaskEscalated, tasksStuck } from '../tasks/tasks';
import type { TaskRecord, WorkflowRun, WorkflowSubject } from '../state/model';
import { pinnedDefinitionIfUnchanged } from './loaded-execution';
import type { ExecutionWorkingSet } from './working-set';

/**
 * What happens to a subject right after its position moved (a finish or a return) or a Task status
 * changed: Task effects, entering and settling a wait step, and the continuation decision with its
 * attention item. All of it lands in the same working set, so it becomes durable in one change.
 */

export interface AdvanceContext {
  readonly set: ExecutionWorkingSet;
  readonly catalogue: ExecutionCatalogue;
  readonly at: string;
}

/**
 * Store a Task whose status may have changed. A Task that is not `ready` loses its attention item:
 * none of its steps can start until a decision makes it `ready` again.
 */
export function updateTask(context: AdvanceContext, task: TaskRecord): void {
  context.set.setTask(task);
  if (task.status !== 'ready') {
    context.set.clearAttention({ kind: 'task', specId: task.specId, taskId: task.taskId });
  }
}

/** Apply the declared Task effects of a Specification transition or return. */
export function applyEffects(context: AdvanceContext, effects: readonly WorkflowEffect[]): void {
  for (const task of applyTaskEffects(context.set.tasks(), effects)) {
    updateTask(context, task);
  }
}

/** Record the decision as the subject's attention item, or clear the item when none is needed. */
export function recordDecision(
  context: AdvanceContext,
  subject: WorkflowSubject,
  decision: ContinuationDecision,
): void {
  if (decision.kind !== 'attention') {
    context.set.clearAttention(subject);

    return;
  }

  context.set.setAttention({
    subject,
    step: decision.step,
    reason: decision.reason,
    ...(decision.taskIds !== undefined ? { taskIds: decision.taskIds } : {}),
    ...(decision.archetype !== undefined ? { archetype: decision.archetype } : {}),
    ...(decision.provider !== undefined ? { provider: decision.provider } : {}),
    ...(decision.blocker !== undefined ? { blocker: decision.blocker } : {}),
    ...(decision.suggestion !== undefined ? { suggestion: decision.suggestion } : {}),
    createdAt: context.at,
  });
}

/**
 * Decide what follows the subject's current position. A wait step has no work and no executor, so
 * entering it is part of the transition that leads there; it completes as soon as every Task is
 * closed, which can be immediately. A wait step is never entered while a Task is still `draft` or
 * on hold by its own escalation: every Task must be approved or cancelled, and every escalation
 * resolved, before implementation is handed over, so that change is refused.
 */
export function advance(
  context: AdvanceContext,
  subject: WorkflowSubject,
  definition: WorkflowDefinition,
  transition: WorkflowTransition | undefined,
  finishing: FinishingSession | undefined,
): ContinuationDecision {
  const position = context.set.run(subject).position;
  const next = position.state === 'ready' ? findStep(definition, position.step) : undefined;
  if (next?.kind === 'wait-for-tasks') {
    assertTasksDecided(context, next.id);
    const run = context.set.run(subject);
    context.set.setRun(subject, applyStart(run, planStart(run, definition), { at: context.at }));
    const settled = settleWait(context);
    if (settled) {
      return settled;
    }
  }

  const decision = resolveContinuation({
    ...(transition ? { transition } : {}),
    ...(next ? { next } : {}),
    archetypes: (id) => context.catalogue.archetype(id),
    ...(finishing ? { finishing } : {}),
  });
  recordDecision(context, subject, decision);

  return decision;
}

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
function escalationFeedback(escalated: readonly TaskRecord[]): string {
  return `Escalated Tasks: ${escalated.map((task) => task.taskId).join(', ')}. Each Task's escalation feedback is in its status change.`;
}

/** Complete the active wait step with the planned transition and decide what follows. */
function completeWait(
  context: AdvanceContext,
  subject: WorkflowSubject,
  definition: WorkflowDefinition,
  run: WorkflowRun,
  plan: FinishPlan,
  input: FinishInput,
): ContinuationDecision {
  context.set.setRun(subject, applyFinish(run, plan, input, context.at));
  applyEffects(context, plan.transition.effects);

  return advance(context, subject, definition, plan.transition, undefined);
}

/**
 * Settle the Specification's active wait step. A Task escalated (on hold by its own escalation)
 * takes the declared `task-escalated` transition, with the escalated Tasks named in the handoff;
 * otherwise the wait completes with `tasks-finished` when every Task is closed (terminal or
 * cancelled, also when there is no Task). Returns the Specification's decision, or `undefined` when
 * the Specification is not waiting.
 *
 * It runs inside a Task's finish or a Task status change, and when the wait is entered (never
 * with an escalated Task: `advance` refuses that). A Specification that is not active on its wait
 * step (for example one returned to its breakdown) is left alone, its own item included: it cannot
 * enter the wait step again until the escalation is resolved. So is one whose pinned workflow
 * changed: the Task's change succeeds and the next Specification operation fails with
 * `WORKFLOW_DEFINITION_CHANGED`. While Tasks are open and the workflow declares no
 * `task-escalated` transition, escalated Tasks give `task-escalated` (all of them, in id order),
 * otherwise Tasks that can no longer progress give `tasks-stuck`.
 */
export function settleWait(context: AdvanceContext): ContinuationDecision | undefined {
  const subject: WorkflowSubject = {
    kind: 'specification',
    specId: context.set.specification().specId,
  };
  const run = context.set.run(subject);
  const position = run.position;
  if (position.state !== 'active') {
    return undefined;
  }

  const definition = pinnedDefinitionIfUnchanged(context.catalogue, run);
  if (!definition || findStep(definition, position.step)?.kind !== 'wait-for-tasks') {
    return undefined;
  }

  const tasks = context.set.tasks();
  const escalated = tasks
    .filter(isTaskEscalated)
    .sort((left, right) => (left.taskId < right.taskId ? -1 : 1));
  if (escalated.length > 0) {
    const input = { feedback: escalationFeedback(escalated) };
    const plan = planWaitFinish(run, definition, 'task-escalated', input);
    if (plan) {
      return completeWait(context, subject, definition, run, plan, input);
    }
  }

  if (!allTasksClosed(tasks)) {
    const decision: ContinuationDecision =
      escalated.length > 0
        ? {
            kind: 'attention',
            step: position.step,
            reason: 'task-escalated',
            taskIds: escalated.map((task) => task.taskId),
          }
        : tasksStuck(tasks)
          ? { kind: 'attention', step: position.step, reason: 'tasks-stuck' }
          : { kind: 'none', reason: 'waiting-for-tasks' };
    recordDecision(context, subject, decision);

    return decision;
  }

  const plan = planWaitFinish(run, definition, 'tasks-finished', {});
  if (!plan) {
    throw new WorkflowError(
      'WORKFLOW_STATE_CORRUPT',
      'The wait step has no tasks-finished transition.',
    );
  }

  return completeWait(context, subject, definition, run, plan, {});
}
