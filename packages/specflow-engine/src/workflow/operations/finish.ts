import type { ContinuationDecision, FinishingSession } from '../continuation/resolve';
import { WorkflowError } from '../errors';
import { assertFinishInputShape } from '../input-schema';
import { assertExecutorAllowed } from '../progression/executor';
import { applyFinish, planFinish, type FinishInput } from '../progression/progression';
import {
  applyTaskDecisions,
  materializeTasks,
  type TaskDecision,
  type TaskProposal,
} from '../tasks/tasks';
import {
  activeAttempt,
  type ExecutorRecord,
  type RunPosition,
  type WorkflowSubject,
} from '../state/model';
import { advance, applyEffects, settleWait, updateTask, type AdvanceContext } from './advance';
import { isoNow, loadSubject, type WorkflowDependencies } from './loaded-execution';
import { ExecutionWorkingSet } from './working-set';

export interface FinishStepInput {
  readonly subject: WorkflowSubject;
  /** The attempt the caller worked on; a stale caller never completes a newer attempt. */
  readonly step: string;
  readonly attempt: number;
  readonly input: FinishInput & {
    /**
     * Required by, and only allowed for, a step that produces Tasks: the complete list of the
     * Specification's draft Tasks after this finish (`materializeTasks`).
     */
    readonly tasks?: readonly TaskProposal[];
    /**
     * Only for a Specification step: explicit status decisions on its Tasks, applied after `tasks`
     * and before the transition's effects. One decision that is not allowed rejects the finish.
     */
    readonly taskDecisions?: readonly TaskDecision[];
  };
  /**
   * Who finished, from trusted Runtime/CLI context (never an agent-supplied value). Its kind must be
   * the step's, and an agent attempt started in a Session is finished by that Session only.
   */
  readonly executor: ExecutorRecord;
}

export interface FinishStepResult {
  readonly subject: WorkflowSubject;
  readonly transition: string;
  readonly position: RunPosition;
  readonly continuation: ContinuationDecision;
  readonly createdTasks: readonly string[];
  /**
   * After a Task's finish, what the Specification's attention became: what it does next when the
   * finish completed its wait step or took its `task-escalated` transition, `tasks-stuck`, or
   * `task-escalated` (listing every escalated Task).
   */
  readonly specification?: ContinuationDecision;
}

function finishingSession(executor: ExecutorRecord): FinishingSession | undefined {
  if (executor.kind !== 'agent') {
    return undefined;
  }

  return {
    provider: executor.provider,
    ...(executor.sessionId !== undefined ? { sessionId: executor.sessionId } : {}),
  };
}

/**
 * Finish the active attempt of a subject and decide what follows. Finish never starts the next step
 * (except entering a wait step, which has no work); it records whether the Runtime may continue on
 * its own or the owner has to act.
 *
 * A Task transition that escalates puts the Task on hold with the feedback as its reason; a
 * Specification waiting for its Tasks takes its `task-escalated` transition, or gets the attention
 * item `task-escalated` when it declares none. The finish itself succeeds. A Specification finish
 * that would enter a wait step while a Task is `draft` or escalated is refused (`advance`). A Task that is
 * not `ready` after its finish gets no continuation (`none {on-hold}`) and no attention item.
 */
export function finishStep(
  dependencies: WorkflowDependencies,
  request: FinishStepInput,
): Promise<FinishStepResult> {
  return dependencies.serialize(async () => {
    assertFinishInputShape(request.input);
    const { subject } = request;
    const snapshot = await dependencies.store.read(subject.specId);
    const loaded = loadSubject(dependencies.catalogue, snapshot, subject);
    const plan = planFinish(loaded.run, loaded.definition, request, request.input);
    assertExecutorAllowed(plan.step, request.executor, activeAttempt(loaded.run));

    const produces = plan.step.produces === 'tasks';
    if (produces !== (request.input.tasks !== undefined)) {
      throw new WorkflowError(
        'WORKFLOW_INPUT_INVALID',
        produces
          ? `The step "${plan.step.id}" finishes with the list of Tasks it produced.`
          : `The step "${plan.step.id}" does not produce Tasks.`,
      );
    }

    if (subject.kind === 'task' && request.input.taskDecisions !== undefined) {
      throw new WorkflowError(
        'WORKFLOW_INPUT_INVALID',
        'Only a Specification step decides the status of Tasks.',
      );
    }

    const context: AdvanceContext = {
      set: new ExecutionWorkingSet(snapshot),
      catalogue: dependencies.catalogue,
      at: isoNow(dependencies),
    };
    context.set.setRun(
      subject,
      applyFinish(loaded.run, plan, request.input, context.at, request.executor),
    );
    const createdTasks = produces ? draftTasks(context, request, plan.attempt) : [];
    for (const task of applyTaskDecisions(
      context.set.tasks(),
      request.input.taskDecisions ?? [],
      context.at,
    )) {
      updateTask(context, task);
    }

    applyEffects(context, plan.transition.effects);
    if (subject.kind === 'task' && plan.transition.escalate) {
      const feedback = request.input.feedback?.trim();
      updateTask(context, {
        ...context.set.task(subject.taskId),
        status: 'on-hold',
        statusChange: {
          source: 'escalation',
          at: context.at,
          ...(feedback ? { reason: feedback } : {}),
        },
      });
    }

    const held =
      subject.kind === 'task' &&
      plan.next.state !== 'terminal' &&
      context.set.task(subject.taskId).status !== 'ready';
    const continuation: ContinuationDecision = held
      ? { kind: 'none', reason: 'on-hold' }
      : advance(
          context,
          subject,
          loaded.definition,
          plan.transition,
          finishingSession(request.executor),
        );
    const specification = subject.kind === 'task' ? settleWait(context) : undefined;
    await dependencies.store.apply(subject.specId, context.set.change());

    return {
      subject,
      transition: plan.transition.id,
      position: context.set.run(subject).position,
      continuation,
      createdTasks,
      ...(specification && specification.kind !== 'none' ? { specification } : {}),
    };
  });
}

function draftTasks(
  context: AdvanceContext,
  request: FinishStepInput,
  attempt: number,
): readonly string[] {
  const specification = context.set.specification();
  const drafted = materializeTasks({
    specId: specification.specId,
    proposals: request.input.tasks ?? [],
    existing: context.set.tasks(),
    allowedTypes: specification.taskTypes,
    taskType: (id) => context.catalogue.taskType(id),
    workflow: (id) => context.catalogue.workflow(id),
    origin: { step: request.step, attempt },
    at: context.at,
  });
  for (const task of drafted.changed) {
    updateTask(context, task);
  }

  return drafted.created;
}
