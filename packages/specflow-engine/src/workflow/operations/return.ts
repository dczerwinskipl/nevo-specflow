import type { ContinuationDecision } from '../continuation/resolve';
import { WorkflowError } from '../errors';
import { assertOwner } from '../progression/executor';
import { applyReturn, planReturn } from '../progression/progression';
import type { ExecutorRecord, RunPosition, WorkflowSubject } from '../state/model';
import { advance, applyEffects, type AdvanceContext } from './advance';
import { isoNow, loadSubject, type WorkflowDependencies } from './loaded-execution';
import { ExecutionWorkingSet } from './working-set';

export interface ReturnToStepInput {
  readonly subject: WorkflowSubject;
  /** A step the workflow declares as a return target and the run has already reached. */
  readonly step: string;
  /** What changed; carried to the step as its handoff. */
  readonly feedback?: string;
  /** The owner, from trusted Runtime/CLI context; a return is an owner action. */
  readonly executor: ExecutorRecord;
}

export interface ReturnToStepResult {
  readonly subject: WorkflowSubject;
  readonly position: RunPosition;
  readonly continuation: ContinuationDecision;
}

/**
 * "Back to the table": move a run to a declared step it has already reached (earlier work, never a
 * step ahead) from any non-terminal position, also while the Specification waits for its Tasks. The
 * return's declared effects (by default none) apply in the same change; a return never changes a
 * Task's status by itself. A return is an owner action: it names the owner as its executor (anything
 * else is refused with `WORKFLOW_EXECUTOR_NOT_ALLOWED`), and what follows always waits for the owner.
 *
 * Only a `ready` Task returns: a Task on hold or cancelled cannot start, so its return would leave it
 * waiting for an owner start that is refused.
 *
 * An attempt that was active ends as `returned`; stopping a Session still working on it is the
 * Runtime's responsibility.
 */
export function returnToStep(
  dependencies: WorkflowDependencies,
  request: ReturnToStepInput,
): Promise<ReturnToStepResult> {
  return dependencies.serialize(async () => {
    assertOwner(request.executor, 'returns a run to an earlier step');
    const { subject } = request;
    const snapshot = await dependencies.store.read(subject.specId);
    const loaded = loadSubject(dependencies.catalogue, snapshot, subject);
    if (loaded.task && loaded.task.status !== 'ready') {
      throw new WorkflowError(
        'WORKFLOW_TASK_BLOCKED',
        `The Task "${loaded.task.taskId}" is ${loaded.task.status}; only a ready Task can return.`,
      );
    }

    const entry = planReturn(loaded.run, loaded.definition, request.step, request.feedback);
    const context: AdvanceContext = {
      set: new ExecutionWorkingSet(snapshot),
      catalogue: dependencies.catalogue,
      at: isoNow(dependencies),
    };
    context.set.setRun(subject, applyReturn(loaded.run, entry, request.feedback, context.at));
    applyEffects(context, entry.effects);
    const continuation = advance(context, subject, loaded.definition);
    await dependencies.store.apply(subject.specId, context.set.change());

    return { subject, position: context.set.run(subject).position, continuation };
  });
}
