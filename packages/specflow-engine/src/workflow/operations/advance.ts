import type { WorkflowEffect } from '@nevo/specflow-contracts/documents';

import type { ExecutionCatalogue } from '../definitions/catalogue';
import { findStep, type WorkflowDefinition, type WorkflowTransition } from '../definitions/model';
import {
  resolveContinuation,
  type ContinuationDecision,
  type FinishingSession,
} from '../continuation/resolve';
import { applyFinish, applyStart, planFinish, planStart } from '../progression/progression';
import { allTasksClosed, applyTaskEffects, isTaskEscalated, tasksStuck } from '../tasks/tasks';
import type { TaskRecord, WorkflowSubject } from '../state/model';
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
    ...(decision.taskId !== undefined ? { taskId: decision.taskId } : {}),
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
 * closed, which can be immediately.
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

/** The attention item of an escalation: names the first escalated Task (in Task id order). */
function escalation(context: AdvanceContext, step: string): ContinuationDecision | undefined {
  const escalated = context.set
    .tasks()
    .filter(isTaskEscalated)
    .map((task) => task.taskId)
    .sort()[0];

  return escalated === undefined
    ? undefined
    : { kind: 'attention', step, reason: 'task-escalated', taskId: escalated };
}

/**
 * Complete the Specification's active wait step when every Task is closed: terminal or cancelled
 * (also when there is no Task). Returns the Specification's decision, or `undefined` when the
 * Specification is not waiting.
 *
 * It runs inside a Task's finish or a Task status change and never fails it. A Specification that is
 * not active on its wait step (for example one returned to its breakdown) is left alone, its own
 * item included: an escalation is recorded only on the wait step, and entering the wait step later
 * records it. So is one whose pinned workflow changed: the Task's change succeeds and the next
 * Specification operation fails with `WORKFLOW_DEFINITION_CHANGED`. While Tasks are open, an
 * escalated Task gives `task-escalated`, otherwise Tasks that can no longer progress give
 * `tasks-stuck`.
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
  if (!allTasksClosed(tasks)) {
    const decision: ContinuationDecision =
      escalation(context, position.step) ??
      (tasksStuck(tasks)
        ? { kind: 'attention', step: position.step, reason: 'tasks-stuck' }
        : { kind: 'none', reason: 'waiting-for-tasks' });
    recordDecision(context, subject, decision);

    return decision;
  }

  const plan = planFinish(run, definition, position, {});
  context.set.setRun(subject, applyFinish(run, plan, {}, context.at));
  applyEffects(context, plan.transition.effects);

  return advance(context, subject, definition, plan.transition, undefined);
}
