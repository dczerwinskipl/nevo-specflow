import type { ContinuationDecision, FinishingSession } from '../continuation/resolve';
import { WorkflowError } from '../errors';
import { assertExecutorAllowed } from '../progression/executor';
import { applyFinish, planFinish, type FinishInput } from '../progression/progression';
import { materializeTasks, type TaskProposal } from '../tasks/tasks';
import {
  activeAttempt,
  type ExecutorRecord,
  type RunPosition,
  type WorkflowSubject,
} from '../state/model';
import { advance, applyEffects, settleWait, type AdvanceContext } from './advance';
import { isoNow, loadSubject, type WorkflowDependencies } from './loaded-execution';
import { ExecutionWorkingSet } from './working-set';

export interface FinishStepInput {
  readonly subject: WorkflowSubject;
  /** The attempt the caller worked on; a stale caller never completes a newer attempt. */
  readonly step: string;
  readonly attempt: number;
  readonly input: FinishInput & {
    /** Required by, and only allowed for, a step that produces Tasks. */
    readonly tasks?: readonly TaskProposal[];
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
  /** When a Task's end completed the Specification's wait step: what the Specification does next. */
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
 */
export function finishStep(
  dependencies: WorkflowDependencies,
  request: FinishStepInput,
): Promise<FinishStepResult> {
  return dependencies.serialize(async () => {
    const { subject } = request;
    const snapshot = await dependencies.store.read(subject.specId);
    const loaded = loadSubject(dependencies.catalogue, snapshot, subject);
    const plan = planFinish(loaded.run, loaded.definition, request, request.input);
    if (plan.step.kind === 'wait-for-tasks') {
      throw new WorkflowError(
        'WORKFLOW_POSITION_INVALID',
        'A wait step is completed by the Engine.',
      );
    }

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

    const context: AdvanceContext = {
      set: new ExecutionWorkingSet(snapshot),
      catalogue: dependencies.catalogue,
      at: isoNow(dependencies),
    };
    context.set.setRun(
      subject,
      applyFinish(loaded.run, plan, request.input, context.at, request.executor),
    );
    const createdTasks = produces ? createTasks(context, request, plan.attempt) : [];
    applyEffects(context, plan.transition.effects);
    const continuation = advance(
      context,
      subject,
      loaded.definition,
      plan.transition,
      finishingSession(request.executor),
    );
    const specification =
      subject.kind === 'task' && plan.next.state === 'terminal' ? settleWait(context) : undefined;
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

function createTasks(context: AdvanceContext, request: FinishStepInput, attempt: number): string[] {
  const specification = context.set.specification();
  const created = materializeTasks({
    specId: specification.specId,
    proposals: request.input.tasks ?? [],
    existing: context.set.tasks(),
    allowedTypes: specification.taskTypes,
    taskType: (id) => context.catalogue.taskType(id),
    workflow: (id) => context.catalogue.workflow(id),
    origin: { step: request.step, attempt },
  });
  for (const task of created) {
    context.set.setTask(task);
  }

  return created.map((task) => task.taskId);
}
